# Data models

The canonical version-1 wire schemas live in [shared/schemas](../shared/schemas). A pack includes exam metadata, ordered questions and approval time. Each question has its original text, reference answer, alternatives, examples, constraints and weighted criteria. Local storage associates answers with a student reference and question identifier. A stored evaluation preserves validated model attempts, warnings, the proposed score and any teacher decision.

Student identifiers belong to the local record. A model receives the approved question and the answer text. Audit and analytics records store response source, timing and token metadata when provided.
