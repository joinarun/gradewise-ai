# Local verification and release status

## Build and workflow checks

| Area | Observed result |
| --- | --- |
| Web | Vite production build and PWA generation with 22 precached files. 11 grading and contract unit tests, 3 web data tests, and 6 Chrome workflow tests passed. |
| Web workflow | Local PDF and TXT import, scan verification, persisted exam state, approval gate, duplicate answer detection, offline PWA reopening and queue recovery, teacher finalization, CSV download, and phone layout. |
| Consent boundary | The Chrome regression observed zero Gemini grading requests after cloud consent was declined on a browser without the Prompt API. A local-only Firebase app uses a non-network endpoint and no cloud credentials. |
| Offline Chrome inference | Chrome returned an actual Firebase on-device response. The teacher workspace displayed a provisional 2/2 for the synthetic roots answer, accepted teacher approval, and showed the finalized score after an offline reload. The observed inference took 24.6 seconds. [Offline review screenshot](../apps/web/screenshots/offline-grade.png) |
| Android | Configured debug APK and unsigned release APK built. 9 JVM unit tests and 3 Android 16 emulator tests passed. Teacher marks survived a cold restart. PNG and image-only PDF OCR passed. A cloud-only answer remained unfinalized in airplane mode. |
| iOS | Xcode arm64 iOS 26.5 simulator build and both XCTest targets compiled. The app installed and launched on the dedicated iPhone simulator. 10 Swift host checks passed using production contract, grading policy, and import/export code. The XCTest transport failed to connect to simulator services, so the native test suite did not execute. |
| App Check | Firebase JS returned a token with the registered localhost debug provider. Firebase Android returned a signed App Check token on the emulator. The iOS registered debug-token exchange returned HTTP 200 through the official API. Production reCAPTCHA Enterprise was registered for web hosting domains. |
| Firestore | The emulator denied read, list, create, update and delete operations for anonymous and authenticated clients. No production Firestore store is provisioned or used. |
| Dependency audit | npm reported zero production dependency vulnerabilities after pinning the patched gRPC library used by the Firestore package. The development PWA build tree still reports moderate glob-related advisories. |

## Live inference

The configured Spark project is `gradewise-ai-2026`. Billing is disabled. The Firebase web, Android and iOS registrations and App Check setup exist. Firebase Console requires account approval of the Gemini Developer API terms to enable the provider. Until that step occurs, the cloud rubric, cloud grade and production App Check against a deployed site are unverified.

Chrome ran a genuine offline inference using a downloaded on-device model. Early benchmark runs exposed missing criteria and inconsistent model totals, which the app routed to review. Required criterion fields and deterministic sum calculation addressed those output issues. The Android emulator reported Gemini Nano unavailable. No compatible physical Android phone or iPhone was attached for native local model verification.

The Firebase AI Logic and Gemini Developer API endpoints are disabled. The temporary App Check debug registrations were revoked after the attestation checks. Cloud model agreement and API savings are unmeasured.

## Synthetic offline benchmark

Chrome ran six genuine on-device evaluations while offline. Three yielded validated scores and all three matched the teacher reference. The other three were routed to review because of response-schema or evidence failures. The malformed entry was routed to review before inference. Mean latency across the six completed attempts was 4.68 seconds. The separate cold single-answer smoke took 23.71 seconds. There were zero cloud inference calls in these offline runs.

| Synthetic case | Teacher reference | GradeWise outcome |
| --- | --- | --- |
| Correct roots paraphrase | 2 | Provisional 2 |
| Partial roots answer | 1 | Review due to unexpected response fields |
| Incorrect roots answer | 0 | Provisional 0 |
| Ambiguous roots answer | 1 | Review due to missing support for an awarded criterion |
| Malformed entry | No score | Review before inference |
| Correct evaporation answer | 2 | Provisional 2 |
| Partial evaporation answer | 1 | Review due to unexpected response fields |

This small benchmark measures agreement and response validation on the included synthetic cases. Half of the cases with teacher marks had a validated model proposal.

## Release gates

- Live cloud rubric generation, grading and consented fallback after Gemini enablement.
- Native local inference on supported physical Android and iOS hardware.
- Firebase Hosting release, hosted smoke test and production App Check verification.
- Mobile signing for production devices and iOS/TestFlight distribution, if needed.
- Public GitHub repository creation and push after explicit approval and account access.
- Capture remaining demo footage and upload a public YouTube video before submitting through Devpost.

The local teacher-review clip uses the synthetic sample and verified UI. It contains rubric inspection, teacher scoring, and export footage. The [recording plan](HACKATHON_SUBMISSION.md) identifies shots that depend on live model verification.
