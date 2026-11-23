# GradeWise AI web workspace

The browser client gives teachers one local workspace for English-language examinations. React and TypeScript render the interface. The shared grading engine validates packs and evaluations and calls Firebase AI Logic. IndexedDB stores approvals, answers, attempts, review outcomes, preferences, and batch state on the current browser profile. A production service worker precaches the application shell and its bundled dependencies.

## Teacher journey

1. Create an examination with subject, class, date, maximum marks, and an optional auto-approval preference.
2. Provide the question and answer documents as text or upload TXT or a PDF with selectable text. Images and scanned pages require explicit transcription verification before use. Locally extracted text is visible and editable.
3. Generate an examination pack through Firebase AI Logic. Inspect and edit its questions, expected answers and marking criteria. Explicitly approve a valid pack before adding a batch for grading.
4. Add a single answer or import multiple papers. Match each answer against an approved question identifier, check the extraction, and add the verified batch. The same student, question and normalized content cannot be added twice.
5. Choose an inference preference and affirm permission when sending student answers to cloud AI for the current grading run. Start a batch or grade an individual answer. The browser initializes the on-device model from a user gesture.
6. Observe progress, pause between answers, and retry pending or flagged answers. Save each result as it completes. After an interruption, recover an incomplete batch from local state.
7. Inspect the question, student answer, approved rubric, every inference attempt, explanation, evidence and warnings. A teacher can approve, modify or reject the score. Auto-approval applies only to a valid provisional evaluation.
8. View student results and export finalized marks as CSV. View inference and benchmark metrics computed from stored observations and configurable token pricing.

## Acceptance checks

- A new examination survives reload, and an unapproved pack blocks grading.
- A development fixture can open a synthetic examination offline. Its sample answer references are visible and any real inference results are recorded only after SDK calls complete.
- Checked uploads attach to their chosen questions, duplicate uploads are skipped, and ambiguous numbering can be corrected before import.
- Cloud consent expires after each run. Pending evaluations remain available to retry after connectivity returns.
- Every accepted or overridden score remains within the approved rubric bounds and appears in the finalized CSV. CSV cells containing text cannot execute spreadsheet formulas.
- The application opens offline after the service worker finishes caching it. The status indicator distinguishes network connectivity from model availability and response source.

## Local verification

Run from the repository root:

```sh
npm run build --workspace @gradewise/web
npm run test --workspace @gradewise/web
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e --workspace @gradewise/web
```

Leave `PLAYWRIGHT_CHANNEL` unset if Playwright Chromium is installed in place of desktop Chrome. The browser suite starts a preview of the production build. It covers the exam setup, text extraction, image verification, student import, manual finalization and export, offline reload, review queue persistence, phone viewport, and the consent gate for browsers without a device model. The production code uses the Firebase AI Logic SDK for inference. The offline and consent checks exercise unavailable device models, and the browser suite can run without a Firebase project. The separate inference feasibility checks are required for live model verification.

The synthetic sample has a preapproved rubric and benchmark reference marks. It begins without simulated AI grades or usage statistics. Its observations can be selected in Insights without affecting teacher workspace totals. Screenshots under `screenshots/` show the local application with this dataset.
