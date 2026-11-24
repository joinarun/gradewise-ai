# Local verification and release status

## Build and workflow checks

| Area | Observed result |
| --- | --- |
| Web | Vite production build and PWA generation with 22 precached files. 11 grading and contract unit tests, 3 web data tests, and 6 Chrome workflow tests passed after the cloud schema fix. |
| Web workflow | Local PDF and TXT import, scan verification, persisted exam state, approval gate, duplicate answer detection, offline PWA reopening and queue recovery, teacher finalization, CSV download, and phone layout. |
| Consent boundary | The Chrome regression observed zero Gemini grading requests after cloud consent was declined on a browser without the Prompt API. A local-only Firebase app uses a non-network endpoint and no cloud credentials. |
| Offline Chrome inference | Chrome returned an actual Firebase on-device response. The teacher workspace displayed a provisional 2/2 for the synthetic roots answer, accepted teacher approval, and showed the finalized score after an offline reload. The observed inference took 24.6 seconds. [Offline review screenshot](../apps/web/screenshots/offline-grade.png) |
| Android | Configured debug APK and unsigned release APK built. 9 JVM unit tests and 3 Android 16 emulator tests passed. Teacher marks survived a cold restart. PNG and image-only PDF OCR passed. A cloud-only answer remained unfinalized in airplane mode. Real Firebase cloud generation and the consented cloud fallback passed on the emulator. |
| iOS | Xcode arm64 iOS 26.5 simulator build and both XCTest targets compiled. The app installed and launched on the dedicated iPhone simulator. The signed simulator build passed real cloud rubric generation, cloud grading, and SDK hybrid fallback. 10 Swift host checks passed using production contract, grading policy, and import/export code. The XCTest transport failed to connect to simulator services, so the native test suite did not execute. |
| App Check | Firebase JS returned a token with the registered localhost debug provider. Firebase Android returned a signed App Check token on the emulator. The signed iOS simulator returned an App Check token through its SDK. Firebase AI Logic App Check enforcement is enabled. Production reCAPTCHA Enterprise is registered for the Hosting domains. |
| Firestore | The emulator denied read, list, create, update and delete operations for anonymous and authenticated clients. No production Firestore store is provisioned or used. |
| Dependency audit | npm reported zero production dependency vulnerabilities after pinning the patched gRPC library used by the Firestore package. The development PWA build tree still reports moderate glob-related advisories. |

## Live inference

The configured Spark project is `gradewise-ai-2026`. Billing is disabled. Its public site is [GradeWise AI](https://gradewise-ai-2026.web.app/). Local end-to-end web verification created and approved a two-question rubric, obtained a Firebase-reported cloud fallback grade of 2/2 with consent, and saved the final score across a reload. The production site also completed a genuine on-device grade, approval, and reload while offline. A separate hosted run returned a protected cloud fallback grade of 2/2 and accepted teacher approval using production App Check. Hosted rubric requests returned Gemini high-demand HTTP 500 responses during verification. The same rubric workflow succeeded locally.

After the Gemini APIs were re-enabled for publication, regular desktop Chrome returned an on-device proposal of 2/2 and a cloud proposal of 1/2 for two different synthetic sample answers. Fresh automated browser contexts received App Check HTTP 401 responses before inference, so the hosted cloud recheck used the normal Chrome flow with App Check enforcement active.

Android and iOS both verified Gemini 3.5 Flash-Lite and SDK App Check. The Android emulator reports Gemini Nano unavailable. The Apple model runtime failed the iOS device-only probe despite reporting readiness, while SDK fallback returned Cloud. Physical device verification remains open.

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

## Cloud comparison

Using the same six scored fixtures, Firebase returned five cloud responses. Four matched the teacher reference, and one ambiguous response was awarded 2 where the teacher awarded 1. A sixth request encountered a temporary provider error and stayed in review. The five successful responses reported 1,689 input tokens and 560 output tokens. At reference paid rates of US$0.30 and US$2.50 per million input and output tokens, respectively, that usage would cost about US$0.00191. The project uses the no-cost Spark tier and these are paid-rate estimates.

For the three cases accepted on device, the matching cloud-only baseline reported 1,012 input and 316 output tokens. Those three responses represent about US$0.00109 in hypothetical paid cloud charges that an on-device run could avoid. This comparison covers only the synthetic cases and excludes device compute. [Gemini pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite)

## Release status

Firebase Hosting version `2bb0238e2539d3ff` serves the web app. The two inference APIs were disabled after testing, and temporary App Check debug credentials were revoked. The public site still returned HTTP 200.

## Remaining release steps

- Native local inference on compatible physical Android and iOS hardware.
- Native production device signing and distribution, if needed.
- GitHub publication as `joinarun` once the account completes sign-in.
- Upload the demonstration to a public YouTube link and submit the Devpost entry.
