# Local verification and release status

## Build and workflow checks

| Area | Observed result |
| --- | --- |
| Web | Vite production build and PWA generation with 22 precached files. 11 grading and contract unit tests, 3 web data tests, and 6 Chrome workflow tests passed. |
| Web workflow | Local PDF and TXT import, scan verification, persisted exam state, approval gate, duplicate answer detection, offline PWA reopening and queue recovery, teacher finalization, CSV download, and phone layout. |
| Consent boundary | The Chrome regression observed zero Gemini grading requests after cloud consent was declined on a browser without the Prompt API. A local-only Firebase app uses a non-network endpoint and no cloud credentials. |
| Android | Configured debug APK and unsigned release APK built. 9 JVM unit tests and 3 Android 16 emulator tests passed. Teacher marks survived a cold restart. PNG and image-only PDF OCR passed. A cloud-only answer remained unfinalized in airplane mode. |
| iOS | Xcode arm64 iOS 26.5 simulator build and both XCTest targets compiled. 10 Swift host checks passed using production contract, grading policy, and import/export code. The simulator stalled during Apple first-boot migration and timed out before running XCTest. |
| App Check | Firebase JS returned a token with the registered localhost debug provider. Firebase Android returned a signed App Check token on the emulator. The iOS registered debug-token exchange returned HTTP 200 through the official API. Production reCAPTCHA Enterprise was registered for web hosting domains. |
| Firestore | The emulator denied read, list, create, update and delete operations for anonymous and authenticated clients. No production Firestore store is provisioned or used. |
| Dependency audit | npm reported zero production dependency vulnerabilities after pinning the patched gRPC library used by the Firestore package. The development PWA build tree still reports moderate glob-related advisories. |

## Live inference

The configured Spark project is `gradewise-ai-2026`. Billing is disabled. The Firebase web, Android and iOS registrations and App Check setup exist. Firebase Console requires account approval of the Gemini Developer API terms to enable the provider. Until that step occurs, the cloud rubric, cloud grade and production App Check against a deployed site are unverified.

Chrome's installed profile reported Gemini Nano downloadable and began downloading. The Android emulator reported Gemini Nano unavailable. No compatible physical Android phone or iPhone was attached for local model verification. A synthetic benchmark and runner are included. Cloud request counts, model agreement, and cost savings require observed inference results.

## Release gates

- Live cloud rubric generation, grading and consented fallback after Gemini enablement.
- Genuine local inference with a supported model and offline check.
- Firebase Hosting release, hosted smoke test and production App Check verification.
- Mobile signing for production devices and iOS/TestFlight distribution, if needed.
- Public GitHub repository creation and push after explicit approval and account access.
- Capture remaining demo footage and upload a public YouTube video before submitting through Devpost.

The local teacher-review clip uses the synthetic sample and verified UI. It contains rubric inspection, teacher scoring, and export footage. The [recording plan](HACKATHON_SUBMISSION.md) identifies shots that depend on live model verification.
