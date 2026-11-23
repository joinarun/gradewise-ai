package app.gradewise.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.viewModels
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.Json
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    private val viewModel: WorkspaceViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Pine,
                    onPrimary = Color.White,
                    surface = Color.White,
                    onSurface = Ink,
                    background = Paper,
                    onBackground = Ink,
                    secondaryContainer = Citrus,
                    outline = Color(0xFF788B81),
                ),
                typography = Typography(),
            ) {
                GradeWise(viewModel)
            }
        }
    }

    override fun onStop() {
        super.onStop()
        viewModel.pauseBatch()
    }
}

private val Pine = Color(0xFF124A3E)
private val DeepPine = Color(0xFF14382F)
private val Citrus = Color(0xFFE6F4AF)
private val Paper = Color(0xFFF3F6EF)
private val Ink = Color(0xFF172D25)
private val MutedInk = Color(0xFF53685D)

private enum class Page(val title: String) {
    Exams("Exams"), Create("Create exam"), Sources("Sources"), Rubric("Rubric"), Answers("Answers"),
    Results("Results"), Settings("Settings")
}

@Composable
private fun GradeWise(vm: WorkspaceViewModel) {
    var page by rememberSaveable { mutableStateOf(Page.Exams) }
    var examId by rememberSaveable { mutableStateOf("") }
    val exam = vm.workspace.exams.firstOrNull { it.id == examId }

    fun open(id: String, target: Page) {
        examId = id
        page = target
    }

    Scaffold(
        containerColor = Paper,
        topBar = {
            Surface(color = DeepPine, contentColor = Color.White) {
                Row(
                    modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(start = 20.dp, end = 12.dp, top = 18.dp, bottom = 14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text("GradeWise AI", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                        Text("Teacher workspace", color = Citrus, fontSize = 13.sp)
                    }
                    Row {
                        TextButton(onClick = { page = Page.Exams }) { Text("Exams", color = Color.White) }
                        TextButton(onClick = { page = Page.Settings }) { Text("Settings", color = Color.White) }
                    }
                }
            }
        },
    ) { padding ->
        Box(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentAlignment = Alignment.TopCenter,
        ) {
            key(page, examId) {
                Column(
                    modifier = Modifier.widthIn(max = 780.dp).fillMaxWidth()
                        .verticalScroll(rememberScrollState()).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    if (vm.busy) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    if (vm.notice.isNotBlank()) {
                        Surface(color = Citrus, shape = RoundedCornerShape(12.dp)) {
                            Text(vm.notice, modifier = Modifier.fillMaxWidth().padding(12.dp))
                        }
                    }
                    if (!vm.hasWorkspace) {
                        if (vm.busy) Text("Opening workspace…")
                    } else when (page) {
                        Page.Exams -> Exams(vm, { page = Page.Create }) { open(it.id, if (it.rubric?.approvedAt == null) Page.Sources else Page.Answers) }
                        Page.Create -> CreateExam(vm) { open(it, Page.Sources) }
                        Page.Settings -> Settings(vm)
                        else -> if (exam != null) {
                            Heading(exam.metadata.name, "${exam.metadata.subject} · ${exam.metadata.className} · ${score(exam.metadata.maxMarks)} marks")
                            Row(
                                modifier = Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                listOf(Page.Sources, Page.Rubric, Page.Answers, Page.Results).forEach { tab ->
                                    if (page == tab) Button(onClick = {}) { Text(tab.title) }
                                    else OutlinedButton(onClick = { page = tab }) { Text(tab.title) }
                                }
                            }
                            when (page) {
                                Page.Sources -> Sources(vm, exam) { page = Page.Rubric }
                                Page.Rubric -> Rubric(vm, exam) { page = Page.Answers }
                                Page.Answers -> Answers(vm, exam)
                                Page.Results -> Results(vm, exam)
                                else -> Unit
                            }
                        }
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun Exams(vm: WorkspaceViewModel, create: () -> Unit, open: (WorkspaceExam) -> Unit) {
    Surface(color = Pine, contentColor = Color.White, shape = RoundedCornerShape(24.dp)) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("EXAMINATION WORKSPACE", color = Citrus, fontSize = 12.sp, letterSpacing = 1.2.sp, fontWeight = FontWeight.SemiBold)
            Text("Assessment, made clearer.", fontFamily = FontFamily.Serif, fontSize = 36.sp, lineHeight = 40.sp)
            Text("Prepare a marking rubric, grade student work, and approve final results.", color = Color(0xFFE2EDE6))
            Button(
                onClick = create,
                enabled = !vm.busy,
                colors = ButtonDefaults.buttonColors(containerColor = Citrus, contentColor = Ink),
            ) { Text("Create examination") }
        }
    }
    Heading("Your examinations", null)
    if (vm.workspace.exams.isEmpty()) Text("Create an exam or explore the synthetic example.", color = MutedInk)
    for (exam in vm.workspace.exams.asReversed()) {
        Panel {
            Text(exam.metadata.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text("${exam.metadata.subject} · ${exam.metadata.className} · ${exam.metadata.date}", color = MutedInk)
            Text("${exam.answers.size} answers · ${if (exam.rubric?.approvedAt == null) "Rubric awaiting approval" else "Rubric approved"}")
            OutlinedButton(onClick = { open(exam) }) { Text("Open examination") }
        }
    }
    OutlinedButton(enabled = !vm.busy, onClick = { vm.sample { id -> vm.workspace.exams.firstOrNull { it.id == id }?.let(open) } }) {
        Text("Open synthetic example")
    }
}

@Composable
private fun CreateExam(vm: WorkspaceViewModel, next: (String) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var subject by rememberSaveable { mutableStateOf("") }
    var className by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var max by rememberSaveable { mutableStateOf("") }
    var auto by rememberSaveable { mutableStateOf(false) }
    Panel {
        Heading("Create examination", "Enter the exam details before adding the question paper and answer key.")
        Field("Exam name", name, { name = it })
        Field("Subject", subject, { subject = it })
        Field("Class", className, { className = it })
        Field("Date (YYYY-MM-DD)", date, { date = it })
        Field("Maximum marks", max, { max = it }, numeric = true)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = auto, onCheckedChange = { auto = it })
            Text("Automatically approve validated, unambiguous grades")
        }
        Button(
            onClick = { vm.createExam(Exam(name.trim(), subject.trim(), className.trim(), date.trim(), max.toDoubleOrNull() ?: 0.0, auto), next) },
            enabled = !vm.busy,
        ) { Text("Save examination") }
    }
}

@Composable
private fun Sources(vm: WorkspaceViewModel, exam: WorkspaceExam, openRubric: () -> Unit) {
    var paper by remember(exam.paper) { mutableStateOf(exam.paper) }
    var answerKey by remember(exam.answerKey) { mutableStateOf(exam.answerKey) }
    var confirmation by remember { mutableStateOf(false) }
    val paperFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importDocuments(listOf(uri)) { paper = it.single().text }
    }
    val keyFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importDocuments(listOf(uri)) { answerKey = it.single().text }
    }
    LaunchedEffect(exam.rubric, vm.notice) {
        if (exam.rubric != null && vm.notice.startsWith("Cloud grading pack prepared")) openRubric()
    }
    Panel {
        Heading("Question paper and answer key", "Import PDF, TXT, JPEG or PNG. Verify the extracted text against the original, especially for scans and handwriting.")
        Field("Question paper", paper, { paper = it }, lines = 4, enabled = exam.answers.isEmpty())
        OutlinedButton(enabled = !vm.busy && exam.answers.isEmpty(), onClick = { paperFile.launch(documentTypes) }) { Text("Import question paper") }
        Field("Answer key or marking scheme", answerKey, { answerKey = it }, lines = 4, enabled = exam.answers.isEmpty())
        OutlinedButton(enabled = !vm.busy && exam.answers.isEmpty(), onClick = { keyFile.launch(documentTypes) }) { Text("Import answer key") }
        Button(
            enabled = !vm.busy && exam.answers.isEmpty() && paper.isNotBlank() && answerKey.isNotBlank(),
            onClick = { confirmation = true },
        ) { Text("Prepare rubric with Gemini") }
        TextButton(enabled = !vm.busy && exam.answers.isEmpty(), onClick = { vm.saveSources(exam.id, paper, answerKey) }) {
            Text("Save source text")
        }
    }
    if (confirmation) {
        Confirm("Send exam sources to Gemini?", "The confirmed question paper and answer key will be sent to Firebase AI Logic. Use synthetic or non-sensitive material.", "Prepare rubric", { confirmation = false }) {
            confirmation = false
            vm.prepareRubric(exam.id, paper, answerKey)
        }
    }
}

@Composable
private fun Rubric(vm: WorkspaceViewModel, exam: WorkspaceExam, showAnswers: () -> Unit) {
    val rubric = exam.rubric
    var editing by rememberSaveable { mutableStateOf(false) }
    var payload by remember(rubric?.questions) {
        mutableStateOf(rubric?.let { prettyJson.encodeToString(RubricResponse(it.questions)) } ?: emptyRubric)
    }
    Panel {
        Heading("Grading pack", if (rubric?.approvedAt == null) "Review and approve the scoring criteria before grading." else "Approved and available offline.")
        if (rubric == null && !editing) Text("Prepare a cloud rubric from Sources, or enter one manually.")
        if (editing) {
            Field("Rubric questions JSON", payload, { payload = it }, lines = 8)
            OutlinedButton(enabled = !vm.busy, onClick = { vm.saveRubric(exam.id, payload, false) }) { Text("Save draft") }
        }
        if (exam.answers.isEmpty()) {
            Button(enabled = !vm.busy && (rubric != null || editing), onClick = { vm.saveRubric(exam.id, payload, true) }) { Text("Approve grading pack") }
            TextButton(enabled = !vm.busy, onClick = { editing = !editing }) { Text(if (editing) "Hide JSON editor" else "Edit rubric JSON") }
        }
        if (rubric?.approvedAt != null) OutlinedButton(onClick = showAnswers) { Text("Open student answers") }
    }
    for (question in rubric?.questions.orEmpty()) {
        Panel {
            Text("${question.id} · ${score(question.maxMarks)} marks", color = Pine, fontWeight = FontWeight.SemiBold)
            Text(question.text, style = MaterialTheme.typography.titleLarge)
            Text(question.referenceAnswer)
            for (criterion in question.criteria) {
                Text("${criterion.description} · ${score(criterion.maxMarks)} marks", fontWeight = FontWeight.Bold)
                Text(criterion.partialCredit, color = MutedInk)
            }
            if (question.alternatives.isNotEmpty()) Text("Acceptable alternatives\n${question.alternatives.joinToString("\n")}", color = MutedInk)
            if (question.examples.correct.isNotEmpty()) Text("Correct examples\n${question.examples.correct.joinToString("\n")}", color = MutedInk)
            if (question.examples.incorrect.isNotEmpty()) Text("Incorrect examples\n${question.examples.incorrect.joinToString("\n")}", color = MutedInk)
            if (question.constraints.isNotEmpty()) Text("Scoring constraints\n${question.constraints.joinToString("\n")}", color = MutedInk)
        }
    }
}

private data class GradingRun(val target: Pair<String, String>?, val retryUnresolved: Boolean)

@Composable
private fun Answers(vm: WorkspaceViewModel, exam: WorkspaceExam) {
    val pack = exam.rubric?.takeIf { it.approvedAt != null }
    if (pack == null) {
        Panel { Heading("Student answers", "Approve the grading pack before adding student answers.") }
        return
    }
    var student by rememberSaveable { mutableStateOf("") }
    var questionId by rememberSaveable { mutableStateOf(pack.questions.first().id) }
    var answerText by remember { mutableStateOf("") }
    var papers by remember { mutableStateOf(emptyList<ImportedText>()) }
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    var consent by remember { mutableStateOf<GradingRun?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) vm.importDocuments(uris) { papers = it }
    }

    fun grade(pair: Pair<String, String>? = null, retryUnresolved: Boolean = false) {
        if (vm.workspace.policy == Policy.DEVICE_ONLY) vm.gradePending(exam.id, false, pair, retryUnresolved)
        else consent = GradingRun(pair, retryUnresolved)
    }

    Panel {
        Heading("Student answers", "Add an answer or import several numbered papers for review.")
        Field("Student alias or ID", student, { student = it })
        MenuField("Question", questionId, pack.questions.map { it.id }, { it }, { questionId = it })
        Field("Verified answer text", answerText, { answerText = it }, lines = 3)
        Button(enabled = !vm.busy && student.isNotBlank(), onClick = { vm.addAnswer(exam.id, student, questionId, answerText) }) { Text("Add answer") }
        OutlinedButton(enabled = !vm.busy, onClick = { picker.launch(documentTypes) }) { Text("Import student papers") }
    }

    if (papers.isNotEmpty()) {
        Panel {
            Heading("Verify imported papers", "Use an approved ID followed by a colon at the start of each answer, for example ${pack.questions.first().id}: …")
            papers.forEachIndexed { index, paper ->
                Field("Student alias for file ${index + 1}", paper.name, { value ->
                    papers = papers.mapIndexed { other, item -> if (other == index) item.copy(name = value) else item }
                })
                Field("Extracted text for file ${index + 1}", paper.text, { value ->
                    papers = papers.mapIndexed { other, item -> if (other == index) item.copy(text = value) else item }
                }, lines = 3)
            }
            Button(enabled = !vm.busy, onClick = { vm.addPapers(exam.id, papers) }) { Text("Confirm and add papers") }
            TextButton(enabled = !vm.busy, onClick = { papers = emptyList() }) { Text("Close preview") }
        }
    }

    val queued = exam.answers.count { it.status == AnswerStatus.QUEUED }
    val review = exam.answers.count { it.status == AnswerStatus.REVIEW || it.status == AnswerStatus.PROVISIONAL }
    Panel {
        Heading("Evaluation queue", "$queued queued · $review to review · ${exam.answers.count { it.status == AnswerStatus.FINALIZED }} finalized")
        Text("Policy: ${vm.workspace.policy.label}")
        if (vm.batchLabel.isNotBlank()) {
            Text(vm.batchLabel)
            OutlinedButton(onClick = vm::pauseBatch) { Text("Pause after current answer") }
        } else {
            Button(enabled = !vm.busy && queued > 0, onClick = { grade() }) { Text("Grade or resume queue") }
            if (exam.answers.any { it.status == AnswerStatus.REVIEW }) {
                OutlinedButton(enabled = !vm.busy, onClick = { grade(retryUnresolved = true) }) { Text("Retry unresolved answers") }
            }
        }
    }
    for (answer in exam.answers) {
        key(answer.studentId, answer.questionId) {
            val rowId = "${answer.studentId}\n${answer.questionId}"
            val question = pack.questions.first { it.id == answer.questionId }
            Panel {
                Text("${answer.studentId} · ${answer.questionId}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text("${answer.status.label}${answer.finalMarks?.let { " · ${score(it)}/${score(question.maxMarks)}" }.orEmpty()}", color = MutedInk)
                TextButton(onClick = { selected = if (selected == rowId) null else rowId }) {
                    Text(if (selected == rowId) "Hide evaluation details" else "Review answer")
                }
                if (selected == rowId) {
                    if (answer.status in setOf(AnswerStatus.QUEUED, AnswerStatus.REVIEW)) {
                        OutlinedButton(enabled = !vm.busy, onClick = { grade(answer.studentId to answer.questionId) }) { Text("Grade or retry answer") }
                    }
                    Review(vm, exam, answer, question)
                }
            }
        }
    }
    consent?.let { run ->
        AlertDialog(
            onDismissRequest = { consent = null },
            title = { Text("Allow cloud grading?") },
            text = { Text("The selected answers and marking rubric may be sent to Firebase AI Logic. Student IDs stay on this device. Use synthetic or non-sensitive answers with the demo project.") },
            confirmButton = {
                TextButton(onClick = {
                    consent = null
                    vm.gradePending(exam.id, true, run.target, run.retryUnresolved)
                }) { Text("Allow for this run") }
            },
            dismissButton = {
                TextButton(onClick = {
                    consent = null
                    if (vm.workspace.policy != Policy.CLOUD_ONLY) vm.gradePending(exam.id, false, run.target, run.retryUnresolved)
                }) { Text(if (vm.workspace.policy == Policy.CLOUD_ONLY) "Cancel" else "Keep answers on device") }
            },
        )
    }
}

@Composable
private fun Review(vm: WorkspaceViewModel, exam: WorkspaceExam, answer: Answer, question: Question) {
    var marks by rememberSaveable(answer.finalMarks) { mutableStateOf(answer.finalMarks?.let(::score) ?: "") }
    var benchmark by rememberSaveable(answer.teacherBenchmark) { mutableStateOf(answer.teacherBenchmark?.let(::score) ?: "") }
    HorizontalDivider()
    Text(question.text, fontWeight = FontWeight.SemiBold)
    Text(answer.text.ifBlank { "(Blank answer)" })
    Text("Reference answer", fontWeight = FontWeight.SemiBold)
    Text(question.referenceAnswer, color = MutedInk)
    question.criteria.forEach { Text("${it.description} (${score(it.maxMarks)}) · ${it.partialCredit}", color = MutedInk) }
    answer.warnings.forEach { Text(it, color = MaterialTheme.colorScheme.error) }
    for (attempt in answer.attempts) {
        HorizontalDivider()
        Text(attempt.source?.label ?: "${attempt.route.label} attempt without a response", fontWeight = FontWeight.SemiBold)
        attempt.result?.let { result ->
            Text("${score(result.marks)} / ${score(question.maxMarks)} · ${result.explanation}")
            result.criteria.forEach { criterion ->
                Text("${criterion.criterionId} · ${score(criterion.marks)} marks${if (criterion.evidence.isEmpty()) "" else " · “${criterion.evidence}”"}", color = MutedInk)
            }
        }
        attempt.warnings.forEach { Text(it, color = MaterialTheme.colorScheme.error) }
    }
    Field("Teacher marks (maximum ${score(question.maxMarks)})", marks, { marks = it }, numeric = true)
    Field("Optional teacher benchmark", benchmark, { benchmark = it }, numeric = true)
    if (answer.proposed?.result != null) {
        Button(enabled = !vm.busy, onClick = { vm.finalize(exam.id, answer, null, benchmark, true) }) { Text("Approve proposed score") }
    }
    OutlinedButton(enabled = !vm.busy, onClick = { vm.finalize(exam.id, answer, marks, benchmark, false) }) {
        Text(if (answer.proposed == null) "Finalize teacher score" else "Save override")
    }
    if (answer.proposed != null) TextButton(enabled = !vm.busy, onClick = { vm.reject(exam.id, answer) }) { Text("Reject proposed score") }
}

@Composable
private fun Results(vm: WorkspaceViewModel, exam: WorkspaceExam) {
    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri != null) vm.export(exam.id, uri)
    }
    val finalAnswers = exam.answers.filter { it.status == AnswerStatus.FINALIZED }
    val stats = statistics(exam, vm.workspace)
    Panel {
        val students = finalAnswers.map { it.studentId }.distinct().size
        Heading("Class results", "${quantity(finalAnswers.size, "finalized answer")} across ${quantity(students, "student")}")
        Button(enabled = !vm.busy && finalAnswers.isNotEmpty(), onClick = { export.launch("gradewise-results.csv") }) {
            Text("Export finalized CSV")
        }
        if (finalAnswers.isEmpty()) Text("Finalize grades in Answers to see class results.", color = MutedInk)
        finalAnswers.groupBy { it.studentId }.forEach { (student, records) ->
            val total = records.sumOf { it.finalMarks ?: 0.0 }
            val max = records.sumOf { answer -> exam.rubric?.questions?.firstOrNull { it.id == answer.questionId }?.maxMarks ?: 0.0 }
            Text("$student · ${score(total)}/${score(max)} marks from ${records.size} finalized answers")
        }
    }
    Panel {
        Heading("Hybrid AI usage", "Inference counts use the source reported by Firebase.")
        Metric("Students evaluated", stats.students.toString())
        Metric("Questions processed", stats.questions.toString())
        Metric("Answers evaluated", stats.answers.toString())
        Metric("On-device grading responses", stats.deviceResponses.toString())
        Metric("Cloud grading responses", stats.cloudResponses.toString())
        Metric("Cloud rubric responses", stats.rubricResponses.toString())
        Metric("Cloud escalation rate", stats.escalationRate)
        Metric("Average inference latency", stats.averageLatency)
        Metric("Model failures", stats.failures.toString())
        Metric("Teacher override rate", stats.overrides)
        Metric("Exact benchmark agreement", stats.agreement)
        Metric("Estimated paid-tier usage cost", stats.apiCost)
        Metric("Estimated paid-tier cost avoided", stats.avoidedCost)
        Text("These estimates apply paid-tier prices to recorded tokens. The demo project’s free quota incurs no API charge. Avoided costs use average recorded cloud grading usage and exclude device compute.", color = MutedInk)
    }
}

