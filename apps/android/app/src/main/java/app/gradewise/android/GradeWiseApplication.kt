package app.gradewise.android

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader

class GradeWiseApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        PDFBoxResourceLoader.init(this)
        if (FirebaseApp.initializeApp(this) != null) {
            FirebaseAppCheck.getInstance().installAppCheckProviderFactory(appCheckProvider())
        }
    }
}
