import { chromium } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mode = process.argv[2] || 'device';
if (!['device', 'cloud', 'cloud-smoke', 'app-check'].includes(mode)) {
  throw new Error('Choose device, cloud, cloud-smoke or app-check.');
}
const url = process.env.GRADEWISE_PROOF_URL || 'http://127.0.0.1:4175';
const output = process.env.GRADEWISE_BENCHMARK_OUTPUT;
const secretFile = process.env.GRADEWISE_APPCHECK_TOKEN_FILE;
const debugToken = secretFile ? (await readFile(secretFile, 'utf8')).trim() : undefined;
const profile = mode === 'device' ? await mkdtemp(join(tmpdir(), 'gradewise-device-profile-')) : undefined;
let browser;
let context;

try {
  if (profile) {
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
  await page.goto(url);
  const capability = page.locator('#capabilities').filter({ hasText: 'On-device model:' });
  await capability.waitFor();
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
  if (mode === 'device') {
    console.log(await capability.textContent());
    await run('#init', 300_000);
    await context.setOffline(true);
    if (await page.evaluate(() => navigator.onLine)) throw new Error('Browser did not enter offline mode.');
    const smoke = await run('#local');
    if (smoke.attempts[0]?.source !== 'device' || smoke.proposed?.marks !== 2) {
      throw new Error(`Offline device grade failed verification. ${JSON.stringify(smoke)}`);
    }
    report = { offline: smoke, benchmark: await run('#local-benchmark', 180_000) };
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
} finally {
  await context?.close();
  await browser?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
}
