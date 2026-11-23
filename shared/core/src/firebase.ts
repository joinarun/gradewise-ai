import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getAI, getGenerativeModel, AIError, GoogleAIBackend, InferenceMode, InferenceSource, Schema, type TypedSchema } from 'firebase/ai';
import { z } from 'zod';
import { gradeSchema, parseModelJson, rubricResponseSchema } from './contracts.ts';
import { InferenceFailure, type Inference, type Receipt } from './engine.ts';

export const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite';

type PublicEnvironment = {
  DEV?: boolean;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_RECAPTCHA_SITE_KEY?: string;
  VITE_FIREBASE_APPCHECK_DEBUG?: string;
  VITE_FIREBASE_CLOUD_MODEL?: string;
};

type FirebaseInference = Inference & { verifyCloudAttestation(): Promise<void> };

const DEVICE_OPTIONS: FirebaseOptions = {
  apiKey: 'device-only-placeholder',
  appId: 'device-only-placeholder',
  projectId: 'gradewise-device-only',
};
const NO_NETWORK = { baseUrl: 'about:blank' };

function promptApi() {
  const api = (globalThis as typeof globalThis & {
    LanguageModel?: { availability?: () => Promise<string>; create?: unknown };
  }).LanguageModel;
  return api && typeof api.availability === 'function' && typeof api.create === 'function' ? api : undefined;
}

const models = new Map<string, ReturnType<typeof createClient>>();
const gradeResponse = modelSchema(z.toJSONSchema(gradeSchema));
const cloudGradeResponse = cloudSchema(z.toJSONSchema(gradeSchema));
const rubricResponse = cloudSchema(z.toJSONSchema(rubricResponseSchema));

// Firebase's schema format keeps the provider grammar small. Local contract
// validation still checks array bounds, score increments, and numeric ranges.
function cloudSchema(node: Record<string, unknown>): TypedSchema {
  switch (node.type) {
    case 'object':
      return Schema.object({
        properties: Object.fromEntries(Object.entries(node.properties as Record<string, Record<string, unknown>>)
          .map(([name, property]) => [name, cloudSchema(property)])),
      });
    case 'array': return Schema.array({ items: cloudSchema(node.items as Record<string, unknown>) });
    case 'number': return Schema.number();
    case 'string': return Schema.string();
    case 'boolean': return Schema.boolean();
    default: throw new Error('Unsupported Firebase response schema type.');
  }
}

// Keep the generation schema structural. Nested array bounds and numeric ranges
// can exceed Gemini’s grammar limits. Runtime validation enforces those bounds.
function modelSchema(value: object): Record<string, unknown> {
  const supported = new Set(['type', 'properties', 'required', 'items']);
  function visit(node: Record<string, unknown>): Record<string, unknown> {
    const fields = Object.entries(node).filter(([key]) => supported.has(key));
    return Object.fromEntries(fields.map(([key, item]) => {
      if (key === 'properties') {
        return [key, Object.fromEntries(Object.entries(item as Record<string, object>).map(
          ([name, property]) => [name, visit(property as Record<string, unknown>)],
        ))];
      }
      if (key === 'items') return [key, visit(item as Record<string, unknown>)];
      return [key, item];
    }));
  }
  return visit(value as Record<string, unknown>);
}

export function createFirebaseInference(
  env: PublicEnvironment = (import.meta as ImportMeta & { env?: PublicEnvironment }).env ?? {},
): FirebaseInference {
  const { VITE_FIREBASE_API_KEY: apiKey, VITE_FIREBASE_APP_ID: appId,
    VITE_FIREBASE_PROJECT_ID: projectId, VITE_FIREBASE_RECAPTCHA_SITE_KEY: siteKey } = env;
  const debug = Boolean(env.DEV && env.VITE_FIREBASE_APPCHECK_DEBUG === 'true');
  const cloudConfigured = Boolean(apiKey && appId && projectId && (siteKey || debug));
  const cloudModel = env.VITE_FIREBASE_CLOUD_MODEL || DEFAULT_CLOUD_MODEL;
  const key = JSON.stringify([apiKey, appId, projectId, siteKey, debug, cloudModel]);
  const existing = models.get(key);
  if (existing) return existing;

  const cloudOptions = cloudConfigured ? { apiKey, appId, projectId } : undefined;
  const client = createClient(cloudOptions, cloudModel, debug, siteKey, `gradewise-${models.size}`);
  models.set(key, client);
  return client;
}