@Composable
private fun Settings(vm: WorkspaceViewModel) {
    var policy by rememberSaveable(vm.workspace.policy) { mutableStateOf(vm.workspace.policy) }
    var model by rememberSaveable(vm.workspace.model) { mutableStateOf(vm.workspace.model) }
    var input by rememberSaveable(vm.workspace.priceInputPerMillion) { mutableStateOf(vm.workspace.priceInputPerMillion.toString()) }
    var output by rememberSaveable(vm.workspace.priceOutputPerMillion) { mutableStateOf(vm.workspace.priceOutputPerMillion.toString()) }
    Panel {
        Heading("Inference settings", "Choose how GradeWise evaluates student answers.")
        MenuField("Evaluation policy", policy, Policy.entries, { it.label }, { policy = it })
        Field("Gemini cloud model ID", model, { model = it })
        Field("Input price / million tokens (USD)", input, { input = it }, numeric = true)
        Field("Output price / million tokens (USD)", output, { output = it }, numeric = true)
        Button(enabled = !vm.busy, onClick = { vm.settings(policy, model.trim(), input, output) }) { Text("Save settings") }
    }
    Panel {
        Heading("Model availability", vm.nanoStatus)
        OutlinedButton(enabled = !vm.busy, onClick = vm::checkNano) { Text("Check Gemini Nano") }
        if (vm.nanoStatus.contains("can be downloaded")) {
            OutlinedButton(enabled = !vm.busy, onClick = vm::downloadNano) { Text("Download Gemini Nano") }
        }
        Text(if (vm.configured) "Firebase registration present" else "Firebase registration required for AI requests")
        OutlinedButton(enabled = !vm.busy && vm.configured, onClick = { vm.probe(Source.DEVICE) }) { Text("Test on-device inference") }
        OutlinedButton(enabled = !vm.busy && vm.configured, onClick = { vm.probe(Source.CLOUD) }) { Text("Test cloud inference") }
    }
}

