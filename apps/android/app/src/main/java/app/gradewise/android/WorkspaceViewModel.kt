package app.gradewise.android

import android.app.Application
import android.net.Uri
import android.util.AtomicFile
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileNotFoundException
import java.time.Instant
import java.util.UUID


class WorkspaceViewModel(application: Application) : AndroidViewModel(application) {
    private val localFile = AtomicFile(File(application.filesDir, "gradewise-workspace-v1.json"))
    private val inference = FirebaseInference(application)
    private val resolver = application.contentResolver
    private val documentIntake = DocumentIntake(application)

    var workspace by mutableStateOf(Workspace())
        private set
    var notice by mutableStateOf("")
        private set
    var hasWorkspace by mutableStateOf(false)
        private set
    var busy by mutableStateOf(true)
        private set
    var batchLabel by mutableStateOf("")
        private set
    var nanoStatus by mutableStateOf("Availability unchecked")
        private set
    private var pauseRequested = false

    val configured: Boolean get() = inference.configured

    init {
        viewModelScope.launch {
            try {
                workspace = withContext(Dispatchers.IO) {
                    try {
                        wireJson.decodeFromString<Workspace>(localFile.readFully().decodeToString())
                    } catch (_: FileNotFoundException) {
                        Workspace()
                    }
                }
                hasWorkspace = true
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                notice = "The saved workspace could not be read. The original file has been preserved."
            } finally {
                busy = false
            }
        }
    }

    fun createExam(metadata: Exam, onCreated: (String) -> Unit) = action {
        validateExam(metadata)
        val id = UUID.randomUUID().toString()
        save(workspace.copy(exams = workspace.exams + WorkspaceExam(id, metadata)))
        onCreated(id)
    }

    fun sample(onCreated: (String) -> Unit) = action {
        val sample = wireJson.decodeFromString<GradingPack>(
            getApplication<Application>().assets.open("rubrics/roots.v1.json").bufferedReader().use { it.readText() },
        )
        sample.validate()
        require(sample.approvedAt != null) { "The sample grading pack needs approval metadata." }
        val question = sample.questions.first()
        val id = UUID.randomUUID().toString()
        val exam = WorkspaceExam(
            id = id,
            metadata = sample.exam,
            paper = sample.questions.joinToString("\n") { "${it.id}. ${it.text}" },
            answerKey = sample.questions.joinToString("\n") { "${it.id}. ${it.referenceAnswer}" },
            rubric = sample,
            answers = listOf(
                Answer("S-101", question.id, "Roots take water from the soil and keep the plant fixed.", teacherBenchmark = 2.0),
                Answer("S-102", question.id, "They absorb water from the soil.", teacherBenchmark = 1.0),
                Answer("S-103", question.id, "Roots make flowers colorful.", teacherBenchmark = 0.0),
                Answer("S-104", question.id, "They help the plant get what it needs."),
                Answer("S-105", question.id, "", teacherBenchmark = 0.0),
            ),
        )
        save(workspace.copy(exams = workspace.exams + exam))
        onCreated(id)
        notice = "Synthetic exam and benchmark answers loaded. Grade them with Firebase or review them manually."
    }

    fun saveSources(id: String, paper: String, key: String) = action {
        val exam = exam(id)
        require(exam.answers.isEmpty()) { "Create a new exam to change sources after adding answers." }
        checkSources(paper, key)
        val changed = paper != exam.paper || key != exam.answerKey
        update(exam.copy(paper = paper, answerKey = key, rubric = if (changed) null else exam.rubric))
        notice = "Source text saved."
    }

    fun prepareRubric(id: String, paper: String, key: String) = action {
        val exam = exam(id)
        require(exam.answers.isEmpty()) { "Create a new exam to replace a rubric after adding answers." }
        checkSources(paper, key)
        require(paper.isNotBlank() && key.isNotBlank()) { "Confirm both question paper and answer key text first." }
        require(configured) { "Add a Firebase project configuration to use cloud rubric preparation." }
        val draft = exam.copy(paper = paper, answerKey = key)
        val (pack, attempt) = inference.rubric(draft, workspace.model)
        update(draft.copy(rubric = pack, rubricAttempts = exam.rubricAttempts + attempt))
        notice = "Cloud grading pack prepared. Inspect and approve it before grading."
    }

