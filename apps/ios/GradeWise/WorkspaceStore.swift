import Foundation
import Network
import SwiftUI

@MainActor
final class WorkspaceStore: ObservableObject {
    @Published private(set) var workspace = Workspace()
    @Published private(set) var isOffline = false
    @Published private(set) var runningExamID: UUID?
    @Published private(set) var activeAnswerID: UUID?
    @Published private(set) var preparing = false
    @Published private(set) var pauseRequested = false
    @Published var message: String?

    private let monitor = NWPathMonitor()
    private let file: URL
    private let inference = FirebaseInference()
    private var canWrite = true

    init(file: URL? = nil) {
        let directory = URL.applicationSupportDirectory.appending(path: "GradeWise", directoryHint: .isDirectory)
        #if DEBUG
        let testStore = ProcessInfo.processInfo.environment["GRADEWISE_UI_TEST_STORE"].flatMap { UUID(uuidString: $0) }
        #else
        let testStore: UUID? = nil
        #endif
        let name = testStore.map { "ui-test-" + $0.uuidString + ".json" } ?? "workspace.json"
        self.file = file ?? directory.appending(path: name)
        if FileManager.default.fileExists(atPath: self.file.path) {
            do {
                workspace = try JSONDecoder().decode(Workspace.self, from: Data(contentsOf: self.file))
            } catch {
                canWrite = false
                message = "GradeWise could not open the local workspace. Existing data has been kept."
            }
        }
        monitor.pathUpdateHandler = { [weak self] path in
            let offline = path.status != .satisfied
            Task { @MainActor in self?.isOffline = offline }
        }
        monitor.start(queue: DispatchQueue(label: "app.gradewise.ios.network"))
    }

    deinit { monitor.cancel() }

    func exam(_ id: UUID) -> ExamRecord? { workspace.exams.first { $0.id == id } }

    func create(_ metadata: ExamMetadata) throws -> UUID {
        try metadata.validate()
        let exam = ExamRecord(metadata: metadata)
        try change { $0.exams.insert(exam, at: 0) }
        return exam.id
    }

    func loadSample() throws -> UUID {
        if let existing = workspace.exams.first(where: \.isSample) {
            return existing.id
        }
        let exam = try ExamRecord.sample()
        try change { $0.exams.insert(exam, at: 0) }
        return exam.id
    }

    func saveDocuments(_ id: UUID, paper: String, key: String) throws {
        try editExam(id) { exam in
            guard !exam.approved else { throw ContractError.issue("The rubric is already approved.") }
            if exam.questionPaper != paper || exam.answerKey != key {
                exam.pack = nil
            }
            exam.questionPaper = paper
            exam.answerKey = key
        }
    }

    func prepare(_ id: UUID) async {
        guard !preparing, runningExamID == nil, let exam = exam(id), !exam.approved else { return }
        guard !exam.questionPaper.trimmed.isEmpty, !exam.answerKey.trimmed.isEmpty else {
            message = "Enter both exam documents before generating the rubric."
            return
        }
        guard FirebaseInference.isConfigured else { message = InferenceError.configuration.localizedDescription; return }
        guard !isOffline else { message = "Connect to the internet to generate a cloud rubric."; return }

        preparing = true
        defer { preparing = false }
        let prompt: String
        do {
            prompt = try GradingPrompts.load().prepare(exam)
        } catch {
            message = error.localizedDescription
            return
        }

        var attempt = InferenceAttempt(requestedSource: .cloud, actualRequest: true)
        do {
            let reply = try await inference.generate(prompt, source: .cloud, model: workspace.settings.cloudModel, rubric: true)
            attempt.source = reply.source
            attempt.model = reply.model
            attempt.latencyMs = reply.latencyMs
            attempt.inputTokens = reply.inputTokens
            attempt.outputTokens = reply.outputTokens
            guard reply.source == .cloud else {
                throw ContractError.issue("Firebase did not confirm cloud inference for rubric generation.")
            }
            let pack = try GradingPack.draft(from: reply.text, exam: exam.metadata)
            try editExam(id) {
                $0.preparationAttempts.append(attempt)
                guard !$0.approved, $0.questionPaper == exam.questionPaper, $0.answerKey == exam.answerKey else {
                    throw ContractError.issue("The exam documents changed during generation. Generate again using the latest text.")
                }
                $0.pack = pack
            }
        } catch {
            attempt.failure = true
            attempt.warnings = [attempt.source == nil
                ? "Cloud request failed. Check the connection, model, and App Check in Settings."
                : error.localizedDescription]
            message = attempt.warnings.first
            try? editExam(id) { $0.preparationAttempts.append(attempt) }
        }
    }

