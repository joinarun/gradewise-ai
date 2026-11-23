package app.gradewise.android

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerateContentResponse
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.generationConfig
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.Serializable
import kotlin.time.TimeSource

internal interface Inference {
    fun connected(): Boolean
    suspend fun grade(source: Source, model: String, question: Question, answer: String): Attempt
}

@Serializable
private data class PromptInstructions(val rubric: String, val grade: String)

@Serializable
private data class RubricInput(val exam: Exam, val questionPaper: String, val answerKey: String)

@Serializable
private data class GradingInput(val rubric: Question, val answer: String)

internal object PromptLimits {
    const val SOURCE_CHARS = 60_000
    const val ANSWER_CHARS = 10_000
    const val LOCAL_PROMPT_CHARS = 6_000
}

@OptIn(PublicPreviewAPI::class)
internal class FirebaseInference(private val context: Context) : Inference {
    val configured: Boolean
        get() = FirebaseApp.getApps(context).any { it.name == FirebaseApp.DEFAULT_APP_NAME }

    override fun connected(): Boolean {
        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        val network = connectivity.activeNetwork ?: return false
        return connectivity.getNetworkCapabilities(network)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
    }

    suspend fun nanoStatus(): String {
        val client = Generation.getClient()
        return try {
            when (client.checkStatus()) {
                FeatureStatus.AVAILABLE -> "Gemini Nano is ready"
                FeatureStatus.DOWNLOADABLE -> "Gemini Nano can be downloaded"
                FeatureStatus.DOWNLOADING -> "Gemini Nano is downloading"
                else -> "Gemini Nano is unavailable on this device"
            }
        } finally {
            client.close()
        }
    }

    suspend fun downloadNano(onUpdate: (String) -> Unit) {
        val client = Generation.getClient()
        try {
            require(client.checkStatus() == FeatureStatus.DOWNLOADABLE) { "Gemini Nano is not ready to download." }
            client.download().collect {
                val message = when (it) {
                    is DownloadStatus.DownloadStarted -> "Downloading Gemini Nano"
                    is DownloadStatus.DownloadProgress -> "Downloaded ${it.totalBytesDownloaded / 1_000_000} MB"
                    DownloadStatus.DownloadCompleted -> "Gemini Nano is ready"
                    is DownloadStatus.DownloadFailed -> "The Gemini Nano download failed"
                }
                onUpdate(message)
            }
        } finally {
            client.close()
        }
    }

    suspend fun rubric(exam: WorkspaceExam, model: String): Pair<GradingPack, Attempt> {
        require(connected()) { "Connect to the internet to prepare a grading pack." }
        val timer = TimeSource.Monotonic.markNow()
        val prompt = buildRubricPrompt(exam)
        val response = withTimeout(60_000) {
            firebaseModel(Source.CLOUD, model, maxTokens = 8192).generateObject(
                RubricResponse.firebaseAISchema(), prompt,
            )
        }
        val telemetry = response.response.toAttempt(Source.CLOUD, timer.elapsedNow().inWholeMilliseconds)
        require(telemetry.source == Source.CLOUD) { "Firebase did not report cloud inference." }
        val data = requireNotNull(response.getObject()) { "The model did not return a grading pack." }
        return GradingPack(exam = exam.metadata, questions = data.questions).also { it.validate() } to telemetry
    }

    override suspend fun grade(source: Source, model: String, question: Question, answer: String): Attempt {
        val timer = TimeSource.Monotonic.markNow()
        val prompt = buildGradingPrompt(question, answer)
        if (source == Source.DEVICE && prompt.length > PromptLimits.LOCAL_PROMPT_CHARS) {
            return Attempt(source, warnings = listOf("The rubric and answer exceed the on-device input budget."))
        }
        return try {
            val response = withTimeout(45_000) {
                firebaseModel(source, model, maxTokens = 1200).generateObject(GradingResult.firebaseAISchema(), prompt)
            }
            val caughtAt = timer.elapsedNow().inWholeMilliseconds
            val telemetry = response.response.toAttempt(source, caughtAt)
            if (telemetry.source != source) return telemetry.copy(warnings = listOf("Firebase returned an unexpected inference source."))
            val result = try {
                response.getObject()
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                null
            }
            if (result == null) telemetry.copy(warnings = listOf("The model returned an invalid grading response."))
            else telemetry.copy(result = result, warnings = result.warningsFor(question, answer))
        } catch (_: TimeoutCancellationException) {
            Attempt(source, warnings = listOf("${source.label} inference timed out."), latencyMillis = timer.elapsedNow().inWholeMilliseconds)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            val problem = if (!configured) "Firebase configuration is missing." else "${source.label} inference was unavailable or failed."
            Attempt(source, warnings = listOf(problem), latencyMillis = timer.elapsedNow().inWholeMilliseconds)
        }
    }

