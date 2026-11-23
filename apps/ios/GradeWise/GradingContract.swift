import Foundation

struct ExamMetadata: Codable, Equatable {
    var name = ""
    var subject = ""
    var className = ""
    var date = ""
    var maxMarks = 0.0
    var autoApprove = false
}

struct Criterion: Codable, Equatable, Identifiable {
    var id: String
    var description: String
    var maxMarks: Double
    var partialCredit: String
}

struct AnswerExamples: Codable, Equatable {
    var correct: [String]
    var incorrect: [String]
}

struct Question: Codable, Equatable, Identifiable {
    var id: String
    var text: String
    var referenceAnswer: String
    var maxMarks: Double
    var criteria: [Criterion]
    var alternatives: [String]
    var examples: AnswerExamples
    var constraints: [String]
}

struct GradingPack: Codable, Equatable {
    var schemaVersion = 1
    var exam: ExamMetadata
    var questions: [Question]
    var approvedAt: String?

    static func draft(from text: String, exam: ExamMetadata) throws -> Self {
        let generated = try decode(RubricDraft.self, from: text)
        let pack = Self(exam: exam, questions: generated.questions, approvedAt: nil)
        try pack.validate()
        return pack
    }

    func validate() throws {
        guard schemaVersion == 1 else { throw ContractError.issue("Unsupported grading pack version.") }
        try exam.validate()
        guard !questions.isEmpty, questions.count <= 60 else {
            throw ContractError.issue("A rubric must include between 1 and 60 questions.")
        }

        var questionIDs = Set<String>()
        for question in questions {
            guard validIdentifier(question.id), questionIDs.insert(question.id.lowercased()).inserted,
                  allowedText(question.text, limit: 2_000), allowedText(question.referenceAnswer, limit: 2_000),
                  validMarks(question.maxMarks, allowZero: false),
                  !question.criteria.isEmpty, question.criteria.count <= 16,
                  allowedList(question.alternatives, limit: 400),
                  allowedList(question.examples.correct, limit: 400),
                  allowedList(question.examples.incorrect, limit: 400),
                  allowedList(question.constraints, limit: 500) else {
                throw ContractError.issue("Check the ID, text, answer, marks, and criteria for question \(question.id).")
            }
            var criterionIDs = Set<String>()
            for criterion in question.criteria {
                guard validIdentifier(criterion.id), criterionIDs.insert(criterion.id.lowercased()).inserted,
                      allowedText(criterion.description, limit: 500), allowedText(criterion.partialCredit, limit: 500),
                      validMarks(criterion.maxMarks, allowZero: false) else {
                    throw ContractError.issue("Check criterion \(criterion.id) on question \(question.id).")
                }
            }
            guard equalMarks(question.criteria.reduce(0) { $0 + $1.maxMarks }, question.maxMarks) else {
                throw ContractError.issue("Criterion marks must total \(question.maxMarks.formatted()) for question \(question.id).")
            }
        }
        guard equalMarks(questions.reduce(0) { $0 + $1.maxMarks }, exam.maxMarks) else {
            throw ContractError.issue("Question marks must total the exam maximum of \(exam.maxMarks.formatted()).")
        }
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(schemaVersion, forKey: .schemaVersion)
        try values.encode(exam, forKey: .exam)
        try values.encode(questions, forKey: .questions)
        try values.encode(approvedAt, forKey: .approvedAt)
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, exam, questions, approvedAt
    }

    private struct RubricDraft: Codable {
        let questions: [Question]
    }
}

struct CriterionResult: Codable, Equatable, Identifiable {
    let criterionId: String
    let marks: Double
    let evidence: String
    var id: String { criterionId }
}

struct GradingResult: Codable, Equatable {
    let marks: Double
    let explanation: String
    let criteria: [CriterionResult]
    let uncertain: Bool

    static func parse(_ text: String) throws -> Self { try decode(Self.self, from: text) }

