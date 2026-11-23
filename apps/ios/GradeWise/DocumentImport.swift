import Foundation
import ImageIO
import PDFKit
import UniformTypeIdentifiers
import Vision

struct ImportedText: Identifiable {
    let id = UUID()
    var label: String
    var text: String
    let note: String
}

enum DocumentImport {
    static let types: [UTType] = [.plainText, .pdf, .jpeg, .png]

    static func read(_ url: URL) throws -> ImportedText {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size <= 25_000_000 else { throw ContractError.issue("Choose a file smaller than 25 MB.") }
        let label = url.deletingPathExtension().lastPathComponent
        let contents = try Data(contentsOf: url)
        switch url.pathExtension.lowercased() {
        case "txt":
            guard let text = String(data: contents, encoding: .utf8) ?? String(data: contents, encoding: .utf16) else {
                throw ContractError.issue("Use a UTF-8 or UTF-16 text file.")
            }
            return ImportedText(label: label, text: text, note: "Check the imported text before continuing.")
        case "pdf":
            guard let pdf = PDFDocument(data: contents), !pdf.isLocked else {
                throw ContractError.issue("Choose a readable, unlocked PDF.")
            }
            let pages = (0..<pdf.pageCount).map { pdf.page(at: $0)?.string?.trimmed ?? "" }
            let blankPages = pages.filter(\.isEmpty).count
            return ImportedText(
                label: label,
                text: pages.joined(separator: "\n\n").trimmed,
                note: blankPages > 0
                    ? "\(blankPages) pages had no selectable text. Transcribe them and verify the complete document."
                    : "Check the page order and any characters changed by PDF extraction."
            )
        case "jpg", "jpeg", "png":
            guard let source = CGImageSourceCreateWithData(contents as CFData, nil),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                      kCGImageSourceCreateThumbnailFromImageAlways: true,
                      kCGImageSourceCreateThumbnailWithTransform: true,
                      kCGImageSourceThumbnailMaxPixelSize: 4_000
                  ] as CFDictionary) else {
                throw ContractError.issue("Choose a readable JPEG or PNG file.")
            }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["en-US"]
            try VNImageRequestHandler(cgImage: image).perform([request])
            let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
            return ImportedText(
                label: label, text: text,
                note: "Vision extracted this text on-device. Check every line against the image, especially handwriting and question numbers."
            )
        default:
            throw ContractError.issue("Choose a TXT, PDF, JPEG, or PNG file.")
        }
    }

    static func answers(from text: String, student: String, questions: [Question]) throws -> [StudentAnswer] {
        let options = questions.map { NSRegularExpression.escapedPattern(for: $0.id) }.joined(separator: "|")
        guard !options.isEmpty else { throw ContractError.issue("Approve a rubric before importing answers.") }
        let expression = try NSRegularExpression(pattern: "(?im)^[ \t]*(\(options))[ \t]*[:.)][ \t]*")
        let source = text as NSString
        let matches = expression.matches(in: text, range: NSRange(location: 0, length: source.length))
        if matches.isEmpty, let onlyQuestion = questions.first, questions.count == 1 {
            return [StudentAnswer(student: student, questionID: onlyQuestion.id, text: text.trimmed)]
        }
        guard let first = matches.first,
              source.substring(to: first.range.location).trimmed.isEmpty else {
            throw ContractError.issue("Prefix each answer with its rubric ID, such as Q1: or 1:. Remove any text before the first answer.")
        }
        return try matches.enumerated().map { index, match in
            let candidate = source.substring(with: match.range(at: 1))
            let end = index + 1 < matches.count ? matches[index + 1].range.location : source.length
            let start = NSMaxRange(match.range)
            let answer = source.substring(with: NSRange(location: start, length: end - start)).trimmed
            guard let question = questions.first(where: { $0.id.lowercased() == candidate.lowercased() }),
                  !answer.isEmpty else {
                throw ContractError.issue("Check the text under question \(candidate).")
            }
            return StudentAnswer(student: student, questionID: question.id, text: answer)
        }
    }
}
