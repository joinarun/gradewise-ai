import Foundation

extension ExamRecord {
    private struct BenchmarkAnswer: Decodable {
        let questionId: String
        let answer: String
        let teacherMarks: Double?
    }

    static func sample(bundle: Bundle = .main) throws -> Self {
        func contents(_ name: String, as fileExtension: String) throws -> Data {
            guard let url = bundle.url(forResource: name, withExtension: fileExtension) else {
                throw ContractError.issue("The shared sample resource \(name).\(fileExtension) is missing.")
            }
            return try Data(contentsOf: url)
        }

        let decoder = JSONDecoder()
        var pack = try decoder.decode(GradingPack.self, from: contents("roots.v1", as: "json"))
        try pack.validate()
        pack.approvedAt = nil
        let fixtures = try decoder.decode([BenchmarkAnswer].self, from: contents("roots", as: "json"))
        let answers = fixtures.enumerated().map { index, fixture in
            StudentAnswer(student: String(format: "Sample %02d", index + 1), questionID: fixture.questionId,
                          text: fixture.answer, expectedMarks: fixture.teacherMarks)
        }
        return Self(
            metadata: pack.exam,
            questionPaper: String(decoding: try contents("question-paper", as: "txt"), as: UTF8.self),
            answerKey: String(decoding: try contents("answer-key", as: "txt"), as: UTF8.self),
            pack: pack,
            answers: answers,
            isSample: true
        )
    }
}
