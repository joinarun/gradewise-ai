import XCTest

final class GradeWiseUITests: XCTestCase {
    func testSampleRubricApprovalAndTeacherResultSurviveRelaunch() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchEnvironment["GRADEWISE_UI_TEST_STORE"] = UUID().uuidString
        app.launch()

        app.buttons["open-sample"].tap()
        XCTAssertTrue(app.navigationBars["Roots and Water"].waitForExistence(timeout: 8))
        app.buttons["review-rubric"].tap()
        let approve = app.buttons["approve-rubric"]
        scroll(to: approve, in: app)
        approve.tap()
        let rubric = app.staticTexts["rubric-status"]
        XCTAssertTrue(rubric.waitForExistence(timeout: 5))

        let answer = app.buttons["answer-Sample 01"]
        scroll(to: answer, in: app)
        answer.tap()
        XCTAssertTrue(app.navigationBars["Sample 01"].waitForExistence(timeout: 5))
        let marks = app.textFields["override-marks"]
        scroll(to: marks, in: app)
        marks.tap()
        marks.typeText("1")
        let done = app.buttons["Done"]
        if done.isHittable { done.tap() }
        let save = app.buttons["save-teacher-marks"]
        scroll(to: save, in: app)
        save.tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Teacher override")).firstMatch.exists)

        app.terminate()
        app.launch()
        app.buttons["open-sample"].tap()
        let classResults = app.buttons["class-results"]
        scroll(to: classResults, in: app)
        classResults.tap()
        XCTAssertTrue(app.buttons["export-results"].isEnabled)
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Sample 01")).firstMatch.exists)
    }

    private func scroll(to element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<14 where !element.isHittable { app.swipeUp() }
        XCTAssertTrue(element.isHittable)
    }
}
