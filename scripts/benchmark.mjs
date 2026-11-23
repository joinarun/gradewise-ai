import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const mode = process.argv[2] || 'device';
if (!['device', 'workspace', 'cloud-workspace', 'cloud', 'cloud-smoke', 'app-check'].includes(mode)) {
  throw new Error('Choose device, workspace, cloud-workspace, cloud, cloud-smoke or app-check.');
}
const url = process.env.GRADEWISE_PROOF_URL || 'http://127.0.0.1:4175';
const output = process.env.GRADEWISE_BENCHMARK_OUTPUT;
const secretFile = process.env.GRADEWISE_APPCHECK_TOKEN_FILE;
const debugToken = secretFile ? (await readFile(secretFile, 'utf8')).trim() : undefined;
const workspaceMode = mode === 'workspace' || mode === 'cloud-workspace';
const keepModel = mode === 'workspace' || process.env.GRADEWISE_KEEP_MODEL === 'true';
const profile = (mode === 'device' || mode === 'workspace') ? (keepModel
  ? resolve('.playwright/gradewise-device-profile')
  : await mkdtemp(join(tmpdir(), 'gradewise-device-profile-'))) : undefined;
let browser;
let context;
const recordingDirectory = process.env.GRADEWISE_WORKSPACE_VIDEO;
const viewport = { width: 1280, height: 800 };
const capture = { viewport, ...(recordingDirectory ? { recordVideo: { dir: recordingDirectory, size: viewport } } : {}) };

