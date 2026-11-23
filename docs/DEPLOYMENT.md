# Deployment

Use a dedicated Firebase project on Spark with the Gemini Developer API. Enable AI Logic using the console workflow. Configure a registered debug App Check provider for local synthetic tests and production providers for distributed apps. Keep all debug credentials outside Git. Use a dedicated reCAPTCHA Enterprise site key with hosting domains for the web app.

Gate hosting deployment on supported local workflow verification. Record the URL, build revision, Firebase resources, production App Check result and deployment constraints. Mobile artifacts are built separately and distributed using native tooling.

Provide explicit project start and shutdown scripts. Shutdown should disable the two inference APIs and preserve project data, app registrations, and the static website when available. The site can retain its offline synthetic tour while inference is paused. Restart requires live smoke testing before announcing availability.

## Commands

For first-time setup use the Firebase console to configure the Gemini Developer API and App Check. Confirm the project is on Spark and leave Analytics disabled unless needed. Use Java 21 for the optional Firestore rules emulator. No production Firestore database is required.

After local acceptance, build the app and deploy only Hosting. This reuses the registered production web App Check key from the local environment.

```sh
npm run build
npm exec --yes --package firebase-tools@15.37.0 -- firebase deploy \
  --only hosting --project gradewise-ai-2026
```

Verify the site in a fresh browser session. Check that production App Check returns an attestation and that Firebase reports cloud as the actual source of a synthetic rubric request. Try a device-only answer offline on compatible Chrome. Build native artifacts using each platform's README.

The following scripts manage inference APIs on a previously provisioned GradeWise project. They leave static hosting and registrations available. A shutdown disables cloud rubric generation and cloud fallback for all clients. Apply it after live verification and use start to restore the cloud demo when needed. The scripts never change billing or delete the project.

```sh
./scripts/gcp-start.sh gradewise-ai-2026
./scripts/gcp-shutdown.sh gradewise-ai-2026
```

## Hosted release

The demo is available at [gradewise-ai-2026.web.app](https://gradewise-ai-2026.web.app/). Firebase Hosting version `2bb0238e2539d3ff` was deployed on November 24, 2026 IST. The hosted build passed offline grading and a consented cloud fallback with production App Check. During hosted rubric checks, Gemini returned HTTP 500 high-demand responses. Local rubric creation and approval passed.

Cloud inference was disabled after testing. The public page remains available with its sample exam. The start script restores the APIs for later live sessions.
