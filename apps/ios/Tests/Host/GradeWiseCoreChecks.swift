import Foundation

@main
struct GradeWiseCoreChecks {
    @MainActor static func main() async throws {
        let fixture = URL(fileURLWithPath: "shared/rubrics/roots.v1.json")
        let pack = try JSONDecoder().decode(GradingPack.self, from: Data(contentsOf: fixture))
        try pack.validate()
        try check(pack.questions.count == 2, "Shared rubric contains two questions")
        var invalidPack = pack
        invalidPack.questions[0].criteria[0].maxMarks = 1.5
        do {
            try invalidPack.validate()
            throw CheckFailure("Pack accepted inconsistent totals")
        } catch is ContractError {
            print("PASS Pack rejects inconsistent totals")
        }

        let question = pack.questions[0]
        let answer = "Roots take water from the soil and keep the plant fixed."
        let accepted = result(uncertain: false)
        try accepted.validate(question: question, answer: answer)
        do {
            try result(uncertain: false, evidence: "hello").validate(question: question, answer: answer)
            throw CheckFailure("Scoring accepted unsupported evidence")
        } catch is ContractError {
            print("PASS Scoring requires evidence from the answer")
        }

        for (consent, offline) in [(false, false), (true, true)] {
            var calls: [InferenceSource] = []
            let pending = await GradingPolicy().grade(
                answer, question: question, prompt: "synthetic",
                policy: .preferDevice, consent: consent, isOffline: offline
            ) { _, source in
                calls.append(source)
                throw InferenceError.unavailable
            }
            let checkName = offline ? "Offline evaluation stays queued" : "Cloud needs explicit consent"
            try check(calls == [.device] && pending.unresolved, checkName)
        }

        let local = await GradingPolicy().grade(
            answer, question: question, prompt: "synthetic",
            policy: .preferDevice, consent: true, isOffline: true
        ) { _, source in
            try makeReply(source, result: accepted)
        }
        try check(local.reviewNotes.isEmpty && local.attempts.count == 1 && local.proposal?.marks == 1,
                  "Validated on-device output does not invoke cloud")

        let unreadable = await GradingPolicy().grade(
            "?", question: question, prompt: "synthetic",
            policy: .preferDevice, consent: true, isOffline: false
        ) { _, _ in
            throw CheckFailure("Unreadable answer was sent to a model")
        }
        try check(unreadable.attempts.isEmpty && unreadable.proposal == nil && !unreadable.reviewNotes.isEmpty,
                  "Unreadable answers go to the teacher without model inference")

        let disagreement = await GradingPolicy().grade(
            answer, question: question, prompt: "synthetic",
            policy: .preferDevice, consent: true, isOffline: false
        ) { _, source in
            try makeReply(source, result: result(uncertain: source == .device, marks: source == .device ? 1 : 0))
        }
        try check(disagreement.attempts.compactMap { $0.result?.marks } == [1, 0] &&
                  !disagreement.reviewNotes.isEmpty && disagreement.attempts.last?.escalatedFromDevice == true,
                  "Escalation retains distinct results and flags disagreement")

        let answers = try DocumentImport.answers(from: "1: Water\n  Root uptake\n2. At the surface",
                                                 student: "Sample", questions: pack.questions)
        try check(answers.map(\.questionID) == ["1", "2"] &&
                  answers.map(\.text) == ["Water\n  Root uptake", "At the surface"],
                  "Document splitting preserves text and rubric IDs")

        var exam = ExamRecord(metadata: pack.exam, pack: pack, answers: answers)
        exam.answers[0].student = "=UNTRUSTED"
        exam.answers[0].status = .finalized
        exam.answers[0].finalMarks = 1.5
        exam.answers[0].decision = .override
        let restored = try JSONDecoder().decode(ExamRecord.self, from: JSONEncoder().encode(exam))
        try check(restored == exam && restored.resultsCSV().contains("\"'=UNTRUSTED\",\"1\",1.5,2.0") &&
                  !restored.resultsCSV().contains("At the surface"),
                  "Workspace serialization preserves finalized scores and CSV escapes formula cells")
    }

    private static func makeReply(_ source: InferenceSource, result: GradingResult) throws -> ModelReply {
        ModelReply(text: try encodeJSON(result), source: source, model: "test-fixture",
                   latencyMs: 1, inputTokens: nil, outputTokens: nil)
    }

    private static func result(uncertain: Bool, marks: Double = 1,
                               evidence: String = "take water from the soil") -> GradingResult {
        GradingResult(
            marks: marks, explanation: "Evidence from the answer.",
            criteria: [
                CriterionResult(criterionId: "absorption", marks: marks, evidence: marks > 0 ? evidence : ""),
                CriterionResult(criterionId: "anchoring", marks: 0, evidence: "")
            ],
            uncertain: uncertain
        )
    }

    private static func check(_ condition: Bool, _ description: String) throws {
        guard condition else { throw CheckFailure(description) }
        print("PASS \(description)")
    }

    private struct CheckFailure: Error {
        let message: String
        init(_ message: String) { self.message = message }
    }
}
