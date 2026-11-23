# BuildHybridAI submission

Deadline is November 30, 2026 at 2:00 p.m. PST, or December 1 at 3:30 a.m. IST. Select the verified platforms, provide a public open-source repository, and link a public YouTube recording with English narration or subtitles. Keep the video under three minutes. [Official Devpost rules](https://firebasehybridaihackathon.devpost.com/rules)

## Project description draft

Teachers need a consistent, explainable way to apply a marking scheme across an entire class. GradeWise AI creates an editable rubric using cloud Gemini through Firebase AI Logic, then attempts to grade individual answers with an on-device model. Every awarded criterion needs a quote from the answer. The app can send an unresolved answer to Gemini when a teacher opts in. Teachers review provisional marks and decide what becomes final.

The implementation focuses on two problems. The same marking scheme has to travel across platforms, and device-model availability alone cannot determine whether a proposed score is trustworthy. A versioned grading pack, application-level validation, and explicit routing address those problems. Future work includes evaluating more subjects and question formats, validating handwriting workflows, and adding institution-managed accounts and storage.

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

- [ ] Working Firebase AI Logic runtime and source attribution
- [ ] Local and cloud behavior recorded on verified platforms
- [ ] Public repository approved and published with Apache 2.0 license
- [ ] Hosted demo opened and checked as a new user
- [ ] Public YouTube URL with English narration or subtitles
- [ ] Devpost description, repository link, and selected platform categories
