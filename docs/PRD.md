# GradeWise AI product requirements

GradeWise AI helps English-language teachers grade examinations. A teacher turns a question paper and marking scheme into an approved grading pack, evaluates answers against that copy, and finalizes scores. The target is to reduce cloud requests compared with a cloud-only grading workflow while retaining evidence for each proposed score.

## Core journey

1. Create an exam with subject, class, date, total marks, and an optional automatic approval policy.
2. Import or type the paper and key. Confirm scanned transcriptions before continuing.
3. Generate a rubric with cloud Gemini, then inspect, edit, and approve it.
4. Import answers by student and question. Run locally where supported and route uncertain work to cloud with consent or to manual review.
5. Review proposed scores and evidence, finalize or override marks, and export results.
6. Compare measured inference counts, latency, and benchmark agreement. Show example cloud pricing as an estimate.

Synthetic examples provide a judge-friendly tour. The no-cost public deployment is for synthetic or non-sensitive input. Institutional identity, cloud sync, and production student-data governance are outside the first release.
