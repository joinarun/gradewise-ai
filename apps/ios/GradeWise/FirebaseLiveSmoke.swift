#if DEBUG
import FirebaseCore
import Foundation

@MainActor
enum FirebaseLiveSmoke {
    private struct Check: Encodable {
        var status: String
        var detail: String
        var model: String?
        var source: String?
        var inputTokens: Int?
        var outputTokens: Int?
        var latencyMs: Int?
    }

    private struct Report: Encodable {
        var deviceStatus: String
        var checks: [String: Check] = [:]
        var finished = false
    }

    static func runIfRequested() async {
        guard let value = ProcessInfo.processInfo.environment["GRADEWISE_LIVE_SMOKE_ID"],
              let runID = UUID(uuidString: value) else { return }
        let file = FileManager.default.temporaryDirectory.appending(path: "gradewise-live-\(runID.uuidString).json")
        var report = Report(deviceStatus: FirebaseInference.deviceStatus)
        func save() {
            guard let data = try? JSONEncoder().encode(report) else { return }
            try? data.write(to: file, options: .atomic)
        }

        let model = WorkspaceSettings().cloudModel
        let inference = FirebaseInference()
        func run(_ label: String, _ exercise: () async throws -> Check) async {
            report.checks[label] = Check(status: "running", detail: "")
            save()
            do {
                report.checks[label] = try await exercise()
            } catch {
                report.checks[label] = Check(status: "failed", detail: diagnostic(error))
            }
            save()
        }

        await run("appCheck") {
            try await inference.verifyAppCheck()
            return Check(status: "passed", detail: "Firebase App Check SDK returned a token.")
        }
        let packFixture: ExamRecord
        let prompts: GradingPrompts
        do {
            packFixture = try ExamRecord.sample()
            prompts = try GradingPrompts.load()
        } catch {
            report.checks["fixtures"] = Check(status: "failed", detail: diagnostic(error))
            report.finished = true
            save()
            return
        }

        await run("cloudRubric") {
            let prompt = try prompts.prepare(packFixture)
            let reply = try await inference.generate(prompt, source: .cloud, model: model, rubric: true)
            let pack = try GradingPack.draft(from: reply.text, exam: packFixture.metadata)
            guard reply.source == .cloud, pack.questions.count == 2 else {
                throw ContractError.issue("Firebase did not return the expected two-question cloud rubric.")
            }
            return receipt(reply, detail: "\(pack.questions.count) questions, \(pack.exam.maxMarks.formatted()) total marks")
        }

        if let question = packFixture.pack?.questions.first, let answer = packFixture.answers.first {
            await run("cloudGrade") {
                let prompt = try prompts.evaluate(answer, question: question)
                let reply = try await inference.generate(prompt, source: .cloud, model: model)
                return try validate(reply, expected: .cloud, question: question, answer: answer)
            }
            if FirebaseInference.deviceAvailable {
                await run("deviceGrade") {
                    let prompt = try prompts.evaluate(answer, question: question)
                    let reply = try await inference.generate(prompt, source: .device, model: model)
                    return try validate(reply, expected: .device, question: question, answer: answer)
                }
            } else {
                report.checks["deviceGrade"] = Check(status: "skipped", detail: report.deviceStatus)
            }
            await run("sdkHybrid") {
                let prompt = try prompts.evaluate(answer, question: question)
                let reply = try await inference.probeHybrid(prompt, model: model)
                return try validate(reply, expected: nil, question: question, answer: answer)
            }
        } else {
            report.checks["fixtures"] = Check(status: "failed", detail: "The shared fixture has no question or answer.")
        }

        report.finished = true
        save()
    }

    private static func validate(_ reply: ModelReply, expected: InferenceSource?, question: Question, answer: StudentAnswer) throws -> Check {
        let score = try GradingResult.parse(reply.text)
        try score.validate(question: question, answer: answer.text)
        guard expected == nil || reply.source == expected, !score.uncertain, score.marks == answer.expectedMarks else {
            throw ContractError.issue("Unexpected synthetic grade or inference source. Returned \(score.marks.formatted()) marks from \(reply.model).")
        }
        return receipt(reply, detail: "\(score.marks.formatted())/\(question.maxMarks.formatted()) marks with valid rubric evidence")
    }

    private static func receipt(_ reply: ModelReply, detail: String) -> Check {
        Check(status: "passed", detail: detail, model: reply.model, source: reply.source.rawValue,
              inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, latencyMs: reply.latencyMs)
    }

    private static func diagnostic(_ error: Error) -> String {
        var message = String(describing: error)
        let debugSecret = ProcessInfo.processInfo.environment["FIRAAppCheckDebugToken"]
        for secret in [debugSecret, FirebaseApp.app()?.options.apiKey].compactMap({ $0 }) where !secret.isEmpty {
            message = message.replacingOccurrences(of: secret, with: "[redacted]")
        }
        return String(message.prefix(800))
    }
}
#endif
