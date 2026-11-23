import SwiftUI

private let brand = Color(red: 0.357, green: 0.263, blue: 0.855)

enum WorkspaceRoute: Hashable {
    case exam(UUID)
    case settings
}

struct WorkspaceView: View {
    @ObservedObject var store: WorkspaceStore
    @State private var path: [WorkspaceRoute] = []
    @State private var creating = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Teacher workspace", systemImage: "graduationcap.fill")
                            .font(.subheadline.weight(.semibold))
                        Text("GradeWise AI").font(.largeTitle.bold())
                        Text("Prepare a rubric, then grade and review your class from one workspace.")
                            .font(.subheadline)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(22)
                    .foregroundStyle(.white)
                    .background(brand.gradient, in: RoundedRectangle(cornerRadius: 18))
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
                Section("Examinations") {
                    ForEach(store.workspace.exams) { exam in
                        NavigationLink(value: WorkspaceRoute.exam(exam.id)) {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(exam.metadata.name).font(.headline)
                                Text(exam.metadata.subject + " • " + exam.metadata.className)
                                    .font(.subheadline).foregroundStyle(.secondary)
                                Label(exam.approvalLabel, systemImage: exam.approved ? "checkmark.seal" : "doc.text")
                                    .font(.caption).foregroundStyle(brand)
                            }
                            .padding(.vertical, 3)
                        }
                    }
                    Button("Create examination", systemImage: "plus.circle") { creating = true }
                        .accessibilityIdentifier("create-exam")
                }
                Section {
                    Button("Open sample exam", systemImage: "leaf") {
                        do { path.append(.exam(try store.loadSample())) }
                        catch { store.message = error.localizedDescription }
                    }
                    .accessibilityIdentifier("open-sample")
                } footer: {
                    Text("The sample uses fictional answers and a prewritten rubric. You can approve grades and export results before configuring Firebase.")
                }
            }
            .navigationTitle("Workspace")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                NavigationLink(value: WorkspaceRoute.settings) {
                    Label("Settings", systemImage: "gearshape")
                }
                .accessibilityIdentifier("open-settings")
            }
            .navigationDestination(for: WorkspaceRoute.self) { route in
                switch route {
                case let .exam(id): ExaminationView(store: store, id: id)
                case .settings: ModelSettingsView(store: store)
                }
            }
            .sheet(isPresented: $creating) {
                NewExaminationView { metadata in
                    let id = try store.create(metadata)
                    path.append(.exam(id))
                }
            }
            .alert("GradeWise AI", isPresented: Binding(
                get: { store.message != nil },
                set: { if !$0 { store.message = nil } }
            )) {
                Button("OK") { store.message = nil }
            } message: {
                Text(store.message ?? "")
            }
        }
        .tint(brand)
        .onChange(of: scenePhase) { _, next in
            if next != .active { store.pause() }
        }
    }
}

private struct NewExaminationView: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (ExamMetadata) throws -> Void
    @State private var metadata = ExamMetadata()
    @State private var date = Date()
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Examination details") {
                    TextField("Exam name", text: $metadata.name).accessibilityIdentifier("exam-name")
                    TextField("Subject", text: $metadata.subject).accessibilityIdentifier("exam-subject")
                    TextField("Class", text: $metadata.className).accessibilityIdentifier("exam-class")
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    TextField("Maximum marks", value: $metadata.maxMarks, format: .number)
                        .keyboardType(.decimalPad)
                        .accessibilityIdentifier("exam-maximum")
                    Toggle("Auto-approve clear AI grades", isOn: $metadata.autoApprove)
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("New examination")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let formatter = DateFormatter()
                        formatter.locale = Locale(identifier: "en_US_POSIX")
                        formatter.calendar = Calendar(identifier: .gregorian)
                        formatter.dateFormat = "yyyy-MM-dd"
                        metadata.date = formatter.string(from: date)
                        do {
                            try onSave(metadata)
                            dismiss()
                        } catch {
                            self.error = error.localizedDescription
                        }
                    }
                }
            }
        }
    }
}

private struct ExaminationView: View {
    @ObservedObject var store: WorkspaceStore
    let id: UUID
    @State private var uploading = false
    @State private var showingRubric = false
    @State private var addingAnswers = false
    @State private var confirmingRubric = false
    @State private var confirmingCloud = false
    @State private var retrying = false
    @State private var filter: AnswerFilter = .all

