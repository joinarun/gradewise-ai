# Android platform specification

The Kotlin and Jetpack Compose client uses the Firebase AI Logic and Firebase AI Logic On-Device Android SDKs through the Gemini Developer API. It supports Android API 26 and newer. Firebase reports the source of each response. Gemini Nano is provided by ML Kit and AICore on supported physical devices.

## Execution policy

The rubric request sends the confirmed exam and key text for cloud preparation. Student grading invokes strict SDK modes independently. Prefer on-device tries the local route first. Device-only never sends student content. Cloud-only requires explicit consent and connection. Cloud-first tries the consented cloud route first and uses the local route when the cloud is unavailable. The local route can escalate only after validating score bounds, criterion coverage, literal evidence, uncertainty, and the approval state of the pack. Missing connectivity, malformed output and failed inference keep an answer accessible for review and retry. Student IDs are excluded from model prompts.

## Data and workflows

Teachers can create or open exams, import PDF, plain-text, JPEG and PNG sources, inspect and edit grading packs, and approve packs for grading. The bundled Latin-script ML Kit model processes images and image-only PDFs locally. Teachers verify and correct the extracted text before it enters the rubric or grading workflow. Handwriting may need manual transcription. Teachers can enter answers individually or import numbered text papers, grade a resumable local queue, inspect both inference attempts and evidence, and approve, override or reject marks. The app writes records to app-private local storage through atomic replacements. It can export finalized grades through Android's document picker. Synthetic sample data can demonstrate the teacher workflow without a Firebase project. Any real inference requires project registration and App Check.

## Acceptance checks

- The offline workspace supports creating an examination and reopening an approved pack after process restart.
- Teacher review shows student text, question text, rubric, provisional results, inference source and warnings.
- Invalid evidence, mismatched totals, model uncertainty and lack of cloud consent each have automated regression checks.
- Batches work sequentially and resume unfinished records after interruption. Importing the same student and question pair does not duplicate work.
- Each Firebase route is tested independently with actual inferenceSource attribution where compatible hardware and registered App Check credentials are available.
- Debug builds use the App Check debug provider. Release builds use Play Integrity. Neither embeds a debug token.

## Sources

- [Firebase AI Logic hybrid inference for Android](https://firebase.google.com/docs/ai-logic/hybrid/android/get-started)
- [Firebase Android structured hybrid output](https://firebase.google.com/docs/ai-logic/hybrid/android/generate-structured-output)
- [Firebase Android inference modes and response attribution](https://firebase.google.com/docs/ai-logic/hybrid/android/configuration-options)
