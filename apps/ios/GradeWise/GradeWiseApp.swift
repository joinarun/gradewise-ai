import FirebaseAppCheck
import FirebaseCore
import SwiftUI

@main
struct GradeWiseApp: App {
    @StateObject private var workspace = WorkspaceStore()

    init() {
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: path) {
            #if DEBUG
            AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
            #else
            AppCheck.setAppCheckProviderFactory(AppAttestProviderFactory())
            #endif
            FirebaseApp.configure(options: options)
        }
    }

    var body: some Scene {
        WindowGroup {
            WorkspaceView(store: workspace)
        }
    }
}