@Composable
private fun Metric(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(label, color = MutedInk, modifier = Modifier.weight(1f))
        Text(value, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun Panel(content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White, contentColor = Ink),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}

@Composable
private fun Heading(text: String, subtitle: String?) {
    Text(text, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
    if (subtitle != null) Text(subtitle, color = MutedInk)
}

@Composable
private fun Field(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    lines: Int = 1,
    numeric: Boolean = false,
    enabled: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        singleLine = lines == 1,
        minLines = lines,
        maxLines = if (lines == 1) 1 else lines + 5,
        keyboardOptions = KeyboardOptions(keyboardType = if (numeric) KeyboardType.Decimal else KeyboardType.Text),
        enabled = enabled,
    )
}

@Composable
private fun <T> MenuField(label: String, value: T, options: List<T>, display: (T) -> String, select: (T) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }) { Text("$label · ${display(value)}") }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(text = { Text(display(option)) }, onClick = { expanded = false; select(option) })
            }
        }
    }
}

@Composable
private fun Confirm(title: String, text: String, submit: String, close: () -> Unit, confirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = close,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { TextButton(onClick = confirm) { Text(submit) } },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } },
    )
}

private fun quantity(count: Int, label: String): String = "$count $label${if (count == 1) "" else "s"}"

private fun score(value: Double): String = if (value % 1 == 0.0) value.toLong().toString() else value.toString()
private val prettyJson = Json { encodeDefaults = true; prettyPrint = true }
private val documentTypes = arrayOf("application/pdf", "text/plain", "image/jpeg", "image/png")
private val emptyRubric = """{"questions": []}"""
