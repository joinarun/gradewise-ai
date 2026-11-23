import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as hold } from 'node:timers/promises';

const output = process.env.GRADEWISE_RECORDING_DIR || 'artifacts/demo';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const size = { width: 1280, height: 800 };

try {
  const context = await browser.newContext({
    viewport: size,
    recordVideo: { dir: output, size },
  });
  const page = await context.newPage();
  const video = page.video();
  await page.goto(process.env.GRADEWISE_DEMO_URL || 'http://localhost:4173/');
  await expect(page.getByRole('heading', { name: 'Assessment overview' })).toBeVisible();
  await hold(3_000);
  await page.getByRole('button', { name: 'Explore a sample' }).click();
  await expect(page.getByRole('heading', { name: 'Grading intelligence pack' })).toBeVisible();
  await hold(4_000);
  await page.getByRole('button', { name: 'Open student answers' }).click();
  await hold(2_500);
  await page.getByRole('link', { name: 'Review', exact: true }).first().click();
  await hold(4_000);
  await page.getByLabel('Final marks').fill('1.5');
  await page.getByLabel('Teacher note').fill('Checked against the sample marking criteria.');
  await page.getByRole('button', { name: 'Finalize marks' }).click();
  await expect(page.getByText('Final score saved.')).toBeVisible();
  await hold(3_000);
  await page.getByRole('link', { name: 'Back to student answers' }).click();
  await page.getByRole('link', { name: 'Class results' }).click();
  await hold(4_000);
  const transfer = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export finalized CSV' }).click();
  await transfer;
  await context.close();
  const rawPath = await video.path();
  const path = join(output, 'teacher-review.webm');
  await video.saveAs(path);
  if (rawPath !== path) {
    const { rm } = await import('node:fs/promises');
    await rm(rawPath);
  }
  console.log(path);
} finally {
  await browser.close();
}
