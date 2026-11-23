#if canImport(UIKit)
import CozyCatCafeCore
import Foundation
import WebKit

@MainActor
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private static let okStatus = 200
    private static let partialStatus = 206
    private static let notFoundStatus = 404
    private static let unsatisfiableStatus = 416
    private static let httpVersion = "HTTP/1.1"

    private let root: URL? = Bundle.module.url(forResource: WebFiles.directory, withExtension: nil)

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        guard
            let root,
            let file = WebFiles.file(for: url, in: root),
            let data = try? Data(contentsOf: file)
        else {
            respond(task, url: url, status: Self.notFoundStatus, headers: ["Content-Type": "text/plain"], data: Data())
            return
        }
        var headers = [
            "Content-Type": WebFiles.mimeType(for: file),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        ]
        guard let header = task.request.value(forHTTPHeaderField: "Range") else {
            respond(task, url: url, status: Self.okStatus, headers: headers, data: data)
            return
        }
        guard let range = ByteRange.parse(header, length: data.count) else {
            headers["Content-Range"] = "bytes */\(data.count)"
            respond(task, url: url, status: Self.unsatisfiableStatus, headers: headers, data: Data())
            return
        }
        headers["Content-Range"] = range.contentRange(length: data.count)
        respond(task, url: url, status: Self.partialStatus, headers: headers, data: data.subdata(in: range.lower..<(range.upper + 1)))
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, headers: [String: String], data: Data) {
        var all = headers
        all["Content-Length"] = String(data.count)
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: Self.httpVersion, headerFields: all) else {
            task.didFailWithError(URLError(.badServerResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }
}
#endif
