package app.gradewise.android

import java.util.Locale

internal data class Statistics(
    val students: Int,
    val questions: Int,
    val answers: Int,
    val deviceResponses: Int,
    val cloudResponses: Int,
    val rubricResponses: Int,
    val escalationRate: String,
    val averageLatency: String,
    val failures: Int,
    val overrides: String,
    val agreement: String,
    val apiCost: String,
    val avoidedCost: String,
)

internal fun statistics(exam: WorkspaceExam, settings: Workspace): Statistics {
    val attempted = exam.answers.filter { it.attempts.isNotEmpty() }
    val evaluated = attempted.filter { answer -> answer.attempts.any { it.result != null && it.source != null } }
    val all = attempted.flatMap { it.attempts }
    val deviceResponses = all.count { it.source == Source.DEVICE }
    val cloud = all.filter { it.source == Source.CLOUD }
    val cloudRubrics = exam.rubricAttempts.filter { it.source == Source.CLOUD }
    val latency = (all + exam.rubricAttempts).filter { it.latencyMillis > 0 }.map { it.latencyMillis }
    val localFirst = attempted.filter { it.attempts.firstOrNull()?.route == Source.DEVICE }
    val escalated = localFirst.count { it.attempts.any { attempt -> attempt.source == Source.CLOUD } }
    val finalized = exam.answers.filter { it.status == AnswerStatus.FINALIZED }
    val benchmark = evaluated.mapNotNull { answer ->
        val proposed = answer.proposed?.takeIf { it.warnings.isEmpty() }?.result?.marks
        val expected = answer.teacherBenchmark
        if (proposed != null && expected != null) sameMarks(proposed, expected) else null
    }
    val cloudGradeCosts = cloud.mapNotNull { cost(it, settings) }
    val allCloudCosts = (cloud + cloudRubrics).mapNotNull { cost(it, settings) }
    val deviceOnlyAnswers = attempted.count { answer ->
        answer.attempts.any { it.source == Source.DEVICE && it.result != null && it.warnings.isEmpty() } &&
            answer.attempts.none { it.route == Source.CLOUD }
    }
    return Statistics(
        students = evaluated.map { it.studentId }.distinct().size,
        questions = evaluated.map { it.questionId }.distinct().size,
        answers = evaluated.size,
        deviceResponses = deviceResponses,
        cloudResponses = cloud.size,
        rubricResponses = cloudRubrics.size,
        escalationRate = percent(escalated, localFirst.size),
        averageLatency = if (latency.isEmpty()) "Unavailable" else "${latency.average().toLong()} ms",
        failures = all.count { it.result == null && it.warnings.isNotEmpty() },
        overrides = percent(finalized.count { it.teacherOverride }, finalized.size),
        agreement = if (benchmark.isEmpty()) "Unavailable" else "${percent(benchmark.count { it }, benchmark.size)} · n=${benchmark.size}",
        apiCost = if (allCloudCosts.isEmpty()) "Usage unavailable" else money(allCloudCosts.sum()),
        avoidedCost = if (cloudGradeCosts.isEmpty()) "Usage baseline unavailable" else money(cloudGradeCosts.average() * deviceOnlyAnswers),
    )
}

private fun cost(attempt: Attempt, settings: Workspace): Double? {
    val input = attempt.promptTokens ?: return null
    val output = attempt.outputTokens ?: return null
    return (input * settings.priceInputPerMillion + output * settings.priceOutputPerMillion) / 1_000_000
}

private fun percent(count: Int, total: Int): String = if (total == 0) "Unavailable" else "${(count * 100.0 / total).toInt()}%"
private fun money(value: Double): String = String.format(Locale.US, "$%.5f", value)
