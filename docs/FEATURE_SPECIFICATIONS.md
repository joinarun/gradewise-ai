# Feature specifications

- **Exams** store independent metadata, question paper, answer key, approved pack, and answer queue.
- **Input** supports typed text and TXT. Selectable PDF text is extracted locally on platforms with a parser. Scans require the teacher to review or enter a transcription. Images are optional on supported devices.
- **Rubric editor** shows expected answers, criteria, partial credit, alternatives, examples and constraints. Approval validates the entire pack against the exam.
- **Batch** processes sequentially, tracks failures separately from finalized records, persists between items, and offers retry. Question mapping is explicit or derived from numbered sections subject to review.
- **Grade review** shows text, rubric, validated proposal, per-criterion evidence and source. The teacher can approve, override or reject. Automatic approval applies to an unflagged proposal when the exam creator enabled it.
- **Results** show finalized grades and provide CSV export with spreadsheet-formula defenses.
- **Settings and analytics** expose runtime model readiness, policy, the student's cloud-consent decision, token estimates and benchmark agreement when teacher reference scores exist.
