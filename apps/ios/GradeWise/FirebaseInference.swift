import FirebaseAILogic
import FirebaseAppCheck
import FirebaseCore
import Foundation
import FoundationModels

struct FirebaseInference {
    static var isConfigured: Bool { FirebaseApp.app() != nil }

    static var deviceStatus: String {
        switch FirebaseAI.SystemLanguageModel.default.availability {
        case .available: "Apple Foundation Models ready"
        case .unavailable(.deviceNotEligible): "This device does not support Apple Intelligence"
        case .unavailable(.appleIntelligenceNotEnabled): "Enable Apple Intelligence in Settings"
        case .unavailable(.modelNotReady): "Apple Intelligence model is downloading"
        case .unavailable: "Apple Foundation Models unavailable"
        }
    }

    static var deviceAvailable: Bool { FirebaseAI.SystemLanguageModel.default.isAvailable }

    func verifyAppCheck() async throws {
        guard Self.isConfigured else { throw InferenceError.configuration }
        _ = try await AppCheck.appCheck().token(forcingRefresh: false)
    }

    func generate(_ prompt: String, source: InferenceSource, model: String, rubric: Bool = false) async throws -> ModelReply {
        guard Self.isConfigured else { throw InferenceError.configuration }
        if source == .device, !Self.deviceAvailable { throw InferenceError.unavailable }

        let started = ProcessInfo.processInfo.systemUptime
        let ai = FirebaseAI.firebaseAI(backend: .googleAI())
        switch source {
        case .device:
            // A device-only Firebase session ensures the SDK cannot send the answer to the cloud.
            guard #available(iOS 26.0, *) else { throw InferenceError.unavailable }
            let session = ai.generativeModelSession(model: FirebaseAI.SystemLanguageModel.default)
            let result = try await session.respond(
                to: prompt,
                generating: DeviceGrade.self,
                includeSchemaInPrompt: false,
                options: FirebaseAI.GenerationOptions(sampling: .greedy, maximumResponseTokens: 1_024)
            )
            return try reply(try encodeJSON(result.content), response: result.rawResponse, started: started)
        case .cloud:
            let cloud = ai.generativeModel(
                modelName: model,
                generationConfig: GenerationConfig(
                    maxOutputTokens: rubric ? 8192 : 2048,
                    responseMIMEType: "application/json",
                    responseSchema: try cloudSchema(rubric ? "rubric-response.v1" : "grading-result.v1")
                )
            )
            let result = try await cloud.generateContent(prompt)
            return try reply(result.text, response: result, started: started)
        }
    }

    func probeHybrid(_ syntheticPrompt: String, model: String) async throws -> ModelReply {
        guard Self.isConfigured else { throw InferenceError.configuration }
        let started = ProcessInfo.processInfo.systemUptime
        let ai = FirebaseAI.firebaseAI(backend: .googleAI())
        let hybrid = HybridModelProvider.hybridModel(
            primary: FirebaseAI.SystemLanguageModel.default,
            secondary: ai.geminiModel(name: model)
        )
        let session = ai.generativeModelSession(model: hybrid)
        let result = try await session.respond(to: syntheticPrompt)
        return try reply(result.content, response: result.rawResponse, started: started)
    }

    private func reply(_ text: String?, response: GenerateContentResponse, started: TimeInterval) throws -> ModelReply {
        guard let text, !text.trimmed.isEmpty, !response.modelVersion.isEmpty else {
            throw InferenceError.noOutput
        }
        let model = response.modelVersion
        return ModelReply(
            text: text,
            source: model == "apple-foundation-models-system-language-model" ? .device : .cloud,
            model: model,
            latencyMs: Int((ProcessInfo.processInfo.systemUptime - started) * 1_000),
            inputTokens: response.usageMetadata?.promptTokenCount,
            outputTokens: response.usageMetadata.map { $0.candidatesTokenCount + $0.thoughtsTokenCount }
        )
    }

    private func cloudSchema(_ name: String) throws -> Schema {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json") else {
            throw ContractError.issue("The Firebase JSON response schema is missing.")
        }
        let contract = try JSONDecoder().decode(JSONObject.self, from: Data(contentsOf: url))
        return try convertSchema(contract)
    }

    private func convertSchema(_ contract: JSONObject) throws -> Schema {
        switch contract["type"] {
        case .string("object"):
            if case let .object(properties) = contract["properties"] {
                let fields = try properties.mapValues { child -> Schema in
                    guard case let .object(node) = child else {
                        throw ContractError.issue("A response schema field is invalid.")
                    }
                    return try convertSchema(node)
                }
                return .object(properties: fields)
            }
        case .string("array"):
            if case let .object(item) = contract["items"] {
                return .array(items: try convertSchema(item))
            }
        case .string("number"): return .double()
        case .string("string"): return .string()
        case .string("boolean"): return .boolean()
        default: break
        }
        throw ContractError.issue("The Firebase response schema contains an unsupported JSON type.")
    }
}

@available(iOS 26.0, *)
@Generable
private struct DeviceGrade: Codable {
    let marks: Double
    let explanation: String
    let criteria: [DeviceCriterion]
    let uncertain: Bool
}

@available(iOS 26.0, *)
@Generable
private struct DeviceCriterion: Codable {
    let criterionId: String
    let marks: Double
    let evidence: String
}
