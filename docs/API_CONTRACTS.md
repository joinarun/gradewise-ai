# API contracts

There is no GradeWise API server. Each client calls Firebase AI Logic through its platform SDK. Provider responses are validated against shared contracts. The rubric model returns a `questions` envelope. The client inserts exam metadata and approval state into the resulting pack. The answer model returns a grading result with the same question's criterion identifiers.

Errors and refusals are represented as failed attempts. The UI may show sanitized operational errors, and never treats an unavailable SDK response as inference. Shared developer fixtures contain expected results for valid and malformed cases.