    suspend fun probe(source: Source, model: String): String {
        val result = withTimeout(30_000) {
            firebaseModel(source, model, maxTokens = 128).generateContent("Respond with the single word ready.")
        }
        val attempt = result.toAttempt(source, 0)
        require(attempt.source == source && !result.text.isNullOrBlank()) { "Firebase returned no matching inference result." }
        return "${attempt.source.label} response received from Firebase AI Logic."
    }

    private fun firebaseModel(source: Source, model: String, maxTokens: Int) = Firebase.ai(
        backend = GenerativeBackend.googleAI(),
    ).generativeModel(
        modelName = model,
        generationConfig = generationConfig {
            temperature = 0.1f
            maxOutputTokens = maxTokens
        },
        onDeviceConfig = when (source) {
            Source.DEVICE -> OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE, maxOutputTokens = 256, temperature = 0.1f)
            Source.CLOUD -> OnDeviceConfig(mode = InferenceMode.ONLY_IN_CLOUD)
        },
    )

    private fun GenerateContentResponse.toAttempt(route: Source, millis: Long): Attempt = Attempt(
        route = route,
        source = when (inferenceSource) {
            InferenceSource.ON_DEVICE -> Source.DEVICE
            InferenceSource.IN_CLOUD -> Source.CLOUD
            else -> null
        },
        latencyMillis = millis,
        promptTokens = usageMetadata?.promptTokenCount,
        outputTokens = usageMetadata?.let { metadata ->
            metadata.candidatesTokenCount?.plus(metadata.thoughtsTokenCount)
        },
    )

    private fun buildRubricPrompt(exam: WorkspaceExam): String =
        "${instructions.rubric}\nINPUT:\n${wireJson.encodeToString(RubricInput(exam.metadata, exam.paper, exam.answerKey))}"

    private fun buildGradingPrompt(question: Question, answer: String): String =
        "${instructions.grade}\nINPUT:\n${wireJson.encodeToString(GradingInput(question, answer))}"

    private val instructions by lazy {
        val asset = context.assets.open("prompts/instructions.json").bufferedReader().use { it.readText() }
        wireJson.decodeFromString<PromptInstructions>(asset)
    }
}

internal suspend fun evaluate(
    inference: Inference,
    policy: Policy,
    cloudConsent: Boolean,
    model: String,
    question: Question,
    answer: Answer,
    autoApprove: Boolean,
): Answer {
    if (answer.text.isBlank() || answer.text.length > PromptLimits.ANSWER_CHARS) {
        return answer.copy(status = AnswerStatus.REVIEW, warnings = listOf("Verify the answer text before requesting AI grading."))
    }
    val attempts = mutableListOf<Attempt>()
    val warnings = mutableListOf<String>()
    suspend fun device() = inference.grade(Source.DEVICE, model, question, answer.text).also { attempts += it }
    suspend fun cloud(): Attempt? {
        if (!cloudConsent) {
            warnings += "Student answer sharing requires explicit consent."
            return null
        }
        if (!inference.connected()) {
            warnings += "Cloud grading is waiting for an internet connection."
            return null
        }
        return inference.grade(Source.CLOUD, model, question, answer.text).also { attempts += it }
    }

    fun Attempt?.canGrade() = this != null && result != null && this.warnings.isEmpty()
    when (policy) {
        Policy.DEVICE_ONLY -> device()
        Policy.CLOUD_ONLY -> cloud()
        Policy.PREFER_DEVICE -> if (!device().canGrade()) cloud() else Unit
        Policy.CLOUD_FIRST -> if (!cloud().canGrade()) device() else Unit
    }
    val usable = attempts.lastOrNull { it.canGrade() }
    val history = answer.attempts + attempts
    fun recentMarks(source: Source): Double? = history.asReversed().firstNotNullOfOrNull {
        if (it.source == source) it.result?.marks?.takeIf { marks -> validMarks(marks, 0.0, question.maxMarks) } else null
    }
    val deviceMarks = recentMarks(Source.DEVICE)
    val cloudMarks = recentMarks(Source.CLOUD)
    val disagreement = deviceMarks != null && cloudMarks != null && !sameMarks(deviceMarks, cloudMarks)
    if (disagreement) warnings += "Cloud and on-device marks disagree."
    if (usable == null) warnings += "No validated score is available. Retry or review the answer manually."
    val finalMarks = usable?.result?.marks?.takeIf { autoApprove && !disagreement }
    return answer.copy(
        attempts = history,
        status = when {
            finalMarks != null -> AnswerStatus.FINALIZED
            usable != null && !disagreement -> AnswerStatus.PROVISIONAL
            else -> AnswerStatus.REVIEW
        },
        warnings = warnings,
        finalMarks = finalMarks,
        automaticallyApproved = finalMarks != null,
    )
}
