# Technology stack

| Platform | UI and storage | Inference and attestation |
| --- | --- | --- |
| Web | React, TypeScript, Vite, IndexedDB, service worker | Firebase JS 13.4, Chrome desktop Gemini Nano, reCAPTCHA Enterprise |
| Android | Kotlin, Jetpack Compose, app-private atomic JSON | Firebase AI Logic 18.2.0 hybrid, ML Kit Prompt API, debug provider and Play Integrity |
| iOS | SwiftUI, atomic files with complete file protection | Firebase Apple 12.19.3 hybrid, Apple Foundation Models, debug provider and DeviceCheck or App Attest |

The local Mac is Apple Silicon with macOS 27.2.1, 18 GiB RAM, Chrome 157, Node 24, npm 11, Java 17 and 21, Xcode 26.5 and iOS 26.5 simulators. Android command-line tools exist in Homebrew's SDK path. Firebase CLI runs as a pinned npm tool; gcloud is authenticated. GitHub CLI is unauthenticated. Mobile device model behavior requires compatible physical hardware.

- [Web hybrid SDK](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)
- [Android hybrid SDK](https://firebase.google.com/docs/ai-logic/hybrid/android/get-started)
- [iOS hybrid SDK](https://firebase.google.com/docs/ai-logic/hybrid/ios/get-started)