    fun saveRubric(id: String, payload: String, approve: Boolean) = action {
        val exam = exam(id)
        require(exam.answers.isEmpty()) { "The approved rubric is locked while answers are present." }
        val result = try {
            wireJson.decodeFromString<RubricResponse>(payload)
        } catch (_: Exception) {
            throw IllegalArgumentException("Check the draft rubric JSON against schema version 1.")
        }
        val pack = GradingPack(
            exam = exam.metadata,
            questions = result.questions,
            approvedAt = if (approve) Instant.now().toString() else null,
        )
        pack.validate()
        update(exam.copy(rubric = pack))
        notice = if (approve) "Rubric approved and available offline." else "Draft rubric saved."
    }

    fun addAnswer(id: String, student: String, questionId: String, answer: String) = action {
        val exam = exam(id)
        val pack = approvedRubric(exam)
        require(student.isNotBlank() && student.trim().length <= 120) { "Enter a student ID or alias up to 120 characters." }
        require(pack.questions.any { it.id == questionId }) { "Choose an approved question ID." }
        require(answer.length <= PromptLimits.ANSWER_CHARS) { "Student answers are limited to 10,000 characters." }
        addAnswers(exam, listOf(Answer(student.trim(), questionId, answer.trim())))
    }

    fun addPapers(id: String, papers: List<ImportedText>) = action {
        val exam = exam(id)
        val pack = approvedRubric(exam)
        val answers = papers.flatMap { paper -> papersFromText(paper.name, paper.text, pack.questions) }
        addAnswers(exam, answers)
    }

    fun importDocuments(uris: List<Uri>, onImported: (List<ImportedText>) -> Unit) = action {
        require(uris.size <= 30) { "Import up to 30 papers at a time." }
        val imports = withContext(Dispatchers.IO) { uris.map { documentIntake.read(it) } }
        onImported(imports)
        if (imports.any { it.usedOcr }) notice = "Review the locally recognized text against the original before continuing."
    }

    fun gradePending(
        id: String,
        cloudConsent: Boolean,
        selected: Pair<String, String>? = null,
        retryUnresolved: Boolean = false,
    ) = action {
        val initial = exam(id)
        val rubric = approvedRubric(initial)
        val matches = initial.answers.filter {
            when {
                selected != null -> it.studentId == selected.first && it.questionId == selected.second &&
                    it.status in setOf(AnswerStatus.QUEUED, AnswerStatus.REVIEW)
                retryUnresolved -> it.status == AnswerStatus.REVIEW
                else -> it.status == AnswerStatus.QUEUED
            }
        }
        require(matches.isNotEmpty()) { "There are no matching queued answers." }
        var completed = 0
        pauseRequested = false
        batchLabel = "Grading 0 of ${matches.size}"
        try {
            for (answer in matches) {
                if (pauseRequested) break
                val question = rubric.questions.first { it.id == answer.questionId }
                val result = evaluate(inference, workspace.policy, cloudConsent, workspace.model, question, answer, initial.metadata.autoApprove)
                replaceAnswer(id, result)
                completed++
                batchLabel = "Grading $completed of ${matches.size}"
            }
            notice = "$completed of ${matches.size} answers processed" +
                if (pauseRequested && completed < matches.size) ". Resume to finish the queue." else "."
        } finally {
            batchLabel = ""
        }
    }

    fun pauseBatch() {
        if (batchLabel.isNotBlank()) pauseRequested = true
    }

    fun finalize(id: String, answer: Answer, marks: String?, teacherBenchmark: String?, approveProposed: Boolean) = action {
        val exam = exam(id)
        val question = approvedRubric(exam).questions.first { it.id == answer.questionId }
        val proposed = answer.proposed?.result?.marks
        val award = if (approveProposed) proposed else marks?.toDoubleOrNull()
        require(award != null && validMarks(award, 0.0, question.maxMarks)) {
            "Enter a score between 0 and ${question.maxMarks} in half-mark increments."
        }
        val benchmark = if (teacherBenchmark.isNullOrBlank()) answer.teacherBenchmark else teacherBenchmark.toDoubleOrNull()
        require(teacherBenchmark.isNullOrBlank() || (benchmark != null && validMarks(benchmark, 0.0, question.maxMarks))) {
            "Enter a benchmark score between 0 and ${question.maxMarks} in half-mark increments."
        }
        replaceAnswer(id, answer.copy(
            status = AnswerStatus.FINALIZED,
            finalMarks = award,
            teacherBenchmark = benchmark,
            teacherOverride = proposed != null && !sameMarks(award, proposed),
            automaticallyApproved = false,
        ))
        notice = "Grade finalized."
    }

