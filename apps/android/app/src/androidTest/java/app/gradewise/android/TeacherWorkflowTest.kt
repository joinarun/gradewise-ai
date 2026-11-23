package app.gradewise.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TeacherWorkflowTest {
    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun opensSyntheticExamFinalizesAndShowsResults() {
        val sample = "Open synthetic example"
        compose.waitUntil(10_000) { compose.onAllNodesWithText(sample).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(sample).performScrollTo().performClick()

        val review = "Review answer"
        compose.waitUntil(10_000) { compose.onAllNodesWithText(review).fetchSemanticsNodes().size >= 4 }
        compose.onAllNodesWithText(review).onFirst().performScrollTo().performClick()
        compose.onNodeWithText("Teacher marks (maximum 2)").performScrollTo().performTextInput("2")
        compose.onNodeWithText("Finalize teacher score").performScrollTo().performClick()

        compose.waitUntil(10_000) { compose.onAllNodesWithText("Grade finalized.").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Exams").performClick()
        compose.onAllNodesWithText("Open examination").onFirst().performScrollTo().performClick()
        compose.onNodeWithText("Results").performScrollTo().performClick()
        compose.onNodeWithText("1 finalized answer across 1 student").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Export finalized CSV").performScrollTo().assertIsDisplayed()
    }
}
