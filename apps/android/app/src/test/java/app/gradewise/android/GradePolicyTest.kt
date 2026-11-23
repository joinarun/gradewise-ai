package app.gradewise.android

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GradePolicyTest {
    private val answer = Answer("Synthetic-1", "Q1", "Roots take water from the soil.")
    private val question = Question(
        id = answer.questionId,
        text = "What do roots absorb?",
        referenceAnswer = "Water is absorbed.",
        maxMarks = 1.0,
        criteria = listOf(Criterion("water", "Absorbs water", 1.0, "No further partial credit.")),
        alternatives = emptyList(),
        examples = Examples(emptyList(), emptyList()),
        constraints = emptyList(),
    )
    private val valid = GradingResult(1.0, "The answer identifies absorption.", listOf(CriterionScore("water", 1.0, "take water")), false)
    private val invalid = valid.copy(criteria = listOf(CriterionScore("water", 1.0, "from the atmosphere")))
    private val different = GradingResult(0.0, "Evidence of absorption was uncertain.", listOf(CriterionScore("water", 0.0, "")), true)

    @Test
    fun rejectsInventedEvidenceAndIncorrectTotals() {
        assertTrue(valid.warningsFor(question, answer.text).isEmpty())
        assertTrue(invalid.warningsFor(question, answer.text).any { it.contains("exact quote") })
        assertTrue(valid.copy(marks = 0.5).warningsFor(question, answer.text).any { it.contains("proposed total") })
    }

    @Test
    fun uncertainDeviceResultEscalatesOnlyWithConsent() = runTest {
        val policy = TestInference(deviceResult = different)
        val denied = evaluate(policy, Policy.PREFER_DEVICE, false, "gemini", question, answer, false)
        assertEquals(listOf(Source.DEVICE), policy.calls)
        assertEquals(AnswerStatus.REVIEW, denied.status)

        policy.calls.clear()
        val accepted = evaluate(policy, Policy.PREFER_DEVICE, true, "gemini", question, answer, true)
        assertEquals(listOf(Source.DEVICE, Source.CLOUD), policy.calls)
        assertEquals(AnswerStatus.REVIEW, accepted.status)
        assertEquals(2, accepted.attempts.size)
        assertNull(accepted.finalMarks)
        assertTrue(accepted.warnings.any { it.contains("disagree") })
    }

    @Test
    fun retryCannotAutomaticallyOverrideAnEarlierCrossSourceDisagreement() = runTest {
        val policy = TestInference()
        val previous = Attempt(Source.DEVICE, Source.DEVICE, different, different.warningsFor(question, answer.text))
        val processed = evaluate(
            policy, Policy.CLOUD_ONLY, true, "gemini", question, answer.copy(attempts = listOf(previous)), true,
        )
        assertEquals(listOf(Source.CLOUD), policy.calls)
        assertEquals(AnswerStatus.REVIEW, processed.status)
        assertNull(processed.finalMarks)
    }

    @Test
    fun offlineCloudFirstUsesOnlyTheDevice() = runTest {
        val policy = TestInference(online = false)
        val processed = evaluate(policy, Policy.CLOUD_FIRST, true, "gemini", question, answer, false)
        assertEquals(listOf(Source.DEVICE), policy.calls)
        assertEquals(AnswerStatus.PROVISIONAL, processed.status)
        assertTrue(processed.warnings.any { it.contains("internet") })
    }

    @Test
    fun offlineCloudOnlyHasAReviewableAnswerAndNoSyntheticResult() = runTest {
        val policy = TestInference(online = false)
        val processed = evaluate(policy, Policy.CLOUD_ONLY, true, "gemini", question, answer, true)
        assertTrue(policy.calls.isEmpty())
        assertEquals(AnswerStatus.REVIEW, processed.status)
        assertNull(processed.proposed)
        assertNull(processed.finalMarks)
    }

    @Test
    fun teacherOptInAutoApprovesOnlyValidatedResults() = runTest {
        val policy = TestInference()
        val processed = evaluate(policy, Policy.DEVICE_ONLY, true, "gemini", question, answer, true)
        assertEquals(listOf(Source.DEVICE), policy.calls)
        assertEquals(AnswerStatus.FINALIZED, processed.status)
        assertEquals(1.0, processed.finalMarks)
        assertTrue(processed.automaticallyApproved)
    }

    @Test
    fun blankAnswersAndUnconfirmedExtractionStayInReview() = runTest {
        val backend = TestInference()
        val state = evaluate(backend, Policy.PREFER_DEVICE, true, "gemini", question, answer.copy(text = " "), true)
        assertTrue(backend.calls.isEmpty())
        assertEquals(AnswerStatus.REVIEW, state.status)
        assertNull(state.finalMarks)
    }

    @Test
    fun numberedPaperSupportsMultilineAnswersAndRejectsDuplicateQuestionIds() {
        val parsed = papersFromText("S-1", "Q1: Roots absorb\nwater.", listOf(question))
        assertEquals("Roots absorb\nwater.", parsed.single().text)
        assertTrue(runCatching { papersFromText("S-1", "Q1: Roots drink.\nQ1: Water.", listOf(question)) }.isFailure)
    }

    @Test
    fun csvIncludesOnlyFinalizedAnswersAndEscapesSpreadsheetFormulas() {
        val exam = Exam("Botany", "Science", "Class 6", "2026-11-23", 1.0, false)
        val pack = GradingPack(exam = exam, questions = listOf(question), approvedAt = "2026-11-23T01:00:00Z")
        pack.validate()
        val csv = finalizedCsv(
            WorkspaceExam("exam", exam, rubric = pack, answers = listOf(
                answer,
                answer.copy(studentId = "=1+1", status = AnswerStatus.FINALIZED, finalMarks = 0.5),
            )),
        )
        assertTrue(csv.contains("\"'=1+1\""))
        assertTrue(!csv.contains("Synthetic-1"))
    }

    private inner class TestInference(
        private val online: Boolean = true,
        private val deviceResult: GradingResult = valid,
    ) : Inference {
        val calls = mutableListOf<Source>()
        override fun connected() = online
        override suspend fun grade(source: Source, model: String, question: Question, answer: String): Attempt {
            calls += source
            val result = if (source == Source.DEVICE) deviceResult else valid
            return Attempt(source, source, result, result.warningsFor(question, answer))
        }
    }
}
