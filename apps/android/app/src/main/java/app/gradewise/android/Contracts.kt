package app.gradewise.android

import com.google.firebase.ai.annotations.Generable
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.text.Normalizer
import java.time.Instant
import kotlin.math.abs

internal val wireJson = Json { encodeDefaults = true }

@Serializable
data class Exam(
    val name: String = "",
    val subject: String = "",
    val className: String = "",
    val date: String = "",
    val maxMarks: Double = 0.0,
    val autoApprove: Boolean = false,
)

@Serializable
@Generable
data class Criterion(val id: String, val description: String, val maxMarks: Double, val partialCredit: String) {
    companion object
}

@Serializable
@Generable
data class Examples(val correct: List<String>, val incorrect: List<String>) {
    companion object
}

@Serializable
@Generable
data class Question(
    val id: String,
    val text: String,
    val referenceAnswer: String,
    val maxMarks: Double,
    val criteria: List<Criterion>,
    val alternatives: List<String>,
    val examples: Examples,
    val constraints: List<String>,
) {
    companion object
}

@Serializable
@Generable
data class RubricResponse(val questions: List<Question>) {
    companion object
}

@Serializable
data class GradingPack(
    val schemaVersion: Int = 1,
    val exam: Exam,
    val questions: List<Question>,
    val approvedAt: String? = null,
)

@Serializable
@Generable
data class CriterionScore(val criterionId: String, val marks: Double, val evidence: String) {
    companion object
}

@Serializable
@Generable
data class GradingResult(
    val marks: Double,
    val explanation: String,
    val criteria: List<CriterionScore>,
    val uncertain: Boolean,
) {
    companion object
}

@Serializable
enum class Policy(val label: String) {
    PREFER_DEVICE("Prefer on-device"),
    DEVICE_ONLY("On-device only"),
    CLOUD_ONLY("Cloud only"),
    CLOUD_FIRST("Cloud first"),
}

@Serializable
enum class Source(val label: String) {
    DEVICE("On-device"),
    CLOUD("Cloud"),
}

@Serializable
data class Attempt(
    val route: Source,
    val source: Source? = null,
    val result: GradingResult? = null,
    val warnings: List<String> = emptyList(),
    val latencyMillis: Long = 0,
    val promptTokens: Int? = null,
    val outputTokens: Int? = null,
)

@Serializable
enum class AnswerStatus(val label: String) {
    QUEUED("Queued"),
    REVIEW("Needs review"),
    PROVISIONAL("Provisional"),
    FINALIZED("Finalized"),
    REJECTED("Rejected"),
}

@Serializable
data class Answer(
    val studentId: String,
    val questionId: String,
    val text: String,
    val attempts: List<Attempt> = emptyList(),
    val status: AnswerStatus = AnswerStatus.QUEUED,
    val finalMarks: Double? = null,
    val warnings: List<String> = emptyList(),
    val teacherBenchmark: Double? = null,
    val teacherOverride: Boolean = false,
    val automaticallyApproved: Boolean = false,
) {
    val proposed: Attempt?
        get() = attempts.lastOrNull { it.result != null && it.warnings.isEmpty() }
            ?: attempts.lastOrNull { it.result != null }
}

@Serializable
data class WorkspaceExam(
    val id: String,
    val metadata: Exam,
    val paper: String = "",
    val answerKey: String = "",
    val rubric: GradingPack? = null,
    val answers: List<Answer> = emptyList(),
    val rubricAttempts: List<Attempt> = emptyList(),
)

@Serializable
data class Workspace(
    val exams: List<WorkspaceExam> = emptyList(),
    val policy: Policy = Policy.PREFER_DEVICE,
    val model: String = "gemini-3.5-flash-lite",
    val priceInputPerMillion: Double = 0.30,
    val priceOutputPerMillion: Double = 2.50,
)

internal fun validateExam(exam: Exam) {
    require(bounded(exam.name, 160) && bounded(exam.subject, 100) && bounded(exam.className, 100)) {
        "Enter an exam name, subject and class."
    }
    require(runCatching { java.time.LocalDate.parse(exam.date) }.isSuccess) { "Enter a date as YYYY-MM-DD." }
    require(validMarks(exam.maxMarks, 0.5, 1_000.0)) { "Maximum marks must be between 0.5 and 1,000, in half-mark increments." }
}

internal fun GradingPack.validate() {
    validateExam(exam)
    require(schemaVersion == 1 && questions.size in 1..60) { "Use grading pack schema version 1 with at least one question." }
    require(uniqueIds(questions.map { it.id })) { "Question IDs must be unique." }
    require(sameMarks(questions.sumOf { it.maxMarks }, exam.maxMarks)) {
        "Question marks must add up to the examination maximum."
    }
    require(approvedAt == null || runCatching { Instant.parse(approvedAt) }.isSuccess) { "Grading pack approval time is invalid." }
    for (question in questions) {
        require(identifier.matches(question.id) && bounded(question.text, 2_000) && bounded(question.referenceAnswer, 2_000) &&
            validMarks(question.maxMarks, 0.5, 1_000.0) && question.criteria.size in 1..16
        ) { "Question ${question.id} has incomplete rubric content." }
        require(uniqueIds(question.criteria.map { it.id })) {
            "Criterion IDs must be unique in question ${question.id}."
        }
        require(question.criteria.all {
            identifier.matches(it.id) && bounded(it.description, 500) && bounded(it.partialCredit, 500) &&
                validMarks(it.maxMarks, 0.5, 1_000.0)
        }) { "Each criterion in question ${question.id} needs an ID, description, maximum and partial-credit rule." }
        require(listOf(question.alternatives, question.examples.correct, question.examples.incorrect).all { values ->
            values.size <= 12 && values.all { bounded(it, 400) }
        } && question.constraints.size <= 12 && question.constraints.all { bounded(it, 500) }) {
            "Question ${question.id} includes excessive examples, alternatives, or constraints."
        }
        require(sameMarks(question.criteria.sumOf { it.maxMarks }, question.maxMarks)) {
            "Criterion marks must add up to the maximum for question ${question.id}."
        }
    }
}

