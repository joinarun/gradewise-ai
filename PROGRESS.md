# GradeWise AI progress

## Stage 7 · Local delivery and external release gates

- Implemented the web, Android, and iOS teacher workspaces, versioned rubric and scoring contracts, source-restricted Firebase AI Logic calls, batch queue, teacher review and CSV export.
- Registered web, Android and iOS apps on the dedicated `gradewise-ai-2026` Firebase Spark project. Verified no Cloud Billing linkage. App Check debug worked on web and Android. The iOS configuration passed the backend token exchange.
- Built the web PWA, configured Android APKs and the iOS arm64 simulator app, which installed and launched. The local workspace and release assets use synthetic data.
- Added the [local verification report](docs/VERIFICATION.md), [deployment guide](docs/DEPLOYMENT.md), and [Devpost draft and recording plan](docs/HACKATHON_SUBMISSION.md).
- Local verification includes 11 core tests, 3 web data tests, 6 Chrome workflow tests, 9 Android JVM tests, 3 Android emulator workflows, 10 Swift host checks, and Firestore rule tests. The iOS XCTest runner could not connect to simulator services. Chrome also produced an on-device provisional 2/2 while offline, and the approved score survived an offline reload.
- Built a 23-second synthetic teacher-review recording and captured actual web, Android, and iOS screenshots. The full three-minute recording needs the remaining live AI footage.

## Pending

- User confirmation of the Gemini Developer API terms in the open Firebase Console. The Mac locked after the approval prompt was reached.
- Complete the live inference and hosted acceptance steps. The two inference APIs are currently disabled. Start and shutdown scripts are in `scripts/`.
- Compatible physical Android and iOS hardware is needed to prove native local grades. Test mobile cloud fallback after provider enablement.
- Publish only after approval and GitHub account access. Complete the Devpost submission after the public repository and video are available.

Deadline: November 30, 2026 at 2:00 p.m. PST, or December 1 at 3:30 a.m. IST. The dependencies above affect deployment and the footage that can be included.