    fun reject(id: String, answer: Answer) = action {
        replaceAnswer(id, answer.copy(status = AnswerStatus.REJECTED, finalMarks = null, automaticallyApproved = false))
        notice = "Proposed grade rejected."
    }

    fun export(id: String, uri: Uri) = action {
        val csv = finalizedCsv(exam(id))
        withContext(Dispatchers.IO) {
            requireNotNull(resolver.openOutputStream(uri, "wt")) { "The selected export destination is unavailable." }
                .bufferedWriter().use { it.write(csv) }
        }
        notice = "Finalized grades exported."
    }

    fun settings(policy: Policy, model: String, input: String, output: String) = action {
        val inputPrice = input.toDoubleOrNull()
        val outputPrice = output.toDoubleOrNull()
        require(model.matches(Regex("[a-z0-9][a-z0-9.-]{1,79}"))) { "Enter a supported Gemini model ID." }
        require(inputPrice != null && inputPrice.isFinite() && inputPrice >= 0 &&
            outputPrice != null && outputPrice.isFinite() && outputPrice >= 0
        ) { "Enter nonnegative model prices." }
        save(workspace.copy(policy = policy, model = model, priceInputPerMillion = inputPrice, priceOutputPerMillion = outputPrice))
        notice = "Settings saved."
    }

    fun checkNano() = action { nanoStatus = inference.nanoStatus() }

    fun downloadNano() = action { inference.downloadNano { nanoStatus = it } }

    fun probe(source: Source) = action {
        require(configured) { "Add a Firebase project configuration before testing inference." }
        notice = inference.probe(source, workspace.model)
    }

    private fun action(block: suspend () -> Unit) {
        if (busy || !hasWorkspace) return
        busy = true
        notice = ""
        viewModelScope.launch {
            try {
                block()
            } catch (_: TimeoutCancellationException) {
                notice = "The request timed out. Retry when the service is available."
            } catch (error: CancellationException) {
                throw error
            } catch (error: IllegalArgumentException) {
                notice = error.message ?: "The operation needs a different input."
            } catch (_: Exception) {
                notice = "The operation could not complete. Check connectivity and configuration, then retry."
            } finally {
                busy = false
            }
        }
    }

    private fun exam(id: String): WorkspaceExam = workspace.exams.first { it.id == id }

    private fun approvedRubric(exam: WorkspaceExam): GradingPack = requireNotNull(exam.rubric?.takeIf { it.approvedAt != null }) {
        "Approve a grading pack before adding or grading student answers."
    }

    private fun checkSources(paper: String, key: String) {
        require(paper.length <= PromptLimits.SOURCE_CHARS && key.length <= PromptLimits.SOURCE_CHARS) {
            "Question paper and answer key are limited to 60,000 characters apiece."
        }
    }

    private suspend fun addAnswers(exam: WorkspaceExam, additions: List<Answer>) {
        require(additions.all { it.text.length <= PromptLimits.ANSWER_CHARS && it.studentId.length <= 120 }) {
            "Each student ID is limited to 120 characters and each answer to 10,000 characters."
        }
        val ids = exam.answers.map { it.studentId to it.questionId }.toMutableSet()
        val unique = additions.filter { ids.add(it.studentId to it.questionId) }
        if (unique.isNotEmpty()) update(exam.copy(answers = exam.answers + unique))
        notice = "Added ${unique.size} answers. Skipped ${additions.size - unique.size} duplicate student and question pairs."
    }

    private suspend fun replaceAnswer(id: String, replacement: Answer) {
        val exam = exam(id)
        update(exam.copy(answers = exam.answers.map {
            if (it.studentId == replacement.studentId && it.questionId == replacement.questionId) replacement else it
        }))
    }

    private suspend fun update(exam: WorkspaceExam) {
        save(workspace.copy(exams = workspace.exams.map { if (it.id == exam.id) exam else it }))
    }

    private suspend fun save(snapshot: Workspace) {
        withContext(Dispatchers.IO) {
            val bytes = wireJson.encodeToString(snapshot).encodeToByteArray()
            val stream = localFile.startWrite()
            try {
                stream.write(bytes)
                localFile.finishWrite(stream)
            } catch (error: Exception) {
                localFile.failWrite(stream)
                throw error
            }
        }
        workspace = snapshot
    }
}