function createClient(
  cloudOptions: FirebaseOptions | undefined, cloudModel: string, debug: boolean, siteKey: string | undefined, name: string,
): FirebaseInference {
  const cloudApp = cloudOptions ? initializeApp(cloudOptions, name) : undefined;
  const cloudConfigured = Boolean(cloudApp);
  const deviceApp = initializeApp(DEVICE_OPTIONS, { name: `${name}-device`, automaticDataCollectionEnabled: false });
  const deviceAI = getAI(deviceApp, { backend: new GoogleAIBackend() });
  let attestation: AppCheck | undefined;
  function enableAttestation() {
    if (attestation) return attestation;
    if (!cloudApp) throw new InferenceFailure('Firebase App Check is not configured.');
    if (debug) {
      const browser = globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string };
      browser.FIREBASE_APPCHECK_DEBUG_TOKEN ??= true;
    }
    attestation = initializeAppCheck(cloudApp, {
      provider: new ReCaptchaEnterpriseProvider(siteKey || 'localhost-debug'),
      isTokenAutoRefreshEnabled: true,
    });
    return attestation;
  }

  if (cloudApp) enableAttestation();
  const cloudAI = cloudApp ? getAI(cloudApp, { backend: new GoogleAIBackend() }) : undefined;

  // With no Chrome adapter, some SDK versions ignore ONLY_ON_DEVICE. Block
  // that call and use a non-network endpoint on the credential-free app.
  let device: ReturnType<typeof getGenerativeModel> | undefined;
  let image: ReturnType<typeof getGenerativeModel> | undefined;
  let deviceReady = false;
  let initialization: Promise<void> | undefined;
  const cloud = cloudAI ? {
    rubric: createCloud(cloudAI, rubricResponse, 8_192),
    grade: createCloud(cloudAI, cloudGradeResponse, 2_048),
    probe: createCloud(cloudAI, undefined, 512),
  } : undefined;
  function createCloud(ai: ReturnType<typeof getAI>, schema: TypedSchema | undefined, maxOutputTokens: number) {
    return getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: cloudModel,
        generationConfig: {
          maxOutputTokens,
          ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
        },
      },
    }, { timeout: 55_000 });
  }

  return {
    cloudConfigured,
    async verifyCloudAttestation() {
      if (!cloudConfigured) throw new InferenceFailure('Firebase App Check is not configured.');
      try {
        const result = await getToken(enableAttestation(), true);
        if (!result.token) throw new Error('Missing attestation token');
      } catch {
        throw new InferenceFailure('Firebase App Check did not return an attestation. Verify the provider registration.');
      }
    },
    async deviceAvailability() {
      try {
        return await promptApi()?.availability?.() ?? 'unavailable';
      } catch {
        return 'unavailable';
      }
    },
    initializeDevice(onProgress) {
      if (!promptApi()) return Promise.reject(new InferenceFailure('This Chrome profile does not expose the on-device model.'));
      device ??= getGenerativeModel(deviceAI, {
        mode: InferenceMode.ONLY_ON_DEVICE,
        onDeviceParams: { promptOptions: { responseConstraint: gradeResponse } },
      }, NO_NETWORK);
      initialization ??= device.initializeDeviceModel(onProgress).then(() => {
        deviceReady = true;
      }).catch((error: unknown) => {
        initialization = undefined;
        throw safeError(error, 'device');
      });
      return initialization;
    },
    async generate(source, kind, prompt, constraints): Promise<Receipt> {
      if (source === 'device') {
        if (!promptApi() || !device) throw new InferenceFailure('Enable the on-device model and wait for it to be ready.');
        await initialization;
        if (!deviceReady) throw new InferenceFailure('The on-device model is still initializing.');
      }
      const ids = source === 'device' ? constraints?.criterionIds : undefined;
      const controller = ids?.length ? new AbortController() : undefined;
      const deadline = controller ? setTimeout(() => controller.abort(), 45_000) : undefined;
      try {
        let model = source === 'device' ? device : cloud?.[kind];
        if (controller && ids) {
          const promptOptions = {
            responseConstraint: deviceGradeSchema(ids),
            signal: controller.signal,
          };
          model = getGenerativeModel(deviceAI, {
            mode: InferenceMode.ONLY_ON_DEVICE,
            onDeviceParams: { createOptions: { signal: controller.signal }, promptOptions },
          }, NO_NETWORK);
          await model.initializeDeviceModel();
        }
        if (!model) throw new InferenceFailure('Firebase App Check is not configured.');
        const { response } = await model.generateContent(prompt);
        const usage = response.usageMetadata;
        return {
          source: response.inferenceSource === InferenceSource.ON_DEVICE ? 'device'
            : response.inferenceSource === InferenceSource.IN_CLOUD ? 'cloud' : 'unknown',
          text: ids?.length ? canonicalizeDeviceGrade(response.text()) : response.text(),
          usage: usage ? {
            inputTokens: usage.promptTokenCount ?? 0,
            outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
          } : undefined,
        };
      } catch (error) {
        if (controller?.signal.aborted) throw new InferenceFailure('The on-device model exceeded its response time limit.');
        throw safeError(error, source);
      } finally {
        if (deadline !== undefined) clearTimeout(deadline);
        controller?.abort();
      }
    },
    async extractImage(bytes, mimeType) {
      if (!deviceReady || !promptApi()) throw new InferenceFailure('Enable the on-device model before transcribing an image.');
      if (!bytes.length || bytes.length > 5_000_000) throw new InferenceFailure('Choose an image under 5 MB.');
      try {
        image ??= getGenerativeModel(deviceAI, {
          mode: InferenceMode.ONLY_ON_DEVICE,
          onDeviceParams: { createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }] } },
        }, NO_NETWORK);
        await image.initializeDeviceModel();
        const { response } = await image.generateContent([
          'Transcribe visible English exam or answer text verbatim. Preserve line breaks and numbering. Use [illegible] for missing or unclear text. Return only the transcription.',
          { type: 'inlineData', inlineData: { data: encodeBase64(bytes), mimeType } },
        ]);
        if (response.inferenceSource !== InferenceSource.ON_DEVICE) {
          throw new InferenceFailure('Firebase did not confirm local image extraction.');
        }
        return response.text().trim();
      } catch (error) {
        throw safeError(error, 'device');
      }
    },
  };
}

