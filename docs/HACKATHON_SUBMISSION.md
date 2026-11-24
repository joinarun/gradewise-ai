# BuildHybridAI submission

Deadline is November 30, 2026 at 2:00 p.m. PST, or December 1 at 3:30 a.m. IST. Select the verified platforms, provide a public open-source repository, and link a public YouTube recording with English narration or subtitles. Keep the video under three minutes. [Official Devpost rules](https://firebasehybridaihackathon.devpost.com/rules)

## Project description draft

**Tagline** · Cloud rubrics. Offline grading. Teachers in control.

### Inspiration

Teachers apply the same marking scheme to dozens of answers expressed in different ways. GradeWise AI lets them prepare that scheme once, reuse it on their device, and spend their review time on the answers that need judgment.

### What it does

A teacher uploads an exam paper and answer key. Cloud Gemini uses Firebase AI Logic to create an editable grading pack with marks, acceptable alternatives, and partial-credit rules. The teacher approves the pack before grading. On compatible Chrome desktops, Gemini Nano grades answers on-device, including offline. GradeWise AI checks mark bounds and requires a quote from the answer to support awarded credit. When a case is unresolved, the teacher can review it directly or explicitly authorize a cloud Gemini request. Teachers can confirm, adjust, or reject proposed scores and export finalized results.

### How we built it

The React and TypeScript PWA keeps exams in IndexedDB and caches its app shell for offline use. The app reports the model source from Firebase AI Logic responses, and App Check protects cloud requests. The Kotlin and Jetpack Compose Android client and the SwiftUI iOS client use the same versioned grading contract. Android and iOS cloud workflows ran on an emulator and a simulator. Native on-device inference still needs compatible physical-device verification.

### What we verified

Chrome graded six scored synthetic cases offline. Three results passed validation and matched the teacher scores. The other three went to review. Cloud Gemini returned five results for the same cases. Four matched, one differed, and the sixth request returned a provider error. On the hosted app, we verified offline grading with an approved rubric and separately verified consented cloud fallback with production App Check.

### What we learned and what’s next

Model availability tells us where inference can run. Mark bounds, answer evidence, and teacher review determine which proposals can move forward. Next we’ll verify on-device grading on physical mobile devices, expand the benchmark across subjects, and evaluate handwriting recognition.

### Testing instructions

Open the [hosted app](https://gradewise-ai-2026.web.app/) in desktop Chrome and choose **Explore a sample**. The sample includes an approved rubric and synthetic answers. Use **Settings** to prepare the device model on a compatible system. Grade a sample answer, inspect the model source and evidence, and finalize the score. Use synthetic text when trying optional cloud fallback.

## Recording plan

| Time | Show and narrate |
| --- | --- |
| 0:00–0:20 | Show a stack of synthetic exams. Explain the repeated cost and network dependence of sending every answer to the cloud. |
| 0:20–0:50 | Create an exam from synthetic documents, use cloud Gemini to generate the rubric, and approve the reviewed pack. |
| 0:50–1:20 | Grade a paraphrased answer on a compatible device. Zoom in on the model source and evidence for each mark. |
| 1:20–1:55 | Disconnect internet access and grade another answer. Reconnect, approve cloud transfer for an uncertain answer, and show the review. |
| 1:55–2:25 | Override a proposed mark, export finalized results, and explain the observed request counts and cost assumptions. |
| 2:25–2:55 | Show only verified native workflows, summarize what worked, and end on the repository and hosted app links. |

Replace any unverified shot with a factual caption. Capture the dashboard, pack approval, review, and analytics using synthetic records. Add the actual benchmark results and URLs after verification.

## Release checklist

- [x] Working Firebase AI Logic runtime and source attribution
- [x] Recorded genuine web local and cloud behavior and captured the native workspaces
- [x] [Public repository](https://github.com/joinarun/gradewise-ai) published with Apache 2.0 license
- [x] Hosted demo opened and checked as a new user
- [ ] Public YouTube URL with English narration or subtitles
- [ ] Devpost description, repository link, and selected platform categories

For the Devpost platform selection, use **Web / Chrome**, where both offline device grading and cloud fallback were verified. The Android and iOS builds provide supplementary evidence. Native on-device inference still needs verification on compatible physical devices.

## Narration draft

### 0:00–0:20

“After an exam, a teacher has to apply the same marking scheme to dozens of different answers. Sending every answer to a cloud model adds requests and makes grading depend on a connection. GradeWise starts with a marking scheme the teacher can inspect.”

### 0:20–0:50

“I’m using a synthetic science exam. I upload the question paper and answer key once. Cloud Gemini turns them into a grading pack with marks, acceptable alternatives, and rules for partial credit. I check the totals and approve the pack before collecting answers.”

*Capture a live Firebase cloud rubric request after provider enablement.*

### 0:50–1:20

“This answer says roots ‘take water from the soil’ and ‘keep the plant fixed.’ The model can recognize the two ideas when students use different words. Each awarded mark still needs evidence quoted from the answer. The source badge identifies the model that produced the result.”

*Capture a verified on-device result and show its actual score and source.*

### 1:20–1:55

“With the approved rubric already on this device, I can keep working offline where a local model is available. When a proposal fails validation or remains uncertain, GradeWise queues it for review. After reconnecting I can explicitly permit cloud evaluation of this synthetic answer and compare the model attempts.”

*Use a real network-off capture and show the consent screen before any cloud request.*

### 1:55–2:25

“I can see the question, the response, and how each criterion was scored. I’m changing this mark before finalizing it. The export contains finalized scores. Insights show observed model sources and estimate avoided cloud charges using the configured model’s token rates.”

*Use the local clip as a recording reference. Insert benchmark numbers only from a measured run.*

### 2:25–2:55

“This is the same teacher flow on each demonstrated platform. Firebase AI Logic routes to a supported device model, with a consented Gemini cloud path for eligible cases. The source, instructions, synthetic exam, and checks are available in the project repository.”

*Show platform footage from builds that ran successfully. Replace the repository end card with the actual published URL.*

The reproducible local clip shows synthetic rubric inspection, teacher scoring, and CSV export. Run the production preview on port 4173, then run `node scripts/record-demo.mjs`. The clip is available under `artifacts/demo/` and can be edited into the final recording.

## Recorded demonstration

The 1:38 English-narrated MP4 is generated at `artifacts/GradeWise-AI-Hackathon-Demo.mp4`. It includes actual local cloud rubric generation and consented fallback, hosted offline device grading, teacher review and export, and screenshots of both native workspaces. The public YouTube upload and Devpost entry remain pending.

To reproduce the edit on macOS with FFmpeg and the Samantha voice, pass the successful cloud and offline recordings and the teacher-review clip to `scripts/assemble-demo.sh`. The `cloud-workspace` and `workspace` benchmark modes accept `GRADEWISE_WORKSPACE_VIDEO` for capturing fresh clips.
