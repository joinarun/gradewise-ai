# Deployment

Use a dedicated Firebase project on Spark with the Gemini Developer API. Enable AI Logic using the console workflow. Configure a registered debug App Check provider for local synthetic tests and production providers for distributed apps. Keep all debug credentials outside Git. Use a dedicated reCAPTCHA Enterprise site key with hosting domains for the web app.

Gate hosting deployment on supported local workflow verification. Record the URL, build revision, Firebase resources, production App Check result and deployment constraints. Mobile artifacts are built separately and distributed using native tooling.

Provide explicit project start and shutdown scripts. Shutdown should disable the two inference APIs and preserve project data, app registrations, and the static website when available. The site can retain its offline synthetic tour while inference is paused. Restart requires live smoke testing before announcing availability.
