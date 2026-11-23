import FirebaseAppCheck
import FirebaseCore
import SwiftUI

@main
struct GradeWiseApp: App {
    @StateObject private var workspace = WorkspaceStore()
    #if DEBUG
    @State private var ranLiveSmoke = false
    #endif

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
                #if DEBUG
                .task {
                    guard !ranLiveSmoke else { return }
                    ranLiveSmoke = true
                    await FirebaseLiveSmoke.runIfRequested()
                }
                #endif
        }
    }
}
