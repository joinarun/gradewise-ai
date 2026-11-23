# GradeWise AI progress

## Stage 7 · Hosted release and submission

- Published the web app at [gradewise-ai-2026.web.app](https://gradewise-ai-2026.web.app/). The site opens over HTTPS with the synthetic exam. Actual Gemini Nano grading, teacher approval, and a score surviving an offline reload were verified on the hosted build.
- Enabled the Gemini Developer API and Firebase AI Logic and verified App Check enforcement. The Spark project has no Cloud Billing linkage.
- Verified live Gemini rubric generation and grading on local web, Android, and iOS. Android and iOS obtained SDK App Check tokens. Web and Android confirmed permission-gated cloud fallback, and iOS confirmed Firebase SDK hybrid fallback.
- On the same six scored synthetic cases, three device responses and four cloud responses matched their teacher references. The reports distinguish review, disagreement, errors, request counts, and hypothetical paid costs.
- Built the web PWA, Android APKs, and a signed iOS arm64 simulator app. iOS launched successfully. The simulator test service still prevented XCTest execution.
- Produced a 1:38 English-narrated demonstration with actual cloud, offline, and review footage.
- Hosted cloud fallback passed with production App Check. Both inference APIs were disabled after testing, and the static site remains accessible.
- See the [verification report](docs/VERIFICATION.md), [deployment guide](docs/DEPLOYMENT.md), and [Devpost draft and recording plan](docs/HACKATHON_SUBMISSION.md).

## Pending

- Repeat cloud rubric generation on the hosted site when Gemini capacity is available. Those hosted requests returned temporary HTTP 500 errors.
- GitHub must authenticate as `joinarun` to create and push `joinarun/gradewise-ai`.
- Compatible physical Android and iOS hardware is needed to prove native local grades.
- Add the public repository and YouTube links to the Devpost entry.

The deadline is November 30, 2026 at 2:00 p.m. PST, or December 1 at 3:30 a.m. IST.
