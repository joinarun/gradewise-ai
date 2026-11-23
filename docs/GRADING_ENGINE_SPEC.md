# Grading engine

Question identifiers are looked up in an approved pack. Each criterion has a unique identifier and a weight. Pack validation checks unique identifiers, positive weights, criterion totals, and the maximum exam score. Marks support half-point increments.

The grading request includes one approved question, rubric, and verified answer. Model output includes a mark for each criterion, a literal evidence quote for every positive mark, an explanation, the total, and an ambiguity flag. Validation recomputes the total and checks evidence against normalized answer text, criterion coverage, and range constraints. Evidence checks establish provenance of the text. Semantic support is still subject to teacher review.

A rejected payload or uncertain result triggers an allowed fallback. Cloud uncertainty and model disagreements require review. Invalid payloads cannot be finalized automatically. Compare against synthetic teacher-marked answers before reporting accuracy.