    func saveRubric(_ id: UUID, json: String, approve: Bool) throws {
        let pack: GradingPack
        do {
            pack = try JSONDecoder().decode(GradingPack.self, from: Data(json.utf8))
        } catch {
            throw ContractError.issue("The rubric JSON does not match the grading pack schema.")
        }
        try pack.validate()
        try editExam(id) {
            guard !$0.approved else { throw ContractError.issue("The rubric is already approved.") }
            guard pack.exam == $0.metadata else {
                throw ContractError.issue("Keep the rubric's examination metadata unchanged.")
            }
            var saved = pack
            saved.approvedAt = approve ? ISO8601DateFormatter().string(from: .now) : nil
            $0.pack = saved
        }
    }

    func enqueue(_ id: UUID, answers: [StudentAnswer]) throws {
        guard runningExamID == nil else { throw ContractError.issue("Pause the batch before adding answers.") }
        try editExam(id) { exam in
            guard let pack = exam.pack, pack.approvedAt != nil else {
                throw ContractError.issue("Approve a rubric before adding answers.")
            }
            var unique = Set(exam.answers.map { [$0.student.lowercased(), $0.questionID] })
            for var answer in answers {
                answer.student = answer.student.trimmed
                answer.text = answer.text.trimmed
                guard !answer.student.isEmpty, !answer.text.isEmpty,
                      pack.questions.contains(where: { $0.id == answer.questionID }) else {
                    throw ContractError.issue("Enter a student label and answer for a rubric question.")
                }
                guard unique.insert([answer.student.lowercased(), answer.questionID]).inserted else {
                    throw ContractError.issue("An answer for \(answer.student) and \(answer.questionID) already exists.")
                }
                exam.answers.append(answer)
            }
        }
    }

    func startBatch(_ id: UUID, consent: Bool, answerID: UUID? = nil, retry: Bool = false) async {
        guard runningExamID == nil, !preparing, let exam = exam(id),
              let pack = exam.pack, pack.approvedAt != nil else { return }
        let settings = workspace.settings
        let prompts: GradingPrompts
        do { prompts = try GradingPrompts.load() }
        catch { message = error.localizedDescription; return }

        runningExamID = id
        pauseRequested = false
        defer {
            runningExamID = nil
            activeAnswerID = nil
            pauseRequested = false
        }

        let selected = exam.answers.filter {
            (answerID == nil || $0.id == answerID) && ($0.status == .queued || (retry && $0.status == .unresolved))
        }
        for answer in selected {
            guard !Task.isCancelled, !pauseRequested else { break }
            guard let question = pack.questions.first(where: { $0.id == answer.questionID }) else { continue }
            activeAnswerID = answer.id
            do {
                let prompt = try prompts.evaluate(answer, question: question)
                let outcome = await GradingPolicy().grade(
                    answer.text, question: question, prompt: prompt, policy: settings.policy, consent: consent,
                    isOffline: isOffline
                ) { prompt, source in
                    try await self.inference.generate(prompt, source: source, model: settings.cloudModel)
                }
                var evaluated = answer
                evaluated.attempts.append(contentsOf: outcome.attempts)
                evaluated.notes = outcome.reviewNotes
                evaluated.proposal = outcome.proposal ?? answer.proposal
                evaluated.status = outcome.unresolved ? .unresolved : .review
                if pack.exam.autoApprove, outcome.reviewNotes.isEmpty, let proposal = outcome.proposal {
                    evaluated.status = .finalized
                    evaluated.finalMarks = proposal.marks
                    evaluated.decision = .automatic
                }
                try editAnswer(id, answer.id) { $0 = evaluated }
            } catch {
                message = error.localizedDescription
                break
            }
        }
    }