    var body: some View {
        if let exam = store.exam(id) {
            Form {
                Section {
                    LabeledContent("Class", value: exam.metadata.className)
                    LabeledContent("Subject", value: exam.metadata.subject)
                    LabeledContent("Exam date", value: exam.metadata.date)
                    LabeledContent("Maximum marks", value: exam.metadata.maxMarks.formatted())
                    LabeledContent("Approval", value: exam.metadata.autoApprove ? "Auto for clear grades" : "Teacher review")
                }
                Section("Grading rubric") {
                    Label(exam.approvalLabel, systemImage: exam.approved ? "checkmark.seal.fill" : "doc.text")
                        .foregroundStyle(brand)
                        .accessibilityIdentifier("rubric-status")
                    if exam.isSample && exam.preparationAttempts.isEmpty {
                        Text("This sample includes a prewritten rubric and fictional answers.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    if !exam.approved {
                        Button("Question paper and answer key", systemImage: "doc.badge.plus") { uploading = true }
                            .disabled(store.preparing)
                        if store.preparing {
                            ProgressView("Generating a rubric through Firebase")
                        } else {
                            Button("Generate with cloud Gemini", systemImage: "sparkles") { confirmingRubric = true }
                                .disabled(exam.questionPaper.trimmed.isEmpty || exam.answerKey.trimmed.isEmpty ||
                                          !FirebaseInference.isConfigured || store.runningExamID != nil)
                        }
                    }
                    if exam.pack != nil {
                        Button(exam.approved ? "View approved rubric" : "Review rubric", systemImage: "checklist") {
                            showingRubric = true
                        }
                        .disabled(store.preparing)
                        .accessibilityIdentifier("review-rubric")
                    }
                }
                if exam.approved {
                    queue(exam)
                    Section("Results") {
                        NavigationLink {
                            ResultsView(exam: exam, settings: store.workspace.settings)
                        } label: {
                            Label("Class results and AI usage", systemImage: "chart.bar.xaxis")
                        }
                        .accessibilityIdentifier("class-results")
                    }
                }
            }
            .navigationTitle(exam.metadata.name)
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $uploading) {
                DocumentEditor(paper: exam.questionPaper, key: exam.answerKey) {
                    try store.saveDocuments(id, paper: $0, key: $1)
                }
            }
            .sheet(isPresented: $showingRubric) {
                if let pack = exam.pack {
                    RubricView(pack: pack) { json, approve in
                        try store.saveRubric(id, json: json, approve: approve)
                    }
                }
            }
            .sheet(isPresented: $addingAnswers) {
                AnswerImporter(questions: exam.pack?.questions ?? []) { answers in
                    try store.enqueue(id, answers: answers)
                }
            }
            .confirmationDialog("Generate a rubric with Firebase", isPresented: $confirmingRubric, titleVisibility: .visible) {
                Button("Send exam documents") { Task { await store.prepare(id) } }
            } message: {
                Text("The exam details, question paper and answer key will be sent to Gemini. Use synthetic or non-sensitive content with the demo cloud project.")
            }
            .confirmationDialog("Allow cloud grading for this run?", isPresented: $confirmingCloud, titleVisibility: .visible) {
                Button("Allow cloud grading") { run(consent: true, retry: retrying) }
                Button("Continue without cloud") { run(consent: false, retry: retrying) }
            } message: {
                Text("Gemini receives answer text and the approved rubric when the selected policy uses cloud inference. Student labels stay on this device. Use only synthetic or non-sensitive answers with the demo project.")
            }
        }
    }

    @ViewBuilder private func queue(_ exam: ExamRecord) -> some View {
        Section("Batch evaluation") {
            let queued = exam.answers.filter { $0.status == .queued }.count
            let unresolved = exam.answers.filter { $0.status == .unresolved }.count
            let processed = exam.answers.count - queued
            ProgressView(value: Double(processed), total: Double(max(exam.answers.count, 1))) {
                Text("\(processed) of \(exam.answers.count) answers processed")
            }
            Text(store.workspace.settings.policy.title + (store.isOffline ? " • Offline" : ""))
                .font(.footnote).foregroundStyle(.secondary)
            if store.runningExamID == id {
                Button(store.pauseRequested ? "Pausing after the current answer" : "Pause batch", systemImage: "pause.circle") {
                    store.pause()
                }
                .disabled(store.pauseRequested)
            } else {
                Button("Add student answers", systemImage: "tray.and.arrow.down") { addingAnswers = true }
                    .disabled(store.runningExamID != nil)
                Button("Grade queued answers", systemImage: "play.circle") { requestRun(retry: false) }
                    .disabled(queued == 0 || store.runningExamID != nil)
                    .accessibilityIdentifier("grade-queue")
                if unresolved > 0 {
                    Button("Retry unresolved answers", systemImage: "arrow.clockwise") { requestRun(retry: true) }
                        .disabled(store.runningExamID != nil)
                }
            }
        }
        Section("Teacher review") {
            Picker("Show answers", selection: $filter) {
                ForEach(AnswerFilter.allCases) { item in Text(item.rawValue).tag(item) }
            }
            let matching = exam.answers.filter { filter.includes($0.status) }
            if matching.isEmpty {
                Text("No answers in this view.").foregroundStyle(.secondary)
            }
            ForEach(matching) { answer in
                NavigationLink {
                    AnswerReviewView(store: store, examID: id, answerID: answer.id)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(answer.student).font(.headline)
                        Text("\(answer.questionID) • \(store.activeAnswerID == answer.id ? "Evaluating" : answer.status.rawValue)")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 3)
                }
                .accessibilityIdentifier("answer-" + answer.student)
            }
        }
    }

    private func requestRun(retry: Bool) {
        retrying = retry
        if store.workspace.settings.policy == .deviceOnly || store.isOffline || !FirebaseInference.isConfigured {
            run(consent: false, retry: retry)
        }
        else { confirmingCloud = true }
    }

    private func run(consent: Bool, retry: Bool) {
        Task { await store.startBatch(id, consent: consent, retry: retry) }
    }
}

private enum AnswerFilter: String, CaseIterable, Identifiable {
    case all = "All answers"
    case review = "Needs review"
    case queued = "Queued"
    case finalized = "Finalized"

    var id: String { rawValue }

    func includes(_ status: AnswerStatus) -> Bool {
        switch self {
        case .all: true
        case .review: status == .review || status == .unresolved
        case .queued: status == .queued
        case .finalized: status == .finalized
        }
    }
}