    func validate(question: Question, answer: String) throws {
        guard validMarks(marks), marks <= question.maxMarks, allowedText(explanation, limit: 1_200) else {
            throw ContractError.issue("The proposed total or explanation is invalid.")
        }
        let results = Set(criteria.map(\.criterionId))
        guard results.count == criteria.count, results == Set(question.criteria.map(\.id)) else {
            throw ContractError.issue("A criterion is missing, duplicated, or unknown.")
        }
        let normalizedAnswer = normalizeEvidence(answer)
        for score in criteria {
            guard let rule = question.criteria.first(where: { $0.id == score.criterionId }),
                  validMarks(score.marks), score.marks <= rule.maxMarks, score.evidence.trimmed.utf16.count <= 600 else {
                throw ContractError.issue("A criterion score exceeds its rubric limit.")
            }
            if score.marks > 0 {
                let evidence = normalizeEvidence(score.evidence)
                guard evidence.range(of: #"[\p{L}\p{N}]"#, options: .regularExpression) != nil,
                      normalizedAnswer.contains(evidence) else {
                    throw ContractError.issue("An awarded criterion lacks a literal quote from the answer.")
                }
            }
        }
        guard equalMarks(criteria.reduce(0) { $0 + $1.marks }, marks) else {
            throw ContractError.issue("The total does not equal the sum of criterion scores.")
        }
    }
}

enum ContractError: LocalizedError {
    case issue(String)

    var errorDescription: String? {
        switch self { case let .issue(message): message }
    }
}

extension ExamMetadata {
    func validate() throws {
        guard allowedText(name, limit: 160), allowedText(subject, limit: 100), allowedText(className, limit: 100),
              date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
              (try? Date(date, strategy: Date.ISO8601FormatStyle().year().month().day().dateSeparator(.dash))) != nil,
              validMarks(maxMarks, allowZero: false) else {
            throw ContractError.issue("Enter an exam name, subject, class, date, and positive maximum marks.")
        }
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

func validIdentifier(_ value: String) -> Bool {
    value.range(of: #"^[A-Za-z0-9][A-Za-z0-9_.()-]{0,39}$"#, options: .regularExpression) != nil
}

func validMarks(_ value: Double, allowZero: Bool = true) -> Bool {
    value.isFinite && ((allowZero ? 0 : 0.5)...1_000).contains(value) && (value * 2).rounded() == value * 2
}

private func allowedText(_ value: String, limit: Int) -> Bool {
    !value.trimmed.isEmpty && value.trimmed.utf16.count <= limit
}

private func allowedList(_ values: [String], limit: Int) -> Bool {
    values.count <= 12 && values.allSatisfy { allowedText($0, limit: limit) }
}

private func normalizeEvidence(_ value: String) -> String {
    value.precomposedStringWithCompatibilityMapping.lowercased()
        .split(whereSeparator: \.isWhitespace).joined(separator: " ")
}

func equalMarks(_ lhs: Double, _ rhs: Double) -> Bool {
    abs(lhs - rhs) < 0.000_001
}

func encodeJSON<T: Encodable>(_ value: T, pretty: Bool = false) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = pretty ? [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes] : [.sortedKeys, .withoutEscapingSlashes]
    return String(decoding: try encoder.encode(value), as: UTF8.self)
}

private func decode<T: Decodable>(_ type: T.Type, from text: String) throws -> T {
    var contents = text.trimmed
    if contents.hasPrefix("```json\n"), contents.hasSuffix("\n```") {
        contents = String(contents.dropFirst(8).dropLast(4))
    }
    do {
        return try JSONDecoder().decode(type, from: Data(contents.utf8))
    } catch {
        if let error = error as? DecodingError {
            throw ContractError.issue("The JSON does not match the grading contract. \(error.localizedDescription)")
        }
        throw ContractError.issue("The JSON does not match the grading contract.")
    }
}
