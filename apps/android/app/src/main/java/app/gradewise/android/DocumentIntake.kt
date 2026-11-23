package app.gradewise.android

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.media.ExifInterface
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import kotlinx.coroutines.tasks.await
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import kotlin.math.max
import kotlin.math.roundToInt

data class ImportedText(val name: String, val text: String, val usedOcr: Boolean = false)

internal class DocumentIntake(private val context: Context) {
    suspend fun read(uri: Uri): ImportedText {
        val resolver = context.contentResolver
        val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        } ?: "Student paper"
        val mime = resolver.getType(uri)
        val extension = name.substringAfterLast('.', "").lowercase()
        val bytes = requireNotNull(resolver.openInputStream(uri)) { "The selected file is unavailable." }.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val read = input.read(buffer)
                if (read == -1) break
                require(output.size() + read <= 10 * 1024 * 1024) { "Files are limited to 10 MB each." }
                output.write(buffer, 0, read)
            }
            output.toByteArray()
        }
        val label = name.substringBeforeLast('.')
        val extraction = when {
            mime == "application/pdf" || extension == "pdf" -> readPdf(label, bytes)
            mime in setOf("image/jpeg", "image/png") || extension in setOf("jpg", "jpeg", "png") ->
                ImportedText(label, readImage(bytes), usedOcr = true)
            mime == "text/plain" || extension == "txt" -> ImportedText(label, decodeText(bytes))
            else -> throw IllegalArgumentException("Import PDF, UTF-8 TXT, JPEG or PNG.")
        }
        val text = extraction.text.trim().removePrefix("\uFEFF")
        require(text.isNotBlank()) { "$name has no readable text. Transcribe it and verify the transcription before continuing." }
        return extraction.copy(text = text)
    }

    internal suspend fun readPdf(label: String, bytes: ByteArray): ImportedText {
        val selectable = PDDocument.load(bytes).use { document ->
            require(document.numberOfPages <= 100) { "Import a PDF with at most 100 pages." }
            PDFTextStripper().getText(document)
        }
        if (selectable.isNotBlank()) return ImportedText(label, selectable)

        val temporaryPdf = File.createTempFile("grade-source", ".pdf", context.cacheDir)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
            temporaryPdf.writeBytes(bytes)
            val descriptor = ParcelFileDescriptor.open(temporaryPdf, ParcelFileDescriptor.MODE_READ_ONLY)
            PdfRenderer(descriptor).use { renderer ->
                require(renderer.pageCount <= 20) { "Split image-only PDFs into sets of at most 20 pages before import." }
                val pages = mutableListOf<String>()
                for (index in 0 until renderer.pageCount) {
                    renderer.openPage(index).use { page ->
                        val scale = 1900.0 / max(page.width, page.height)
                        val bitmap = Bitmap.createBitmap(
                            (page.width * scale).roundToInt().coerceAtLeast(1),
                            (page.height * scale).roundToInt().coerceAtLeast(1),
                            Bitmap.Config.ARGB_8888,
                        )
                        bitmap.eraseColor(Color.WHITE)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        pages += recognizer.process(InputImage.fromBitmap(bitmap, 0)).await().text
                    }
                }
                return ImportedText(label, pages.joinToString("\n\n"), usedOcr = true)
            }
        } finally {
            recognizer.close()
            temporaryPdf.delete()
        }
    }

    internal suspend fun readImage(bytes: ByteArray): String {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        require(options.outWidth > 0 && options.outHeight > 0) { "The image could not be opened." }
        var sampling = 1
        val largestDimension = max(options.outWidth, options.outHeight)
        while (largestDimension / sampling > 2_400) sampling *= 2
        options.inJustDecodeBounds = false
        options.inSampleSize = sampling
        val bitmap = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)) { "The image could not be opened." }
        val orientation = runCatching {
            ExifInterface(bytes.inputStream()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val rotation = when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90, ExifInterface.ORIENTATION_TRANSPOSE -> 90
            ExifInterface.ORIENTATION_ROTATE_180 -> 180
            ExifInterface.ORIENTATION_ROTATE_270, ExifInterface.ORIENTATION_TRANSVERSE -> 270
            else -> 0
        }
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        return try {
            recognizer.process(InputImage.fromBitmap(bitmap, rotation)).await().text
        } finally {
            recognizer.close()
        }
    }

    private fun decodeText(bytes: ByteArray): String = try {
        Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
    } catch (_: java.nio.charset.CharacterCodingException) {
        throw IllegalArgumentException("Save the text file as UTF-8 and import it again.")
    }
}
