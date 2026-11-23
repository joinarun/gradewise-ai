import Foundation

enum AnswerStatus: String, Codable, CaseIterable {
    case queued = "Queued"
    case unresolved = "Unresolved"
    case review = "Needs review"
    case finalized = "Finalized"
    case rejected = "Rejected"
}

enum GradeDecision: String, Codable {
    case approved = "Teacher approved"
    case override = "Teacher override"
    case automatic = "Auto-approved"
}

struct StudentAnswer: Codable, Equatable, Identifiable {
    var id = UUID()
    var student: String
    var questionID: String
    var text: String
    var status: AnswerStatus = .queued
    var attempts: [InferenceAttempt] = []
    var notes: [String] = []
    var proposal: GradingResult?
    var finalMarks: Double?
    var decision: GradeDecision?
    var expectedMarks: Double?
}

struct ExamRecord: Codable, Equatable, Identifiable {
    var id = UUID()
    var metadata: ExamMetadata
    var questionPaper = ""
    var answerKey = ""
    var pack: GradingPack?
    var answers: [StudentAnswer] = []
    var preparationAttempts: [InferenceAttempt] = []
    var isSample = false

    var approved: Bool { pack?.approvedAt != nil }

    var finalized: [StudentAnswer] { answers.filter { $0.status == .finalized && $0.finalMarks != nil } }

    var approvalLabel: String {
        if approved { return "Rubric approved" }
        return pack == nil ? "Draft" : "Rubric ready to review"
    }

    func resultsCSV() -> String {
        let header = "Student,Question,Final marks,Maximum marks,Decision"
        let lines = finalized.compactMap { answer -> String? in
            guard let question = pack?.questions.first(where: { $0.id == answer.questionID }),
                  let marks = answer.finalMarks else { return nil }
            return [csvCell(answer.student), csvCell(question.id), String(marks), String(question.maxMarks),
                    csvCell(answer.decision?.rawValue ?? "")].joined(separator: ",")
        }
        return ([header] + lines).joined(separator: "\r\n") + "\r\n"
    }

    private func csvCell(_ value: String) -> String {
        let sanitized = value.first.map { "=+-@\t\r\n".contains($0) } == true ? "'" + value : value
        return "\"" + sanitized.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
}

struct WorkspaceSettings: Codable, Equatable {
    var policy: InferencePolicy = .preferDevice
    var cloudModel = "gemini-3.5-flash-lite"
    var inputRate = 0.30
    var outputRate = 2.50
    var fallbackInputTokens = 400
    var fallbackOutputTokens = 120
}

struct Workspace: Codable, Equatable {
    var exams: [ExamRecord] = []
    var settings = WorkspaceSettings()
}

struct ExamMetrics {
    let students: Int
    let questions: Int
    let answersEvaluated: Int
    let localCount: Int
    let cloudCount: Int
    let preparationCount: Int
    let failures: Int
    let escalationRate: Double?
    let averageLatencyMs: Double?
    let overrideRate: Double?
    let benchmarkAgreement: Double?
    let benchmarkCount: Int
    let cloudCost: Double
    let estimatedRequests: Int
    let cloudChargesAvoided: Double

    init(exam: ExamRecord, settings: WorkspaceSettings) {
        let answers = exam.answers
        let evaluated = answers.filter { $0.proposal != nil }
        students = Set(evaluated.map(\.student)).count
        questions = Set(evaluated.map(\.questionID)).count
        answersEvaluated = evaluated.count

        let attempts = answers.flatMap(\.attempts)
        let gradingCloud = attempts.filter { $0.source == .cloud }
        let preparation = exam.preparationAttempts.filter { $0.source == .cloud }
        let cloud = gradingCloud + preparation
        localCount = attempts.filter { $0.source == .device }.count
        cloudCount = gradingCloud.count
        preparationCount = preparation.count
        failures = (attempts + exam.preparationAttempts).filter(\.failure).count

        let attempted = answers.filter { $0.attempts.contains(where: \.actualRequest) }
        let escalated = attempted.filter { $0.attempts.contains { $0.escalatedFromDevice == true } }
        escalationRate = Self.rate(escalated.count, of: attempted.count)
        let latencies = (attempts + exam.preparationAttempts).compactMap(\.latencyMs)
        averageLatencyMs = latencies.isEmpty ? nil : Double(latencies.reduce(0, +)) / Double(latencies.count)
        overrideRate = Self.rate(exam.finalized.filter { $0.decision == .override }.count, of: exam.finalized.count)
        let benchmark = evaluated.filter { $0.expectedMarks != nil }
        let matched = benchmark.filter { equalMarks($0.proposal?.marks ?? -1, $0.expectedMarks ?? -2) }
        benchmarkCount = benchmark.count
        benchmarkAgreement = Self.rate(matched.count, of: benchmark.count)

        let fallbackEstimate = Self.cost(settings.fallbackInputTokens, settings.fallbackOutputTokens, settings)
        cloudCost = cloud.reduce(0) {
            $0 + Self.cost($1.inputTokens ?? settings.fallbackInputTokens,
                           $1.outputTokens ?? settings.fallbackOutputTokens, settings)
        }
        estimatedRequests = cloud.filter { $0.inputTokens == nil || $0.outputTokens == nil }.count
        let onDeviceSuccesses = answers.filter { answer in
            answer.proposal != nil &&
                answer.attempts.contains { $0.source == .device && $0.usable } &&
                !answer.attempts.contains { $0.requestedSource == .cloud && $0.actualRequest }
        }
        cloudChargesAvoided = Double(onDeviceSuccesses.count) * fallbackEstimate
    }

    private static func rate(_ count: Int, of total: Int) -> Double? {
        total > 0 ? Double(count) / Double(total) : nil
    }

    private static func cost(_ input: Int, _ output: Int, _ settings: WorkspaceSettings) -> Double {
        (Double(input) * settings.inputRate + Double(output) * settings.outputRate) / 1_000_000
    }
}
