package app.gradewise.android

import com.google.firebase.appcheck.AppCheckProviderFactory
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

internal fun appCheckProvider(): AppCheckProviderFactory = PlayIntegrityAppCheckProviderFactory.getInstance()
