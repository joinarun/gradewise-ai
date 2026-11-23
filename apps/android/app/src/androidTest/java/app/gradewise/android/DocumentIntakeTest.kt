package app.gradewise.android

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream

@RunWith(AndroidJUnit4::class)
class DocumentIntakeTest {
    @Test
    fun readsPrintedTextFromPngAndImageOnlyPdf() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intake = DocumentIntake(context)
        val bitmap = Bitmap.createBitmap(1000, 280, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 68f
        }
        canvas.drawColor(Color.WHITE)
        canvas.drawText("Roots absorb water", 45f, 145f, paint)

        val imageBytes = ByteArrayOutputStream().use { output ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
            output.toByteArray()
        }
        assertTrue(intake.readImage(imageBytes).contains("Roots absorb water", ignoreCase = true))

        val pdfBytes = ByteArrayOutputStream().use { output ->
            val document = PdfDocument()
            try {
                val page = document.startPage(PdfDocument.PageInfo.Builder(bitmap.width, bitmap.height, 1).create())
                page.canvas.drawBitmap(bitmap, 0f, 0f, null)
                document.finishPage(page)
                document.writeTo(output)
            } finally {
                document.close()
            }
            output.toByteArray()
        }
        val scanned = intake.readPdf("Synthetic scan", pdfBytes)
        assertTrue(scanned.usedOcr)
        assertTrue(scanned.text.contains("Roots absorb water", ignoreCase = true))
    }
}
