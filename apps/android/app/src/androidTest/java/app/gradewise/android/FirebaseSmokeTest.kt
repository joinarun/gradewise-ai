package app.gradewise.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Tasks
import com.google.firebase.appcheck.FirebaseAppCheck
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class FirebaseSmokeTest {
    @Test
    fun registeredAppCheckExchangesForSignedToken() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("firebaseAppCheckSmoke") == "true")
        val token = Tasks.await(FirebaseAppCheck.getInstance().getAppCheckToken(true), 30, TimeUnit.SECONDS)
        assertTrue("App Check returned an attestation token", token.token.split('.').size == 3)
    }

    @Test
    fun cloudPreparesAndGradesSyntheticExam() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        assumeTrue(InstrumentationRegistry.getArguments().getString("firebaseSmoke") == "true")
        val firebase = FirebaseInference(instrumentation.targetContext)
        check(firebase.configured) { "Firebase configuration is required for the cloud smoke test." }
        val model = Workspace().model
        val exam = WorkspaceExam(
            id = "synthetic-smoke",
            metadata = Exam("Botany practice", "Science", "Grade 6", "2026-11-23", 2.0),
            paper = "1. Mention two functions of roots in plants. (2 marks)",
            answerKey = "1. Roots absorb water or minerals (1 mark) and anchor the plant (1 mark).",
        )

        val (rubric, telemetry) = firebase.rubric(exam, model)
        assertEquals(Source.CLOUD, telemetry.source)
        val attempt = firebase.grade(
            Source.CLOUD, model, rubric.questions.single(),
            "Roots take water from the soil and keep the plant fixed.",
        )
        assertEquals(Source.CLOUD, attempt.source)
        assertNotNull(attempt.result)
        assertEquals(emptyList<String>(), attempt.warnings)
        assertEquals(2.0, checkNotNull(attempt.result).marks, 0.0)
    }

    @Test
    fun airplaneModeRetainsCloudOnlyAnswersForTeacherReview() = runBlocking {
        assumeTrue(InstrumentationRegistry.getArguments().getString("firebaseOfflineSmoke") == "true")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val firebase = FirebaseInference(context)
        check(!firebase.connected()) { "Disconnect the test device before running the airplane-mode test." }
        val packJson = context.assets.open("rubrics/roots.v1.json").bufferedReader().use { it.readText() }
        val pack = wireJson.decodeFromString<GradingPack>(packJson)
        val question = pack.questions.first()
        val answer = Answer("Offline sample", question.id, "Roots take water from the soil.")
        val result = evaluate(firebase, Policy.CLOUD_ONLY, true, Workspace().model, question, answer, false)

        assertEquals(AnswerStatus.REVIEW, result.status)
        assertEquals(emptyList<Attempt>(), result.attempts)
        assertNull(result.finalMarks)
        assertTrue(result.warnings.any { it.contains("internet connection") })
    }

    @Test
    fun onDeviceReturnsStructuredAnswerEvidence() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        assumeTrue(InstrumentationRegistry.getArguments().getString("firebaseLocalSmoke") == "true")
        val context = instrumentation.targetContext
        val firebase = FirebaseInference(context)
        check(firebase.configured) { "Firebase configuration is required for the on-device smoke test." }
        val packJson = context.assets.open("rubrics/roots.v1.json").bufferedReader().use { it.readText() }
        val pack = wireJson.decodeFromString<GradingPack>(packJson)
        val attempt = firebase.grade(
            Source.DEVICE, Workspace().model, pack.questions.first(),
            "Roots take water from the soil and keep the plant fixed.",
        )
        assertEquals(attempt.warnings.joinToString(), Source.DEVICE, attempt.source)
        assertNotNull(attempt.result)
    }
}