// The smaller model can omit array entries. Required, named output fields
// keep each rubric criterion visible to constrained decoding.
function deviceGradeSchema(ids: readonly string[]) {
  const score = {
    type: 'object',
    properties: { marks: { type: 'number' }, evidence: { type: 'string' } },
    required: ['marks', 'evidence'],
  };
  const { marks: _modelTotal, ...properties } = gradeResponse.properties as Record<string, unknown>;
  return {
    type: 'object',
    properties: {
      ...properties,
      criteria: {
        type: 'object',
        properties: Object.fromEntries(ids.map((id) => [id, score])),
        required: ids,
      },
    },
    required: ['criteria', 'explanation', 'uncertain'],
  };
}

function canonicalizeDeviceGrade(text: string): string {
  try {
    const value = parseModelJson(text);
    if (!value || typeof value !== 'object' || !('criteria' in value)) return text;
    const scores = value.criteria;
    if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return text;
    const criteria = Object.entries(scores).map(([criterionId, score]) => ({ ...score, criterionId }));
    const marks = criteria.reduce((sum, score) => sum + (typeof score.marks === 'number' ? score.marks : NaN), 0);
    return JSON.stringify({ ...value, marks, criteria });
  } catch {
    return text;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 16_384) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 16_384)));
  }
  return btoa(chunks.join(''));
}

function safeError(error: unknown, source: 'device' | 'cloud'): InferenceFailure {
  if (error instanceof InferenceFailure) return error;
  if (source === 'device') return new InferenceFailure('The on-device model is unavailable or could not process this input.');
  const code = String((error as { code?: string } | undefined)?.code ?? '');
  const status = error instanceof AIError ? error.customErrorData?.status : undefined;
  if (status === 429) return new InferenceFailure('Cloud inference reached its quota. Retry when quota is available.');
  if (status && status >= 500) return new InferenceFailure('Cloud inference is temporarily unavailable. Retry this request.');
  if (status === 400) return new InferenceFailure('Gemini did not accept this inference request. Check the selected cloud model and its settings.');
  if (status === 401 || status === 403 || /appCheck|app-check|permission/i.test(code)) {
    return new InferenceFailure('Cloud inference was denied. Check Firebase App Check and project permissions.');
  }
  return new InferenceFailure('Cloud inference could not complete. Check the connection and model configuration.');
}
