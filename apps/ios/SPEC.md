# iOS platform specification

## Architecture

Build a native SwiftUI application with a Foundation-only grading contract and policy layer. The Firebase adapter uses the Gemini Developer API for rubric preparation and the Firebase Apple SDK's hybrid inference API for Apple Foundation Models and Gemini grading. PDFKit extracts selectable text. Vision extracts printed JPEG/PNG text. Every extracted document remains editable, and scanned text must be verified. Scanned PDFs can be transcribed in the same editor.

The app stores examination records, approved packs, answers, inference attempts, teacher decisions, and model settings in an atomic app-sandbox JSON file with iOS file protection and cloud backup exclusion. This gives the app a single durable state update per answer and keeps sensitive data on the device. Student names and labels are never in grading prompts. The cloud call receives the rubric and answer text only after consent for the current grading run. App Check initializes before Firebase, using the debug provider for local development and App Attest for release.

Use the native Apple SDK's supported transitional hybrid API on Xcode 26. Firebase AI Logic 12.19.3 is pinned because Firebase Apple SDK 13 removes that API. Migrating to the Foundation Models third-party Gemini adapter requires Xcode and iOS 27. The hybrid response's raw model version identifies the actual inference source. Use Foundation Models guided generation through Firebase for device grades. Cloud Gemini uses a response schema derived from the bundled shared contract.

## Acceptance criteria

1. A teacher can create or open multiple examinations, enter metadata, add question and answer-key text, and import PDF, TXT, JPEG, or PNG with a verification step.
2. A teacher can invoke live Firebase cloud rubric preparation, inspect and edit all fields of the versioned pack, and approve it only after schema validation.
3. Without Firebase configuration a teacher can load a synthetic examination and exercise local persistence, queue management, manual grading, and export. A prewritten sample rubric is identified as such. No inference output is synthesized.
4. An approved pack and verified answers are required before grading. Question IDs map imported answer text to the approved rubric. Duplicate answers within a student/question pair are detected.
5. Grading supports prefer on-device, on-device only, cloud only, and cloud first. Prefer on-device performs an on-device-only call before considering Firebase cloud. Approved cloud consent applies to one batch run. An offline cloud request remains unresolved with an explicit message.
6. Model outputs are decoded and checked for criterion completeness, rubric bounds, supported evidence, matching totals, and uncertainty. Warnings route to review or consented cloud escalation. Both attempts and conflicting results remain inspectable.
7. A teacher can pause after the active answer, resume the queue, retry unresolved answers, filter the review queue, approve or reject a proposed grade, or enter a bounded override. Auto-approval applies to validated, warning-free results only. Teacher-approved grades are exported as CSV.
8. Usage is measured from actual model responses and request timings. Estimated cloud rates are configurable; estimates identify the token basis. Synthetic references report grade agreement only when a real inference produced a score.
9. A simulator build and automated tests verify available workflows. Physical iPhone inference requires supported hardware and Apple Intelligence enabled. Cloud inference additionally requires a registered Firebase app and App Check token.

## Official references

- [Hybrid inference on Apple platforms](https://firebase.google.com/docs/ai-logic/hybrid/ios/get-started)
- [Hybrid inference configuration and source metadata](https://firebase.google.com/docs/ai-logic/hybrid/ios/configuration-options)
- [Firebase Apple SDK release notes](https://firebase.google.com/support/release-notes/ios)
- [Gemini access through Apple's Foundation Models framework](https://firebase.google.com/docs/ai-logic/apple-foundation-models-framework/get-started)
- [Firebase App Check debug provider](https://firebase.google.com/docs/app-check/ios/debug-provider)
