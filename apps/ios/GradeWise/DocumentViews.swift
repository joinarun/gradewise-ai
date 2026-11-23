import SwiftUI

private struct ImportedDocumentReview: View {
    @Binding var item: ImportedText
    var showLabel = false

    var body: some View {
        Section {
            if showLabel { TextField("Student label", text: $item.label) }
            Text(item.note).font(.footnote).foregroundStyle(.secondary)
            TextEditor(text: $item.text)
                .frame(minHeight: 140)
                .accessibilityLabel("Extracted text for " + item.label)
        } header: {
            Text(showLabel ? "Check student document" : "Check extracted text")
        }
    }
}

struct DocumentEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State var paper: String
    @State var key: String
    let onSave: (String, String) throws -> Void
    @State private var error: String?
    @State private var isImporting = false
    @State private var loading = false
    @State private var target: DocumentType = .paper
    @State private var imported: ImportedText?

    var body: some View {
        NavigationStack {
            Form {
                Section("Question paper") {
                    TextEditor(text: $paper).frame(minHeight: 130).accessibilityLabel("Question paper")
                    Button("Import question paper", systemImage: "doc.badge.plus") {
                        target = .paper
                        isImporting = true
                    }
                    .disabled(loading)
                }
                Section("Answer key") {
                    TextEditor(text: $key).frame(minHeight: 130).accessibilityLabel("Answer key")
                    Button("Import answer key", systemImage: "doc.badge.plus") {
                        target = .key
                        isImporting = true
                    }
                    .disabled(loading)
                }
                if loading { ProgressView("Extracting text on this device") }
                if imported != nil {
                    ImportedDocumentReview(item: Binding(
                        get: { imported ?? ImportedText(label: "", text: "", note: "") },
                        set: { imported = $0 }
                    ))
                    Button("Use this verified text", systemImage: "checkmark.circle") {
                        guard let imported else { return }
                        if target == .paper { paper = imported.text } else { key = imported.text }
                        self.imported = nil
                    }
                    .disabled(imported?.text.trimmed.isEmpty ?? true)
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Exam documents")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        do {
                            try onSave(paper, key)
                            dismiss()
                        } catch {
                            self.error = error.localizedDescription
                        }
                    }
                    .disabled(loading || imported != nil)
                }
            }
            .fileImporter(isPresented: $isImporting, allowedContentTypes: DocumentImport.types) { response in
                loading = true
                error = nil
                Task {
                    defer { loading = false }
                    do {
                        let url = try response.get()
                        imported = try await Task.detached(priority: .userInitiated) { try DocumentImport.read(url) }.value
                    } catch { self.error = error.localizedDescription }
                }
            }
        }
    }

    private enum DocumentType { case paper, key }
}

