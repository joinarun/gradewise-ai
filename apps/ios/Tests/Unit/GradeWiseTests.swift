import Foundation
import XCTest
@testable import GradeWise

final class GradeWiseTests: XCTestCase {
    func testSharedContractAndPrompt() throws {
        let exam = try ExamRecord.sample()
        let pack = try XCTUnwrap(exam.pack)
        try pack.validate()
        XCTAssertEqual(pack.schemaVersion, 1)
        XCTAssertEqual(pack.questions.count, 2)
        XCTAssertEqual(exam.answers.count, 7)
        let draft = try GradingPack.draft(from: encodeJSON(["questions": pack.questions]), exam: pack.exam)
        XCTAssertEqual(draft, pack)
        XCTAssertTrue(try GradingPrompts.load().evaluate(exam.answers[0], question: pack.questions[0]).contains("INPUT\n"))
    }

    func testRejectsUnsupportedEvidenceUnknownCriteriaAndFractionalMarks() throws {
        let exam = try ExamRecord.sample()
        let question = try XCTUnwrap(exam.pack?.questions.first)
        let answer = try XCTUnwrap(exam.answers.first?.text)
        try makeResult().validate(question: question, answer: answer)
        XCTAssertThrowsError(try makeResult(evidence: "absorbing minerals").validate(question: question, answer: answer))
        XCTAssertThrowsError(try makeResult(marks: 0.3).validate(question: question, answer: answer))
        XCTAssertThrowsError(try makeResult(criterion: "unrecognized").validate(question: question, answer: answer))
        XCTAssertThrowsError(try GradingResult.parse("{broken"))
    }

    @MainActor func testPreferDeviceNeverSendsWithoutConsentOrWhileOffline() async throws {
        let exam = try ExamRecord.sample()
        let question = try XCTUnwrap(exam.pack?.questions.first)
        let answer = try XCTUnwrap(exam.answers.first?.text)
        for (consent, offline) in [(false, false), (true, true)] {
            var called: [InferenceSource] = []
            let outcome = await GradingPolicy().grade(
                answer, question: question, prompt: "synthetic", policy: .preferDevice, consent: consent, isOffline: offline
            ) { _, source in
                called.append(source)
                throw InferenceError.unavailable
            }
            XCTAssertEqual(called, [.device])
            XCTAssertTrue(outcome.unresolved)
            XCTAssertEqual(outcome.attempts[1].requestedSource, .cloud)
            XCTAssertNil(outcome.attempts[1].source)
        }
    }

    @MainActor func testDisagreementPreservesBothModelResults() async throws {
        let exam = try ExamRecord.sample()
        let question = try XCTUnwrap(exam.pack?.questions.first)
        let answer = try XCTUnwrap(exam.answers.first?.text)
        let outcome = await GradingPolicy().grade(
            answer, question: question, prompt: "synthetic", policy: .preferDevice, consent: true, isOffline: false
        ) { _, source in
            let result = source == .device ? self.makeResult(uncertain: true) : self.makeResult(marks: 0)
            return ModelReply(text: try encodeJSON(result), source: source, model: source.rawValue,
                              latencyMs: 42, inputTokens: 20, outputTokens: 10)
        }
        XCTAssertEqual(outcome.attempts.compactMap(\.source), [.device, .cloud])
        XCTAssertEqual(outcome.attempts.compactMap { $0.result?.marks }, [1, 0])
        XCTAssertFalse(outcome.reviewNotes.isEmpty)
        XCTAssertFalse(outcome.unresolved)
    }

    @MainActor func testCleanDeviceEvaluationMakesNoCloudRequest() async throws {
        let exam = try ExamRecord.sample()
        let question = try XCTUnwrap(exam.pack?.questions.first)
        let answer = try XCTUnwrap(exam.answers.first?.text)
        let outcome = await GradingPolicy().grade(
            answer, question: question, prompt: "synthetic", policy: .preferDevice, consent: true, isOffline: true
        ) { _, source in
            XCTAssertEqual(source, .device)
            return ModelReply(text: try encodeJSON(self.makeResult()), source: .device, model: "system",
                              latencyMs: 42, inputTokens: nil, outputTokens: nil)
        }
        XCTAssertEqual(outcome.proposal?.marks, 1)
        XCTAssertEqual(outcome.attempts.count, 1)
        XCTAssertTrue(outcome.reviewNotes.isEmpty)
    }

    @MainActor func testStoreRejectsDuplicatePersistsFinalMarksAndExportsCSV() throws {
        let location = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: location) }
        let file = location.appending(path: "test-workspace.json")
        let store = WorkspaceStore(file: file)
        let id = try store.loadSample()
        let pack = try XCTUnwrap(store.exam(id)?.pack)
        let existing = try XCTUnwrap(store.exam(id)?.answers.first)
        XCTAssertThrowsError(try store.finalize(id, existing.id, marks: 1))
        try store.saveRubric(id, json: encodeJSON(pack), approve: true)
        XCTAssertThrowsError(try store.enqueue(id, answers: [existing]))

        let new = StudentAnswer(student: "=TEST", questionID: "1", text: "Synthetic text.")
        try store.enqueue(id, answers: [new])
        try store.finalize(id, new.id, marks: 1.5)
        let restored = try XCTUnwrap(WorkspaceStore(file: file).exam(id))
        XCTAssertEqual(restored.finalized.first?.finalMarks, 1.5)
        XCTAssertTrue(restored.resultsCSV().contains("\"'=TEST\",\"1\",1.5,2.0"))
        XCTAssertFalse(restored.resultsCSV().contains("Sample 01"))
    }

    func testStudentDocumentSplitsRecognizedQuestionIDs() throws {
        let exam = try ExamRecord.sample()
        let questions = try XCTUnwrap(exam.pack?.questions)
        let answers = try DocumentImport.answers(from: "1: Water\n  Root uptake\n2. At the surface",
                                                 student: "Sample", questions: questions)
        XCTAssertEqual(answers.map(\.questionID), ["1", "2"])
        XCTAssertEqual(answers.map(\.text), ["Water\n  Root uptake", "At the surface"])
        XCTAssertThrowsError(try DocumentImport.answers(from: "Unknown", student: "Sample", questions: questions))
    }

    private func makeResult(marks: Double = 1, evidence: String = "take water from the soil",
                            criterion: String = "absorption", uncertain: Bool = false) -> GradingResult {
        GradingResult(marks: marks, explanation: "The answer supports the awarded criterion.",
                      criteria: [
                        CriterionResult(criterionId: criterion, marks: marks, evidence: marks > 0 ? evidence : ""),
                        CriterionResult(criterionId: "anchoring", marks: 0, evidence: "")
                      ], uncertain: uncertain)
    }
}
