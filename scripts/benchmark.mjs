import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const mode = process.argv[2] || 'device';
if (!['device', 'workspace', 'cloud', 'cloud-smoke', 'app-check'].includes(mode)) {
  throw new Error('Choose device, workspace, cloud, cloud-smoke or app-check.');
}
const url = process.env.GRADEWISE_PROOF_URL || 'http://127.0.0.1:4175';
const output = process.env.GRADEWISE_BENCHMARK_OUTPUT;
const secretFile = process.env.GRADEWISE_APPCHECK_TOKEN_FILE;
const debugToken = secretFile ? (await readFile(secretFile, 'utf8')).trim() : undefined;
const keepModel = mode === 'workspace' || process.env.GRADEWISE_KEEP_MODEL === 'true';
const profile = (mode === 'device' || mode === 'workspace') ? (keepModel
  ? resolve('.playwright/gradewise-device-profile')
  : await mkdtemp(join(tmpdir(), 'gradewise-device-profile-'))) : undefined;
let browser;
let context;

try {
  if (profile) {
    await mkdir(profile, { recursive: true });
    // Playwright's default Chrome arguments disable the model download.
    // Use a disposable Chrome profile without those default arguments.
    context = await chromium.launchPersistentContext(profile, {
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
    context = await browser.newContext();
  }
  if (debugToken) {
    await context.addInitScript((token) => {
      globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = token;
    }, debugToken);
  }
  const page = context.pages()[0] ?? await context.newPage();
  if (mode === 'workspace') {
    const workspace = new URL(process.env.GRADEWISE_WORKSPACE_URL || 'http://localhost:4173/');
    const session = await context.newCDPSession(page);
    await session.send('Storage.clearDataForOrigin', { origin: workspace.origin, storageTypes: 'all' });
    await session.detach();
    await page.goto(workspace.href);
  } else {
    await page.goto(url);
  }
  const capability = page.locator('#capabilities').filter({ hasText: 'On-device model:' });
  if (mode !== 'workspace') await capability.waitFor();
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

async function checkWorkspaceOffline(context, page) {
  await page.getByRole('button', { name: 'Explore a sample' }).click();
  await page.getByRole('button', { name: 'Open student answers' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Grade S-01 Q1', exact: true }).click();
  const consent = page.getByRole('dialog', { name: 'Permission for cloud evaluation' });
  if (await consent.isVisible()) await consent.getByRole('button', { name: 'Continue without cloud' }).click();
  await expect(page.getByText('Batch complete. 1 of 1 queued answers checked.')).toBeVisible({ timeout: 90_000 });

  const answer = page.getByRole('row').filter({ hasText: 'Roots take water from the soil' });
  await answer.getByRole('link', { name: 'Review' }).click();
  await expect(page.getByText('On-device', { exact: true })).toBeVisible();
  await expect(page.getByText('Proposed score 2 / 2')).toBeVisible();
  if (process.env.GRADEWISE_WORKSPACE_SCREENSHOT) {
    await page.screenshot({ path: process.env.GRADEWISE_WORKSPACE_SCREENSHOT, fullPage: true });
  }
  await page.getByRole('button', { name: 'Approve 2 / 2', exact: true }).click();
  await expect(page.getByText('Final score saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Final score 2 / 2')).toBeVisible();
  return { offline: true, source: 'device', proposedMarks: 2, finalizedMarks: 2 };
}
