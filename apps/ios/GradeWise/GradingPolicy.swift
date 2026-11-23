import Foundation

enum InferencePolicy: String, Codable, CaseIterable, Identifiable {
    case preferDevice = "prefer-device"
    case deviceOnly = "device-only"
    case cloudOnly = "cloud-only"
    case cloudFirst = "cloud-first"
    var id: String { rawValue }

    var title: String {
        switch self {
        case .preferDevice: "Prefer on-device"
        case .deviceOnly: "On-device only"
        case .cloudOnly: "Cloud only"
        case .cloudFirst: "Cloud first"
        }
    }

    var first: InferenceSource {
        switch self {
        case .preferDevice, .deviceOnly: .device
        case .cloudOnly, .cloudFirst: .cloud
        }
    }

    var fallback: InferenceSource? {
        switch self {
        case .preferDevice: .cloud
        case .cloudFirst: .device
        case .deviceOnly, .cloudOnly: nil
        }
    }
}

enum InferenceSource: String, Codable {
    case device = "On-device"
    case cloud = "Cloud"
}

enum InferenceError: LocalizedError {
    case configuration
    case unavailable
    case noOutput

    var errorDescription: String? {
        switch self {
        case .configuration:
            "Firebase is unavailable. Add the registered iOS app's configuration."
        case .unavailable:
            "The on-device model is unavailable. Enable Apple Intelligence on a compatible device."
        case .noOutput:
            "Firebase returned an empty model response."
        }
    }
}

struct ModelReply {
    let text: String
    let source: InferenceSource
    let model: String
    let latencyMs: Int
    let inputTokens: Int?
    let outputTokens: Int?
}

struct InferenceAttempt: Codable, Equatable, Identifiable {
    var id = UUID()
    let requestedSource: InferenceSource
    var source: InferenceSource?
    var model: String?
    var latencyMs: Int?
    var inputTokens: Int?
    var outputTokens: Int?
    var result: GradingResult?
    var warnings: [String] = []
    var failure = false
    var actualRequest = false
    var escalatedFromDevice: Bool?

    var usable: Bool { source != nil && result != nil && warnings.isEmpty }
}

struct GradingOutcome {
    var attempts: [InferenceAttempt]
    var reviewNotes: [String]
    var proposal: GradingResult?
    var unresolved: Bool
}

@MainActor
struct GradingPolicy {
    typealias Generate = @MainActor (String, InferenceSource) async throws -> ModelReply

    func grade(
        _ answer: String,
        question: Question,
        prompt: String,
        policy: InferencePolicy,
        consent: Bool,
        isOffline: Bool,
        generate: Generate
    ) async -> GradingOutcome {
        let unreadable = answer.range(of: #"[\p{L}\p{N}]"#, options: .regularExpression) == nil ||
            ["[illegible]", "[unreadable]", "[blank]"].contains(answer.trimmed.lowercased())
        if unreadable {
            return GradingOutcome(
                attempts: [], reviewNotes: ["The answer appears unreadable. Check the original and enter teacher marks."],
                proposal: nil, unresolved: false
            )
        }
        var attempts = [await attempt(policy.first, answer: answer, question: question, prompt: prompt,
                                      consent: consent, isOffline: isOffline, generate: generate)]
        if let fallback = policy.fallback, !attempts[0].usable {
            var secondary = await attempt(fallback, answer: answer, question: question, prompt: prompt,
                                          consent: consent, isOffline: isOffline, generate: generate)
            secondary.escalatedFromDevice = fallback == .cloud && secondary.actualRequest
            attempts.append(secondary)
        }
        let candidates = attempts.compactMap(\.result)
        var notes: [String] = []
        if candidates.count == 2, disagree(candidates[0], candidates[1]) {
            notes.append("The on-device and cloud scores disagree. Review both proposals.")
        }
        if attempts.contains(where: { $0.source == .cloud && $0.result?.uncertain == true }) {
            notes.append("The cloud model flagged uncertainty. Review its proposal.")
        }
        let usable = attempts.last(where: \.usable)
        if usable == nil {
            notes.append(contentsOf: attempts.flatMap(\.warnings))
        }
        return GradingOutcome(
            attempts: attempts,
            reviewNotes: notes,
            proposal: usable?.result ?? candidates.last,
            unresolved: usable == nil && (candidates.isEmpty || attempts.contains {
                $0.requestedSource == .cloud && !$0.actualRequest
            })
        )
    }

    private func disagree(_ first: GradingResult, _ second: GradingResult) -> Bool {
        first.marks != second.marks || first.criteria.contains { result in
            result.marks != second.criteria.first { $0.criterionId == result.criterionId }?.marks
        }
    }

    private func attempt(_ source: InferenceSource, answer: String, question: Question, prompt: String,
                         consent: Bool, isOffline: Bool, generate: Generate) async -> InferenceAttempt {
        var attempt = InferenceAttempt(requestedSource: source)
        if source == .cloud && !consent {
            attempt.warnings = ["Cloud grading needs permission for this run."]
            return attempt
        }
        if source == .cloud && isOffline {
            attempt.warnings = ["Offline. The answer remains available to retry."]
            return attempt
        }
        if source == .device && prompt.utf16.count > 7_000 {
            attempt.warnings = ["The answer and rubric exceed the on-device grading limit."]
            return attempt
        }
        if answer.utf16.count > 12_000 || prompt.utf8.count > 40_000 {
            attempt.warnings = ["The answer and rubric exceed the grading limit. Review the answer manually."]
            return attempt
        }

        do {
            let reply = try await generate(prompt, source)
            attempt.actualRequest = true
            attempt.source = reply.source
            attempt.model = reply.model
            attempt.latencyMs = reply.latencyMs
            attempt.inputTokens = reply.inputTokens
            attempt.outputTokens = reply.outputTokens
            guard reply.source == source else {
                throw ContractError.issue("Firebase reported a different inference source than the requested policy.")
            }
            let parsed = try GradingResult.parse(reply.text)
            try parsed.validate(question: question, answer: answer)
            attempt.result = parsed
            if parsed.uncertain {
                attempt.warnings.append("The model flagged uncertainty about the answer.")
            }
        } catch {
            let serviceError = error as? InferenceError
            attempt.actualRequest = serviceError != .configuration && serviceError != .unavailable
            attempt.failure = attempt.actualRequest
            if serviceError == nil && attempt.source == nil {
                attempt.warnings = ["\(source.rawValue) request failed. Verify connectivity and Firebase App Check in Settings."]
            } else {
                attempt.warnings = [error.localizedDescription]
            }
        }
        return attempt
    }
}