    func pause() {
        if runningExamID != nil { pauseRequested = true }
    }

    func finalize(_ examID: UUID, _ answerID: UUID, marks: Double? = nil) throws {
        guard runningExamID == nil, let exam = exam(examID), exam.approved else {
            throw ContractError.issue("Approve the rubric and finish the active grading run first.")
        }
        try editAnswer(examID, answerID) { answer in
            guard let question = exam.pack?.questions.first(where: { $0.id == answer.questionID }),
                  let final = marks ?? answer.proposal?.marks,
                  final.isFinite, (0...question.maxMarks).contains(final), (final * 2).rounded() == final * 2 else {
                throw ContractError.issue("Enter a score from zero to the question maximum in half-mark increments.")
            }
            answer.finalMarks = final
            answer.decision = marks == nil ? .approved : .override
            answer.status = .finalized
        }
    }

    func reject(_ examID: UUID, _ answerID: UUID) throws {
        guard runningExamID == nil else {
            throw ContractError.issue("Finish the active grading run before rejecting the evaluation.")
        }
        try editAnswer(examID, answerID) {
            $0.finalMarks = nil
            $0.decision = nil
            $0.status = .rejected
        }
    }

    func saveSettings(_ settings: WorkspaceSettings) throws {
        let permitted = settings.cloudModel.range(of: #"^gemini-[A-Za-z0-9.-]{1,60}$"#, options: .regularExpression) != nil
        guard permitted, settings.inputRate.isFinite, settings.inputRate >= 0,
              settings.outputRate.isFinite, settings.outputRate >= 0,
              settings.fallbackInputTokens >= 0, settings.fallbackOutputTokens >= 0 else {
            throw ContractError.issue("Enter a Gemini model ID and nonnegative pricing and token values.")
        }
        try change { $0.settings = settings }
    }

    func testModel(_ source: InferenceSource?, model: String) async throws -> String {
        if (source == .cloud || source == nil), isOffline {
            throw ContractError.issue("You are offline. Reconnect to test cloud inference.")
        }
        let sample = try ExamRecord.sample()
        guard let question = sample.pack?.questions.first, let answer = sample.answers.first else {
            throw ContractError.issue("The sample probe requires a valid rubric and answer.")
        }
        let prompt = try GradingPrompts.load().evaluate(answer, question: question)
        let reply: ModelReply
        if let source {
            reply = try await inference.generate(prompt, source: source, model: model)
        } else {
            reply = try await inference.probeHybrid(prompt, model: model)
        }
        let grade = try GradingResult.parse(reply.text)
        try grade.validate(question: question, answer: answer.text)
        guard (source == nil || reply.source == source), !grade.uncertain else {
            throw ContractError.issue("The probe did not return a clear result from the selected model.")
        }
        return "\(reply.source.rawValue) • \(reply.model) • \(grade.marks.formatted())/2 marks • \(reply.latencyMs) ms"
    }

    private func editAnswer(_ exam: UUID, _ answer: UUID, _ edit: (inout StudentAnswer) throws -> Void) throws {
        try editExam(exam) { record in
            guard let index = record.answers.firstIndex(where: { $0.id == answer }) else { return }
            try edit(&record.answers[index])
        }
    }

    private func editExam(_ id: UUID, _ edit: (inout ExamRecord) throws -> Void) throws {
        try change { state in
            guard let index = state.exams.firstIndex(where: { $0.id == id }) else { return }
            try edit(&state.exams[index])
        }
    }

    private func change(_ update: (inout Workspace) throws -> Void) throws {
        guard canWrite else {
            throw ContractError.issue("The local workspace could not be loaded. Existing data has been kept.")
        }
        var next = workspace
        try update(&next)
        var directory = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var attributes = URLResourceValues()
        attributes.isExcludedFromBackup = true
        try directory.setResourceValues(attributes)
        let data = try JSONEncoder().encode(next)
        try data.write(to: file, options: [.atomic, .completeFileProtection])
        workspace = next
    }
}
