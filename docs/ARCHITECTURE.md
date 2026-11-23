# Architecture

Use React and TypeScript on web, Kotlin and Compose on Android, and Swift and SwiftUI on iOS. Native clients have direct access to the documented Firebase hybrid APIs and OS file pickers. A Flutter, React Native, or WebView wrapper would require platform-specific bridges to deliver the same inference and App Check guarantees, so three small clients share data contracts and prompts instead.

Each client stores exam data locally. Firebase Hosting serves the web app. Registered apps use Firebase AI Logic backed by the Gemini Developer API. App Check protects cloud requests; Firestore, Cloud Run, and Cloud Functions are unnecessary for this local workspace. Firebase Authentication becomes relevant when synchronized teacher accounts are implemented.

The grading policy uses strict SDK source modes and evaluates the response before deciding whether to try the other source. A vendor's availability fallback cannot enforce the teacher's consent or detect rubric disagreements. Source attribution comes from the response. Web device inference uses an isolated Firebase app with a non-network endpoint. Firebase JS can lose its local adapter when a browser does not expose the Prompt API, and the application guards against the SDK taking its cloud route in that case.

- [Firebase hybrid overview](https://firebase.google.com/docs/ai-logic/hybrid)
- [Firebase AI Logic data governance](https://firebase.google.com/docs/ai-logic/data-governance)
