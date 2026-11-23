import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

function questionPdf() {
  const content = "BT /F1 12 Tf 35 150 Td (1. Identify a leaf function.) Tj ET";
  const entries = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = entries.map((value, index) => {
    const offset = source.length;
    source += `${index + 1} 0 obj\n${value}\nendobj\n`;
    return offset;
  });
  return Buffer.from(source + `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${source.length}\n%%EOF\n`);
}

test("creates an exam, imports local PDF and TXT, and gates grading", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New examination", exact: true }).click();
  await page.getByLabel("Examination name").fill("Leaf Functions");
  await page.getByLabel("Subject").fill("Biology");
  await page.getByLabel("Class", { exact: true }).fill("Grade 7");
  await page.getByLabel("Maximum marks").fill("2");
  await page.getByRole("dialog").getByRole("button", { name: "Create examination" }).click();
  await expect(page.getByRole("heading", { name: "Leaf Functions" })).toBeVisible();
  await page.getByLabel("Upload question paper").setInputFiles({ name: "questions.pdf", mimeType: "application/pdf", buffer: questionPdf() });
  await expect(page.getByRole("textbox", { name: "Question paper", exact: true })).toHaveValue("1. Identify a leaf function.");
  await page.getByLabel("Upload answer key").setInputFiles({ name: "answers.txt", mimeType: "text/plain", buffer: Buffer.from("1. A leaf makes sugar through photosynthesis.") });
  await page.getByRole("button", { name: "Save materials" }).click();
  await expect(page.getByText("Exam materials saved on this device.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Question paper", exact: true })).toHaveValue("1. Identify a leaf function.");
  await page.getByRole("link", { name: "Student answers" }).click();
  await expect(page.getByText("Approve a rubric before collecting answers")).toBeVisible();
});

test("checks matched answers, prevents duplicates, and exports teacher-finalized results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a sample" }).click();
  await expect(page.getByRole("heading", { name: "Grading intelligence pack" })).toBeVisible();
  await page.getByRole("button", { name: "Open student answers" }).click();
  await page.getByRole("button", { name: "Import papers", exact: true }).click();
  const file = { name: "Synthetic-42.txt", mimeType: "text/plain", buffer: Buffer.from("Q1: Roots hold the plant and take up water.\nQ2: Leaves use light to make sugar out of water and carbon dioxide.") };
  await page.getByLabel("Choose answer files").setInputFiles(file);
  await expect(page.getByRole("button", { name: "Import 2 answers" })).toBeDisabled();
  await page.getByLabel("I checked the extracted answers and question matches.").check();
  await page.getByRole("button", { name: "Import 2 answers" }).click();
  await expect(page.getByText("2 answer(s) added.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Import papers", exact: true }).click();
  await page.getByLabel("Choose answer files").setInputFiles(file);
  await page.getByLabel("I checked the extracted answers and question matches.").check();
  await page.getByRole("button", { name: "Import 2 answers" }).click();
  await expect(page.getByText("2 duplicate student and question pair(s) skipped.", { exact: false })).toBeVisible();

  await page.getByRole("row").filter({ hasText: "Synthetic-42" }).filter({ hasText: "Roots hold" }).getByRole("link", { name: "Review" }).click();
  await page.getByLabel("Final marks").fill("1.5");
  await page.getByLabel("Teacher note").fill("Checked against the marking criteria.");
  await page.getByRole("button", { name: "Finalize marks" }).click();
  await expect(page.getByText("Final score saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Final score 1.5 / 2")).toBeVisible();
  await page.getByRole("link", { name: "Back to student answers" }).click();
  await page.getByRole("link", { name: "Class results" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export finalized CSV" }).click(),
  ]);
  const path = await download.path();
  const csv = await readFile(path!, "utf8");
  expect(csv).toContain('"Synthetic-42","Q1","1.5","2"');
  expect(csv).toContain('"no","Checked against the marking criteria."');
  expect(csv).not.toContain('"Synthetic-42","Q2"');
});

test("reopens offline and preserves unresolved grading for teacher review", async ({ page, context }) => {
  await page.addInitScript(() => { Object.defineProperty(globalThis, "LanguageModel", { value: undefined, configurable: true }); });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a sample" }).click();
  await page.getByRole("button", { name: "Open student answers" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Grade queued answers" }).click();
  if (await page.getByRole("dialog", { name: "Permission for cloud evaluation" }).isVisible()) {
    await page.getByRole("button", { name: "Continue without cloud" }).click();
  }
  await expect(page.getByText("Batch complete. 8 of 8 queued answers checked.")).toBeVisible();
  await expect(page.getByText("Pending retry", { exact: true }).first()).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Review queue" }).click();
  await expect(page.getByText("8 answer(s) in the queue")).toBeVisible();
  await page.reload();
  await expect(page.getByText("8 answer(s) in the queue")).toBeVisible();
});

test.describe("cloud consent", () => {
  test.use({ serviceWorkers: "block" });
  test("blocks cloud grading without permission when the device API is missing", async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(globalThis, "LanguageModel", { value: undefined, configurable: true }); });
    let networkInferenceCalls = 0;
    await page.route(/:generateContent(?:\?|$)/i, async (route) => {
      networkInferenceCalls++;
      await route.abort();
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Explore a sample" }).click();
    await page.getByRole("button", { name: "Open student answers" }).click();
    await page.getByRole("button", { name: "Grade S-01 Q1" }).click();
    if (await page.getByRole("dialog", { name: "Permission for cloud evaluation" }).isVisible()) {
      await page.getByRole("button", { name: "Continue without cloud" }).click();
    }
    await expect(page.getByText("Batch complete. 1 of 1 queued answers checked.")).toBeVisible();
    await expect(page.getByText("Pending retry", { exact: true })).toBeVisible();
    expect(networkInferenceCalls).toBe(0);
  });
});

test("requires human verification of an uploaded scan before saving", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New examination", exact: true }).click();
  await page.getByLabel("Examination name").fill("Scan review");
  await page.getByLabel("Subject").fill("Biology");
  await page.getByLabel("Class", { exact: true }).fill("Grade 7");
  await page.getByLabel("Maximum marks").fill("1");
  await page.getByRole("dialog").getByRole("button", { name: "Create examination" }).click();
  await page.getByLabel("Upload question paper").setInputFiles({
    name: "scan.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64"),
  });
  await page.getByRole("textbox", { name: "Question paper", exact: true }).fill("1. State a function of roots.");
  await page.getByRole("textbox", { name: "Answer key", exact: true }).fill("1. Roots anchor plants.");
  await expect(page.getByRole("button", { name: "Save materials" })).toBeDisabled();
  await page.getByLabel("I verified the transcription against the original.").check();
  await page.getByRole("button", { name: "Save materials" }).click();
  await expect(page.getByText("Exam materials saved on this device.")).toBeVisible();
});

test("keeps key actions usable at a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Assessment overview" })).toBeVisible();
  const viewportFits = await page.evaluate(() => document.documentElement.scrollWidth === innerWidth);
  expect(viewportFits).toBe(true);
  await page.getByRole("button", { name: "Explore a sample" }).click();
  await page.getByRole("button", { name: "Open student answers" }).click();
  await expect(page.getByRole("heading", { name: "Student answers" })).toBeVisible();
});