struct AnswerImporter: View {
    @Environment(\.dismiss) private var dismiss
    let questions: [Question]
    let onSubmit: ([StudentAnswer]) throws -> Void
    @State private var student = ""
    @State private var questionID = ""
    @State private var answer = ""
    @State private var imported: [ImportedText] = []
    @State private var isImporting = false
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Add one answer") {
                    TextField("Student label", text: $student).accessibilityIdentifier("student-label")
                    Picker("Question", selection: $questionID) {
                        ForEach(questions) { Text($0.id).tag($0.id) }
                    }
                    TextEditor(text: $answer).frame(minHeight: 120).accessibilityLabel("Student answer")
                    Button("Add answer") {
                        submit { [StudentAnswer(student: student, questionID: questionID, text: answer)] }
                    }
                    .disabled(student.trimmed.isEmpty || answer.trimmed.isEmpty)
                    .accessibilityIdentifier("submit-answer")
                }
                Section {
                    Button("Import answer documents", systemImage: "tray.and.arrow.down") { isImporting = true }
                        .disabled(loading)
                    if loading { ProgressView("Extracting answer text on this device") }
                } footer: {
                    Text("Choose one file per student. Label each response with its rubric ID on a new line, such as Q1:. Verify all extracted text before adding it to the queue.")
                }
                ForEach($imported) { $entry in
                    ImportedDocumentReview(item: $entry, showLabel: true)
                    Button("Remove \(entry.label)", role: .destructive) {
                        imported.removeAll { $0.id == entry.id }
                    }
                }
                if !imported.isEmpty {
                    Button("Verify and queue documents", systemImage: "checkmark.circle") {
                        submit {
                            try imported.flatMap { try DocumentImport.answers(from: $0.text, student: $0.label, questions: questions) }
                        }
                    }
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Student answers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Cancel") { dismiss() } }
            .onAppear { questionID = questions.first?.id ?? "" }
            .fileImporter(isPresented: $isImporting, allowedContentTypes: DocumentImport.types, allowsMultipleSelection: true) { result in
                loading = true
                error = nil
                Task {
                    defer { loading = false }
                    do {
                        let urls = try result.get()
                        for url in urls {
                            do { imported.append(try await Task.detached(priority: .userInitiated) { try DocumentImport.read(url) }.value) }
                            catch { self.error = "Could not extract \(url.lastPathComponent). \(error.localizedDescription)" }
                        }
                    } catch { self.error = error.localizedDescription }
                }
            }
        }
    }

    private func submit(_ makeAnswers: () throws -> [StudentAnswer]) {
        do {
            try onSubmit(makeAnswers())
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

struct RubricView: View {
    @Environment(\.dismiss) private var dismiss
    let pack: GradingPack
    let onSave: (String, Bool) throws -> Void
    @State private var json = ""
    @State private var editing = false
    @State private var error: String?
    @State private var preview: GradingPack?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text((preview ?? pack).approvedAt == nil
                         ? "Check the questions, mark limits, and partial-credit rules before approving the rubric."
                         : "This rubric is approved. Its scoring criteria are applied to every student answer.")
                    .font(.footnote).foregroundStyle(.secondary)
                }
                ForEach((preview ?? pack).questions) { question in
                    Section(question.id + " • " + question.maxMarks.formatted() + " marks") {
                        QuestionSummary(question: question)
                    }
                }
                if pack.approvedAt == nil {
                    Section("Edit rubric") {
                        Toggle("Show JSON editor", isOn: $editing)
                        if editing {
                            TextEditor(text: $json)
                                .font(.system(.footnote, design: .monospaced))
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .frame(minHeight: 300)
                                .accessibilityLabel("Rubric JSON")
                            Button("Update preview") {
                                do {
                                    let edited = try JSONDecoder().decode(GradingPack.self, from: Data(json.utf8))
                                    try edited.validate()
                                    preview = edited
                                    error = nil
                                } catch { self.error = error.localizedDescription }
                            }
                        }
                        Button("Save draft") { save(approve: false) }
                        Button("Approve rubric", systemImage: "checkmark.seal") { save(approve: true) }
                            .accessibilityIdentifier("approve-rubric")
                    }
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Grading rubric")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Close") { dismiss() } }
            .onAppear {
                do { json = try encodeJSON(pack, pretty: true) }
                catch { self.error = error.localizedDescription }
            }
        }
    }

    private func save(approve: Bool) {
        do {
            try onSave(json, approve)
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

struct QuestionSummary: View {
    let question: Question

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(question.text).font(.headline)
            Text(question.referenceAnswer).font(.subheadline)
            ForEach(question.criteria) { criterion in
                VStack(alignment: .leading, spacing: 4) {
                    Text(criterion.description + " • " + criterion.maxMarks.formatted())
                        .font(.subheadline.weight(.medium))
                    Text(criterion.partialCredit).font(.footnote).foregroundStyle(.secondary)
                }
            }
            details("Acceptable alternatives", items: question.alternatives)
            details("Correct examples", items: question.examples.correct)
            details("Incorrect examples", items: question.examples.incorrect)
            details("Scoring constraints", items: question.constraints)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder private func details(_ title: String, items: [String]) -> some View {
        if !items.isEmpty {
            DisclosureGroup(title) {
                ForEach(items.indices, id: \.self) { Text(items[$0]).font(.subheadline) }
            }
        }
    }
}