try {
  if (profile) {
    await mkdir(profile, { recursive: true });
    // Playwright's default Chrome arguments disable the model download.
    // Use a disposable Chrome profile without those default arguments.
    context = await chromium.launchPersistentContext(profile, {
      ...capture,
      channel: 'chrome',
      headless: false,
      ignoreDefaultArgs: true,
      args: [
        `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--no-first-run',
        '--no-default-browser-check', '--disable-search-engine-choice-screen',
        '--enable-features=AIPromptAPI,OptimizationGuideOnDeviceModel', 'about:blank',
      ],
    });
  } else {
    browser = await chromium.launch({ channel: 'chrome', headless: process.env.GRADEWISE_HEADLESS !== 'false' });
    context = await browser.newContext(capture);
  }
  if (debugToken) {
    await context.addInitScript((token) => {
      globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = token;
    }, debugToken);
  }
  if (mode === 'cloud-workspace') {
    await context.addInitScript(() => Object.defineProperty(globalThis, 'LanguageModel', {
      value: undefined, configurable: true,
    }));
  }
  const page = context.pages()[0] ?? await context.newPage();
  if (workspaceMode) {
    const workspace = new URL(process.env.GRADEWISE_WORKSPACE_URL || 'http://localhost:4173/');
    if (mode === 'workspace') {
      const session = await context.newCDPSession(page);
      await session.send('Storage.clearDataForOrigin', { origin: workspace.origin, storageTypes: 'all' });
      await session.detach();
    }
    await page.goto(workspace.href);
  } else {
    await page.goto(url);
  }
  const capability = page.locator('#capabilities').filter({ hasText: 'On-device model:' });
  if (!workspaceMode) await capability.waitFor();
  const result = page.locator('#result');

  async function run(button, timeout = 90_000) {
    const handle = await result.elementHandle();
    await page.locator(button).click();
    await page.waitForFunction(
      (element) => ['done', 'error'].includes(element.dataset.state),
      handle, { timeout },
    );
    if (await result.getAttribute('data-state') !== 'done') throw new Error(await result.textContent());
    return JSON.parse(await result.textContent());
  }

  let report;
  let failedDeviceGrade = false;
  if (mode === 'device') {
    console.log(await capability.textContent());
    await run('#init', 420_000);
    await context.setOffline(true);
    if (await page.evaluate(() => navigator.onLine)) throw new Error('Browser did not enter offline mode.');
    const smoke = await run('#local');
    if (smoke.attempts[0]?.source !== 'device') throw new Error(`No offline device response. ${JSON.stringify(smoke)}`);
    failedDeviceGrade = smoke.proposed?.marks !== 2 || smoke.status !== 'provisional';
    report = { offline: smoke };
    if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log('Offline smoke', JSON.stringify(smoke));
    report.benchmark = await run('#local-benchmark', 300_000);
  } else if (mode === 'workspace') {
    report = await checkWorkspaceOffline(context, page);
  } else if (mode === 'cloud-workspace') {
    report = await checkWorkspaceCloud(page);
  } else if (mode === 'app-check') {
    report = await run('#app-check');
  } else {
    report = mode === 'cloud-smoke' ? await run('#cloud') : await run('#cloud-benchmark', 180_000);
    if (mode === 'cloud' && !report.records.some((record) => record.attempts.some((attempt) => attempt.source === 'cloud'))) {
      throw new Error('Firebase did not report a cloud response for any benchmark answer.');
    }
  }
  const json = JSON.stringify(report, null, 2) + '\n';
  if (output) await writeFile(output, json);
  console.log(json);
  if (failedDeviceGrade) process.exitCode = 1;
} finally {
  await context?.close();
  await browser?.close();
  if (profile && !keepModel) await rm(profile, { recursive: true, force: true });
}

function holdShot() {
  return recordingDirectory ? delay(2_000) : Promise.resolve();
}

async function checkWorkspaceOffline(context, page) {
  await page.getByRole('button', { name: 'Explore a sample' }).click();
  await page.getByRole('button', { name: 'Open student answers' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  await holdShot();
  await page.getByRole('button', { name: 'Grade S-01 Q1', exact: true }).click();
  const consent = page.getByRole('dialog', { name: 'Permission for cloud evaluation' });
  if (await consent.isVisible()) await consent.getByRole('button', { name: 'Continue without cloud' }).click();
  await expect(page.getByText('Batch complete. 1 of 1 queued answers checked.')).toBeVisible({ timeout: 90_000 });

  const answer = page.getByRole('row').filter({ hasText: 'Roots take water from the soil' });
  await answer.getByRole('link', { name: 'Review' }).click();
  await expect(page.getByText('On-device', { exact: true })).toBeVisible();
  await expect(page.getByText('Proposed score 2 / 2')).toBeVisible();
  await holdShot();
  if (process.env.GRADEWISE_WORKSPACE_SCREENSHOT) {
    await page.screenshot({ path: process.env.GRADEWISE_WORKSPACE_SCREENSHOT, fullPage: true });
  }
  await page.getByRole('button', { name: 'Approve 2 / 2', exact: true }).click();
  await expect(page.getByText('Final score saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Final score 2 / 2')).toBeVisible();
  await holdShot();
  return { offline: true, source: 'device', proposedMarks: 2, finalizedMarks: 2 };
}

async function checkWorkspaceCloud(page) {
  const fixture = (name) => readFile(new URL(`../tests/fixtures/${name}`, import.meta.url), 'utf8');
  const cloudResponse = (response) =>
    new URL(response.url()).hostname === 'firebasevertexai.googleapis.com' &&
    response.request().method() === 'POST';

  await page.getByRole('button', { name: 'New examination', exact: true }).click();
  await page.getByLabel('Examination name').fill('Roots and Water');
  await page.getByLabel('Subject').fill('Science');
  await page.getByLabel('Class', { exact: true }).fill('Grade 6');
  await page.getByLabel('Maximum marks').fill('4');
  await page.getByRole('dialog').getByRole('button', { name: 'Create examination' }).click();
  await page.getByRole('textbox', { name: 'Question paper', exact: true }).fill(await fixture('question-paper.txt'));
  await page.getByRole('textbox', { name: 'Answer key', exact: true }).fill(await fixture('answer-key.txt'));

  const rubricReply = page.waitForResponse(cloudResponse, { timeout: 65_000 });
  await page.getByRole('button', { name: 'Generate grading rubric' }).click();
  await verifyCloudResponse(await rubricReply);
  await expect(page.getByText('2 questions · 4 of 4 marks · Schema v1')).toBeVisible();
  await holdShot();
  await page.getByRole('button', { name: 'Approve rubric', exact: true }).click();
  await page.getByRole('button', { name: 'Open student answers' }).click();

  await page.getByRole('button', { name: 'Add answer', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Add a student answer' });
  await form.getByLabel('Student identifier').fill('Synthetic-01');
  const question = form.locator('select[name="question"]');
  const rootsQuestion = question.locator('option').filter({ hasText: /functions? of roots/i }).first();
  const questionId = await rootsQuestion.getAttribute('value');
  if (!questionId) throw new Error('The generated pack omitted the roots question.');
  await question.selectOption(questionId);
  await form.getByLabel('Student answer').fill('Roots take water from the soil and keep the plant fixed.');
  await form.getByRole('button', { name: 'Add answer', exact: true }).click();

  await page.getByRole('button', { name: 'Grade queued answers', exact: true }).click();
  const consent = page.getByRole('dialog', { name: 'Permission for cloud evaluation' });
  await holdShot();
  await consent.getByText('I permit cloud processing for this run').click();
  const gradingReply = page.waitForResponse(cloudResponse, { timeout: 65_000 });
  await consent.getByRole('button', { name: 'Start evaluation', exact: true }).click();
  await verifyCloudResponse(await gradingReply);
  await expect(page.getByText('Batch complete. 1 of 1 queued answers checked.')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('row').filter({ hasText: 'Synthetic-01' }).getByRole('link', { name: 'Review' }).click();
  await expect(page.getByText('Cloud', { exact: true })).toBeVisible();
  await expect(page.getByText('Proposed score 2 / 2')).toBeVisible();
  await holdShot();
  if (process.env.GRADEWISE_WORKSPACE_SCREENSHOT) {
    await page.screenshot({ path: process.env.GRADEWISE_WORKSPACE_SCREENSHOT, fullPage: true });
  }
  await page.getByRole('button', { name: 'Approve 2 / 2', exact: true }).click();
  await expect(page.getByText('Final score saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Final score 2 / 2')).toBeVisible();
  await holdShot();
  return { appCheck: true, cloudRubricQuestions: 2, fallbackSource: 'cloud', proposedMarks: 2, finalizedMarks: 2 };
}

async function verifyCloudResponse(response) {
  if (!response.ok()) {
    const data = await response.json().catch(() => ({}));
    const message = String(data.error?.message ?? '').replace(/AIza[A-Za-z0-9_-]+/g, '[redacted]');
    throw new Error(`Firebase cloud HTTP ${response.status()} ${data.error?.status ?? ''} ${message}`.trim());
  }
  if (!(await response.request().headerValue('x-firebase-appcheck'))) {
    throw new Error('Firebase cloud request lacked an App Check token.');
  }
}
