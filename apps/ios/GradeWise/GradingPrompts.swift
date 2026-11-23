import Foundation

struct GradingPrompts: Decodable {
    let rubric: String
    let grade: String

    static func load(bundle: Bundle = .main) throws -> Self {
        guard let url = bundle.url(forResource: "instructions", withExtension: "json") else {
            throw ContractError.issue("The grading prompt resource is missing.")
        }
        return try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    }

    func prepare(_ exam: ExamRecord) throws -> String {
        guard exam.questionPaper.utf16.count <= 30_000, exam.answerKey.utf16.count <= 30_000 else {
            throw ContractError.issue("The question paper and answer key must each contain no more than 30,000 characters.")
        }
        let input = RubricInput(exam: exam.metadata, paper: exam.questionPaper, answerKey: exam.answerKey)
        return rubric + "\nINPUT\n" + (try encodeJSON(input))
    }

    func evaluate(_ answer: StudentAnswer, question: Question) throws -> String {
        let input = GradeInput(rubric: question, answer: answer.text)
        return grade + "\nINPUT\n" + (try encodeJSON(input))
    }

    private struct RubricInput: Encodable {
        let exam: ExamMetadata
        let paper: String
        let answerKey: String
    }

    private struct GradeInput: Encodable {
        let rubric: Question
        let answer: String
    }
}
