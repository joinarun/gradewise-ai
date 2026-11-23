import SwiftUI
import UniformTypeIdentifiers

struct AnswerReviewView: View {
    @ObservedObject var store: WorkspaceStore
    let examID: UUID
    let answerID: UUID
    @State private var override: Double?
    @State private var error: String?
    @State private var confirmingCloud = false
    @FocusState private var editingMarks: Bool

    var body: some View {
        if let exam = store.exam(examID),
           let answer = exam.answers.first(where: { $0.id == answerID }),
           let question = exam.pack?.questions.first(where: { $0.id == answer.questionID }) {
            Form {
                Section("Student answer") {
                    LabeledContent("Question", value: question.id)
                    LabeledContent("Status", value: answer.status.rawValue)
                    Text(answer.text).textSelection(.enabled)
                }
                Section("Approved rubric") {
                    QuestionSummary(question: question)
                }
                Section("Evaluation") {
                    if let proposal = answer.proposal {
                        LabeledContent("Proposed marks", value: score(proposal.marks, outOf: question.maxMarks))
                        Text(proposal.explanation)
                    }
                    ForEach(answer.notes, id: \.self) { note in
                        Label(note, systemImage: "exclamationmark.triangle")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                    ForEach(answer.attempts) { attempt in
                        DisclosureGroup(attempt.source?.rawValue ?? "\(attempt.requestedSource.rawValue) attempt") {
                            if let model = attempt.model { LabeledContent("Model", value: model) }
                            if let latency = attempt.latencyMs { LabeledContent("Latency", value: "\(latency) ms") }
                            if let result = attempt.result {
                                LabeledContent("Marks", value: score(result.marks, outOf: question.maxMarks))
                                Text(result.explanation)
                                ForEach(result.criteria) { criterion in
                                    VStack(alignment: .leading, spacing: 4) {
                                        let description = question.criteria.first(where: { $0.id == criterion.criterionId })?.description
                                        Text(description ?? criterion.criterionId).font(.subheadline.weight(.medium))
                                        Text("\(criterion.marks.formatted()) marks").font(.caption)
                                        if !criterion.evidence.isEmpty {
                                            Text("“\(criterion.evidence)”").font(.subheadline)
                                        }
                                    }
                                }
                            }
                            ForEach(attempt.warnings, id: \.self) { Text($0).font(.footnote).foregroundStyle(.orange) }
                        }
                    }
                    if store.runningExamID == nil, answer.status == .queued || answer.status == .unresolved {
                        Button(answer.status == .unresolved ? "Retry answer" : "Grade answer", systemImage: "play.circle") {
                            if store.workspace.settings.policy == .deviceOnly || store.isOffline || !FirebaseInference.isConfigured {
                                run(false)
                            } else { confirmingCloud = true }
                        }
                    }
                }
                Section("Teacher decision") {
                    if let marks = answer.finalMarks {
                        LabeledContent("Final marks", value: score(marks, outOf: question.maxMarks))
                            .accessibilityIdentifier("final-marks")
                        if let decision = answer.decision { Text(decision.rawValue).font(.footnote) }
                    }
                    if answer.proposal != nil, answer.status != .finalized {
                        Button("Approve proposed marks", systemImage: "checkmark.circle") { finalize() }
                    }
                    TextField("Marks", value: $override, format: .number, prompt: Text("0–\(question.maxMarks.formatted())"))
                        .keyboardType(.decimalPad)
                        .focused($editingMarks)
                        .accessibilityIdentifier("override-marks")
                    Button("Save teacher marks", systemImage: "square.and.pencil") {
                        guard let override else { return }
                        editingMarks = false
                        finalize(override)
                    }
                    .disabled(override == nil || store.runningExamID != nil)
                    .accessibilityIdentifier("save-teacher-marks")
                    if answer.status == .review || answer.status == .unresolved {
                        Button("Reject evaluation", role: .destructive) {
                            do { try store.reject(examID, answerID); error = nil }
                            catch { self.error = error.localizedDescription }
                        }
                        .disabled(store.runningExamID != nil)
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle(answer.student)
            .navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { editingMarks = false }
                }
            }
            .confirmationDialog("Allow cloud grading for this answer?", isPresented: $confirmingCloud, titleVisibility: .visible) {
                Button("Allow cloud grading") { run(true) }
                Button("Continue without cloud") { run(false) }
            } message: {
                Text("Answer text and the approved rubric will be sent to Gemini if required by your policy. Use only synthetic or non-sensitive answers with the demo project.")
            }
        }
    }

    private func run(_ consent: Bool) {
        Task { await store.startBatch(examID, consent: consent, answerID: answerID, retry: true) }
    }

    private func finalize(_ marks: Double? = nil) {
        do { try store.finalize(examID, answerID, marks: marks); error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct ResultsView: View {
    let exam: ExamRecord
    let settings: WorkspaceSettings
    @State private var exporting = false
    @State private var message: String?

    var body: some View {
        let metrics = ExamMetrics(exam: exam, settings: settings)
        Form {
            Section("Finalized results") {
                if exam.finalized.isEmpty { Text("Finalized grades will appear here.").foregroundStyle(.secondary) }
                ForEach(exam.finalized) { answer in
                    let maximum = exam.pack?.questions.first(where: { $0.id == answer.questionID })?.maxMarks ?? 0
                    LabeledContent(answer.student + " • " + answer.questionID, value: score(answer.finalMarks ?? 0, outOf: maximum))
                }
                Button("Export finalized CSV", systemImage: "square.and.arrow.up") { exporting = true }
                    .disabled(exam.finalized.isEmpty)
                    .accessibilityIdentifier("export-results")
            }
            Section("Evaluation activity") {
                LabeledContent("Students evaluated", value: metrics.students.formatted())
                LabeledContent("Questions processed", value: metrics.questions.formatted())
                LabeledContent("Answers evaluated", value: metrics.answersEvaluated.formatted())
                LabeledContent("On-device grading", value: metrics.localCount.formatted())
                LabeledContent("Cloud grading", value: metrics.cloudCount.formatted())
                LabeledContent("Cloud rubric requests", value: metrics.preparationCount.formatted())
                LabeledContent("Cloud escalation rate", value: percent(metrics.escalationRate))
                LabeledContent("Average response latency", value: metrics.averageLatencyMs.map { "\(Int($0)) ms" } ?? "—")
                LabeledContent("Model failures", value: metrics.failures.formatted())
                LabeledContent("Teacher override rate", value: percent(metrics.overrideRate))
                LabeledContent("Reference score agreement", value: percent(metrics.benchmarkAgreement))
                if metrics.benchmarkCount > 0 {
                    Text("Compared \(metrics.benchmarkCount) proposed scores with the sample teacher grades.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            Section {
                if settings.inputRate > 0 || settings.outputRate > 0 {
                    let format = FloatingPointFormatStyle<Double>.Currency(code: "USD")
                        .precision(.fractionLength(2...8))
                    LabeledContent("Estimated cloud charges", value: metrics.cloudCost.formatted(format))
                    LabeledContent("Estimated cloud charges avoided", value: metrics.cloudChargesAvoided.formatted(format))
                    LabeledContent("Cloud responses using token estimates", value: metrics.estimatedRequests.formatted())
                } else {
                    Text("Set the model's token prices in Settings to estimate cloud charges.").foregroundStyle(.secondary)
                }
            } header: {
                Text("Cloud API cost estimates")
            } footer: {
                Text("Estimates use the configured paid token rates and Firebase response counts when available. Avoided charges use your per-answer token estimate and exclude device compute.")
            }
            if let message { Text(message).font(.footnote) }
        }
        .navigationTitle("Class results")
        .navigationBarTitleDisplayMode(.inline)
        .fileExporter(isPresented: $exporting, document: CSVDocument(contents: exam.resultsCSV()),
                      contentType: .commaSeparatedText, defaultFilename: "GradeWise-results.csv") { result in
            switch result {
            case .success: message = "Results exported."
            case let .failure(error): message = error.localizedDescription
            }
        }
    }

    private func percent(_ value: Double?) -> String {
        value?.formatted(.percent.precision(.fractionLength(0...1))) ?? "—"
    }
}

struct ModelSettingsView: View {
    @ObservedObject var store: WorkspaceStore
    @State private var settings = WorkspaceSettings()
    @State private var result: String?
    @State private var testing = false

    var body: some View {
        Form {
            Section("Model availability") {
                LabeledContent("Firebase AI Logic", value: FirebaseInference.isConfigured ? "Configured" : "Configuration required")
                Text(FirebaseInference.deviceStatus).font(.subheadline)
                LabeledContent("Network", value: store.isOffline ? "Offline" : "Available")
                Button("Test Firebase App Check", systemImage: "checkmark.shield") { testAppCheck() }
                    .disabled(testing || !FirebaseInference.isConfigured || store.isOffline)
                Button("Test on-device model", systemImage: "iphone") { test(.device) }
                    .disabled(testing || !FirebaseInference.isConfigured || !FirebaseInference.deviceAvailable)
                Button("Test cloud model", systemImage: "cloud") { test(.cloud) }
                    .disabled(testing || !FirebaseInference.isConfigured || store.isOffline)
                Button("Test Firebase hybrid fallback", systemImage: "arrow.triangle.branch") { test(nil) }
                    .disabled(testing || !FirebaseInference.isConfigured || store.isOffline)
                if testing { ProgressView("Running diagnostic") }
                if let result { Text(result).font(.footnote).accessibilityIdentifier("model-probe-result") }
            }
            Section {
                Picker("Inference policy", selection: $settings.policy) {
                    ForEach(InferencePolicy.allCases) { Text($0.title).tag($0) }
                }
                TextField("Gemini model ID", text: $settings.cloudModel)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            } header: {
                Text("Grading policy")
            } footer: {
                Text("Each grading run requests permission before sending answers to cloud. The model probes use a fictional answer.")
            }
            Section("Cost assumptions") {
                LabeledContent("USD per million input tokens") {
                    TextField("Input price", value: $settings.inputRate, format: .number)
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                }
                LabeledContent("USD per million output tokens") {
                    TextField("Output price", value: $settings.outputRate, format: .number)
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                }
                LabeledContent("Estimated input tokens per answer") {
                    TextField("Input tokens", value: $settings.fallbackInputTokens, format: .number)
                        .keyboardType(.numberPad).multilineTextAlignment(.trailing)
                }
                LabeledContent("Estimated output tokens per answer") {
                    TextField("Output tokens", value: $settings.fallbackOutputTokens, format: .number)
                        .keyboardType(.numberPad).multilineTextAlignment(.trailing)
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button("Save") {
                do { try store.saveSettings(settings); result = "Settings saved." }
                catch { result = error.localizedDescription }
            }
        }
        .onAppear { settings = store.workspace.settings }
    }

    private func test(_ source: InferenceSource?) {
        testing = true
        result = nil
        Task {
            defer { testing = false }
            do { result = try await store.testModel(source, model: settings.cloudModel) }
            catch { result = error.localizedDescription }
        }
    }

    private func testAppCheck() {
        testing = true
        result = nil
        Task {
            defer { testing = false }
            do {
                try await FirebaseInference().verifyAppCheck()
                result = "Firebase App Check verified."
            } catch {
                result = "App Check did not verify. Check your Firebase app and the configured attestation provider."
            }
        }
    }
}

private func score(_ marks: Double, outOf maximum: Double) -> String {
    "\(marks.formatted()) / \(maximum.formatted())"
}

private struct CSVDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.commaSeparatedText]
    let contents: String

    init(contents: String) { self.contents = contents }

    init(configuration: ReadConfiguration) throws {
        contents = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(contents.utf8))
    }
}