internal fun GradingResult.warningsFor(question: Question, answer: String): List<String> = buildList {
    if (!bounded(explanation, 1_200)) add("The model did not provide an explanation.")
    if (!validMarks(marks, 0.0, question.maxMarks)) add("The total is outside the question's allowed marks.")
    val maxima = question.criteria.associate { it.id to it.maxMarks }
    if (criteria.size != maxima.size || criteria.map { it.criterionId }.toSet() != maxima.keys) {
        add("The response must score every rubric criterion exactly once.")
    }
    if (criteria.any { it.criterionId !in maxima || !validMarks(it.marks, 0.0, maxima.getValue(it.criterionId)) }) {
        add("A criterion score is outside its allowed bounds.")
    }
    val normalizedAnswer = normalizeEvidence(answer)
    if (criteria.any {
        val evidence = normalizeEvidence(it.evidence)
        it.evidence.length > 600 || (it.marks > 0 && (!evidence.any(Char::isLetterOrDigit) || !normalizedAnswer.contains(evidence)))
    }) {
        add("Awarded marks need an exact quote from the student's answer.")
    }
    if (!sameMarks(criteria.sumOf { it.marks }, marks)) add("Criterion marks do not match the proposed total.")
    if (uncertain) add("The model identified an uncertain grading decision.")
}

private val identifier = Regex("[a-zA-Z0-9][a-zA-Z0-9_.()-]{0,39}")
private val whitespace = Regex("\\s+")
private fun bounded(value: String, limit: Int): Boolean = value.isNotBlank() && value.length <= limit
private fun uniqueIds(ids: List<String>): Boolean = ids.map(String::lowercase).toSet().size == ids.size
private fun normalizeEvidence(value: String): String =
    Normalizer.normalize(value, Normalizer.Form.NFKC).lowercase().replace(whitespace, " ").trim()

internal fun validMarks(value: Double, minimum: Double, maximum: Double): Boolean =
    value.isFinite() && value in minimum..maximum && (value * 2) % 1 == 0.0

internal fun sameMarks(first: Double, second: Double): Boolean = abs(first - second) < 0.000001

internal fun papersFromText(studentId: String, raw: String, questions: List<Question>): List<Answer> {
    require(studentId.isNotBlank()) { "Enter a student ID or alias." }
    require(raw.length <= 240_000) { "The student paper exceeds 240,000 characters." }
    val permitted = questions.associateBy { it.id.lowercase() }
    val numberedLine = Regex("""^\s*([A-Za-z0-9][A-Za-z0-9_.()-]{0,39})[.):](?:\s+(.*))?$""")
    val answers = mutableListOf<Answer>()
    var questionId: String? = null
    val buffer = StringBuilder()
    for (line in raw.lineSequence()) {
        val heading = numberedLine.matchEntire(line)
        val match = heading?.groupValues?.get(1)?.lowercase()?.let { permitted[it] }
        if (match != null) {
            questionId?.let { answers += Answer(studentId.trim(), it, buffer.toString().trim()) }
            questionId = match.id
            buffer.clear()
            buffer.append(heading.groupValues[2])
        } else if (questionId != null) {
            buffer.appendLine()
            buffer.append(line)
        }
    }
    questionId?.let { answers += Answer(studentId.trim(), it, buffer.toString().trim()) }
    require(answers.isNotEmpty()) { "Start each answer with its approved question ID followed by a colon, such as Q1: …" }
    require(answers.map { it.questionId }.toSet().size == answers.size) { "The paper repeats a question ID." }
    return answers
}

internal fun finalizedCsv(exam: WorkspaceExam): String {
    fun cell(value: String): String {
        val safe = if (value.trimStart().firstOrNull() in setOf('=', '+', '-', '@', '\t', '\r')) "'$value" else value
        return "\"${safe.replace("\"", "\"\"")}\""
    }
    return buildString {
        appendLine("Student ID,Question ID,Marks,Maximum,Approval,Inference source")
        for (answer in exam.answers.filter { it.status == AnswerStatus.FINALIZED }) {
            val maximum = exam.rubric?.questions?.firstOrNull { it.id == answer.questionId }?.maxMarks ?: continue
            appendLine(listOf(
                answer.studentId, answer.questionId, answer.finalMarks.toString(), maximum.toString(),
                if (answer.automaticallyApproved) "Teacher-enabled automatic approval" else "Teacher",
                answer.proposed?.source?.label.orEmpty(),
            ).joinToString(",", transform = ::cell))
        }
    }
}
