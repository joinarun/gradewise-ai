import assert from 'node:assert/strict';
import test from 'node:test';
import packFixture from '../../rubrics/roots.v1.json' with { type: 'json' };
import { approvePack, parseModelJson, validateGrade, validatePack } from './contracts.ts';
import { evaluateAnswer, generatePack, type Inference, type EvaluationOptions } from './engine.ts';

const pack = validatePack(packFixture);
const question = pack.questions[0];
const answer = 'Roots take water from the soil and keep the plant fixed.';
const correct = {
  marks: 2, explanation: 'Both expected concepts are present.',
  criteria: [
    { criterionId: 'absorption', marks: 1, evidence: 'take water from the soil' },
    { criterionId: 'anchoring', marks: 1, evidence: 'keep the plant fixed' },
  ],
  uncertain: false,
};
const options: EvaluationOptions = { policy: 'prefer-device', cloudConsent: true, online: true };

function inference(script: Partial<Record<'device' | 'cloud', unknown>>, configured = true) {
  const calls: string[] = [];
  const adapter: Inference = {
    cloudConfigured: configured,
    async deviceAvailability() { return 'available'; },
    async initializeDevice() {},
    async generate(source, kind, prompt, constraints) {
      if (source === 'device' && kind === 'grade') {
        assert.deepEqual(constraints?.criterionIds, ['absorption', 'anchoring']);
        assert.match(prompt, /criteria object must contain all these keys/);
      }
      calls.push(`${source}:${kind}`);
      assert.match(prompt, /INPUT\n\{/);
      const value = script[source];
      if (value instanceof Error) throw value;
      return { source, text: typeof value === 'string' ? value : JSON.stringify(value) };
    },
  };
  return { adapter, calls };
}

test('pack approval validates marks and preserves exam metadata', () => {
  assert.equal(approvePack(pack).exam.maxMarks, 4);
  const bad = structuredClone(pack);
  bad.questions[0].criteria[0].maxMarks = 0.5;
  assert.throws(() => validatePack(bad), /inconsistent/);
  bad.questions[0].criteria[0].maxMarks = 1;
  bad.questions[1].id = bad.questions[0].id;
  assert.throws(() => validatePack(bad), /Duplicate/);
  assert.throws(() => validatePack({ ...pack, schemaVersion: 2 }), /schemaVersion/);
  assert.throws(() => validatePack(pack, { ...pack.exam, name: 'Other' }), /differs/);
});

test('rubric generation uses a cloud-only call and records actual usage source', async () => {
  const { adapter, calls } = inference({ cloud: { questions: pack.questions } });
  const sources: string[] = [];
  const draft = await generatePack(adapter, pack.exam, 'Questions', 'Key', (attempt) => sources.push(attempt.source));
  assert.equal(draft.approvedAt, null);
  assert.deepEqual(draft.questions, pack.questions);
  assert.deepEqual(calls, ['cloud:rubric']);
  assert.deepEqual(sources, ['cloud']);
});

test('answer validation rejects unknown or missing criteria, unsupported quotes and false totals', () => {
  assert.equal(validateGrade(correct, question, answer).marks, 2);
  assert.throws(() => validateGrade({ ...correct, marks: 1 }, question, answer), /inconsistent total/);
  assert.throws(() => validateGrade({ ...correct, criteria: correct.criteria.slice(1) }, question, answer), /every criterion/);
  assert.throws(() => validateGrade({ ...correct, criteria: [correct.criteria[0], correct.criteria[0]] }, question, answer), /Duplicate/);
  const fabricated = structuredClone(correct);
  fabricated.criteria[0].evidence = 'absorbs both water and minerals';
  assert.throws(() => validateGrade(fabricated, question, answer), /missing evidence/);
  fabricated.criteria[0].evidence = '.';
  assert.throws(() => validateGrade(fabricated, question, answer), /missing evidence/);
  assert.throws(() => parseModelJson('{bad'), /valid JSON/);
});

test('a supported local result never triggers a redundant cloud call, even offline', async () => {
  const { adapter, calls } = inference({ device: correct });
  const result = await evaluateAnswer(adapter, question, answer, { ...options, online: false });
  assert.deepEqual(calls, ['device:grade']);
  assert.equal(result.status, 'provisional');
  assert.equal(result.proposed?.marks, 2);
});

test('invalid device output escalates only when allowed', async () => {
  const { adapter, calls } = inference({ device: '{}', cloud: correct });
  const result = await evaluateAnswer(adapter, question, answer, options);
  assert.deepEqual(calls, ['device:grade', 'cloud:grade']);
  assert.equal(result.status, 'provisional');
  assert.equal(result.attempts[0].source, 'device');
  assert.ok(result.attempts[0].error);
  assert.equal(result.attempts[1].source, 'cloud');
});

test('offline, consent, configuration and policy gates prevent student cloud transmission', async () => {
  for (const change of [{ online: false }, { cloudConsent: false }, { policy: 'device-only' }] as const) {
    const { adapter, calls } = inference({ device: new Error('unavailable'), cloud: correct });
    const review = await evaluateAnswer(adapter, question, answer, { ...options, ...change });
    assert.deepEqual(calls, ['device:grade']);
    assert.equal(review.status, 'policy' in change ? 'review' : 'pending');
    assert.equal(review.attempts[0].source, 'unknown');
  }
  const { adapter, calls } = inference({}, false);
  const review = await evaluateAnswer(adapter, question, answer, { ...options, policy: 'cloud-only' });
  assert.equal(review.status, 'pending');
  assert.deepEqual(calls, []);
});

test('two validated outcomes with different marks require teacher review', async () => {
  const partial = structuredClone(correct);
  partial.criteria[1] = { criterionId: 'anchoring', marks: 0, evidence: '' };
  partial.marks = 1;
  partial.uncertain = true;
  const { adapter } = inference({ device: partial, cloud: correct });
  const result = await evaluateAnswer(adapter, question, answer, options);
  assert.equal(result.status, 'review');
  assert.deepEqual(result.attempts.map((attempt) => attempt.result?.marks), [1, 2]);
  assert.match(result.warnings.join(' '), /different marks/);
});

test('cloud-first falls back locally and cloud-only never invokes the device', async () => {
  const { adapter, calls } = inference({ cloud: new Error('unavailable'), device: correct });
  const result = await evaluateAnswer(adapter, question, answer, { ...options, policy: 'cloud-first' });
  assert.deepEqual(calls, ['cloud:grade', 'device:grade']);
  assert.equal(result.status, 'provisional');
  calls.length = 0;
  await evaluateAnswer(adapter, question, answer, { ...options, policy: 'cloud-only' });
  assert.deepEqual(calls, ['cloud:grade']);
});

test('cloud uncertainty and unverified extraction go to review', async () => {
  const { adapter, calls } = inference({ cloud: { ...correct, uncertain: true }, device: correct });
  const result = await evaluateAnswer(adapter, question, answer, { ...options, policy: 'cloud-first' });
  assert.equal(result.status, 'review');
  calls.length = 0;
  assert.equal((await evaluateAnswer(adapter, question, answer, { ...options, extractionVerified: false })).status, 'review');
  assert.equal((await evaluateAnswer(adapter, question, '?', options)).status, 'review');
  assert.deepEqual(calls, []);
});

test('cloud-to-device fallback still needs affirmative cloud consent before the cloud call', async () => {
  const { adapter, calls } = inference({ cloud: correct, device: correct });
  const result = await evaluateAnswer(adapter, question, answer, { ...options, cloudConsent: false, policy: 'cloud-first' });
  assert.deepEqual(calls, ['device:grade']);
  assert.equal(result.status, 'provisional');
});

test('unconfirmed provider source cannot generate an accepted grade', async () => {
  const { adapter } = inference({ device: correct });
  adapter.generate = async () => ({ text: JSON.stringify(correct), source: 'unknown' });
  const result = await evaluateAnswer(adapter, question, answer, { ...options, policy: 'device-only' });
  assert.equal(result.status, 'review');
  assert.equal(result.proposed, undefined);
  assert.match(result.warnings[0], /did not confirm/);
});
