# GradeWise AI for iOS

GradeWise is a native SwiftUI teacher workspace. It supports multiple local examinations, selectable-text PDF and TXT extraction, JPEG/PNG text recognition, editable grading rubrics, a persistent grading queue, teacher review, finalized CSV export, and hybrid AI usage metrics. A device without Firebase configuration can open the sample, approve its prewritten rubric, enter marks, and export results.

## Build and test

Open `GradeWise.xcodeproj` in Xcode and select the GradeWise scheme and an iOS simulator. The committed Xcode project already contains the package and resource references. Run `xcodegen generate --spec apps/ios/project.yml` from the repository root after changing source membership or the project spec.

From the repository root:

```sh
xcodebuild -project apps/ios/GradeWise.xcodeproj -scheme GradeWise \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath apps/ios/Build CODE_SIGNING_ALLOWED=NO build
xcodebuild -project apps/ios/GradeWise.xcodeproj -scheme GradeWise \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath apps/ios/Build CODE_SIGNING_ALLOWED=NO \
  -parallel-testing-enabled NO test
```

The simulator app is at `apps/ios/Build/Build/Products/Debug-iphonesimulator/GradeWise.app`. The local Apple Silicon simulator archive is `apps/ios/Build/GradeWise-iOS-Simulator.zip`. Boot an iPhone simulator in Xcode or Simulator and install and launch the app:

```sh
xcrun simctl install booted apps/ios/Build/Build/Products/Debug-iphonesimulator/GradeWise.app
xcrun simctl launch booted app.gradewise.ios
```

Run `apps/ios/Scripts/test-core.sh` on macOS for independent grading contract, consent and offline policy, answer splitting, serialization, and export checks. The script uses the app's Swift sources and shared rubric fixture. XCTest also covers app storage and the teacher review journey.

The minimum deployment target is iOS 17. Apple Foundation Models require iOS 26 or later and a compatible physical device with Apple Intelligence enabled and the model downloaded. Swift Package Manager pins Firebase Apple SDK 12.19.3 for the Xcode 26 hybrid API. Firebase Apple SDK 13 moves third-party Gemini integration with Apple Foundation Models to the iOS 27 toolchain. [Firebase iOS Hybrid](https://firebase.google.com/docs/ai-logic/hybrid/ios/get-started) · [Firebase SDK release notes](https://firebase.google.com/support/release-notes/ios)

## Connect real Firebase inference

1. Register the iOS app bundle ID `app.gradewise.ios` in the dedicated Firebase project and set up Firebase AI Logic with the Gemini Developer API.
2. Save the registered app's `GoogleService-Info.plist` in `apps/ios/`. The build script embeds it when present. Git ignores the file.
3. In a Debug build, run from Xcode and register the generated debug token in Firebase App Check. Keep the token local. Set the team's signing and register App Attest before distributing a Release build.
4. Under **Settings**, use **Test Firebase App Check** to check registration. The cloud, on-device, and Firebase hybrid fallback probes use a fixed synthetic answer and display the source and model version returned by Firebase. On the simulator the hybrid probe should use cloud. The on-device probe is available when the OS model is ready.
5. Use synthetic or non-sensitive documents and answers with the demo project. Confirm the cloud transmission when generating a rubric or starting a grading run that can access cloud.

[Firebase App Check on Apple platforms](https://firebase.google.com/docs/app-check/ios/debug-provider)

## Try the sample

1. Tap **Open sample exam** and review and approve the bundled rubric. Generate a fresh rubric through cloud from the supplied sample documents if Firebase is configured.
2. Open **Add student answers** to type an answer for a rubric question or import multiple documents. For a multi-question document, put each question ID and a colon at the start of a line. Review all extracted text before submitting. Scanned PDF pages without selectable text need transcription.
3. Grade a single answer or run the queue. The app can pause between answers. Reopen the exam to continue queued work and retry unresolved cases.
4. Open an answer to compare proposals, exact answer evidence, and warnings. Approve an AI proposal or enter teacher marks.
5. Open **Class results and AI usage** to review finalized grades, export CSV, and inspect usage. The shared synthetic benchmark reports model agreement only for validated proposals tied to teacher marks. Cost estimates use configurable paid token rates and distinguish observed token counts from estimates.

## Data and platform boundaries

Exams and grades are stored in the app sandbox using an atomic file with iOS complete file protection and cloud backup exclusion. The app stores no Firebase debug token in the code or workspace. For real on-device grading the app uses a device-only Firebase AI Logic session, then applies the grading policy before any consented Firebase cloud request. The separate synthetic hybrid probe exercises the SDK's source fallback directly. Images are processed locally with Vision. The app supports hand transcription of scanned PDF pages. Device signing and TestFlight distribution require an Apple Developer team and a properly configured App Attest registration.

## Local verification

Xcode 26.5 built the app and its XCTest targets for the iOS 26.5 Simulator. The ten macOS core checks passed using the production Swift grading code. The registered iOS Firebase debug token was accepted by the App Check service. Simulator runtime verification was blocked by a first-boot migration that also timed out XCTest's connection to the test daemon. A compatible physical iPhone was unavailable for Apple Foundation Models inference. Cloud model requests require a running app and an enabled Gemini Developer API backend.
