#if canImport(UIKit)
import SwiftUI

@main
struct CozyCatCafeApp: App {
    var body: some Scene {
        WindowGroup {
            WebContainer()
                .ignoresSafeArea()
                .statusBarHidden()
        }
    }
}
#endif
