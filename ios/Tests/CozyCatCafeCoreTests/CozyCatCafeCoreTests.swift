import Foundation
import XCTest
@testable import CozyCatCafeCore

final class CozyCatCafeCoreTests: XCTestCase {
    func testFileResolution() {
        let root = URL(fileURLWithPath: "/bundle/web")
        XCTAssertEqual(WebFiles.entryURL.absoluteString, "app://localhost/index.html")
        XCTAssertEqual(WebFiles.file(for: URL(string: "app://localhost/")!, in: root)?.path, "/bundle/web/index.html")
        XCTAssertEqual(
            WebFiles.file(for: URL(string: "app://localhost/assets/pixel/manifest.json?v=1")!, in: root)?.path,
            "/bundle/web/assets/pixel/manifest.json"
        )
        XCTAssertNil(WebFiles.file(for: URL(string: "app://localhost/../secret")!, in: root))
        XCTAssertNil(WebFiles.file(for: URL(string: "app://localhost/a/%2E%2E/%2E%2E/x")!, in: root))
        XCTAssertNil(WebFiles.file(for: URL(string: "https://localhost/index.html")!, in: root))
        XCTAssertNil(WebFiles.file(for: URL(string: "app://other/index.html")!, in: root))
    }

    func testMimeTypes() {
        XCTAssertEqual(WebFiles.mimeType(for: URL(fileURLWithPath: "/w/js/game.js")), "text/javascript; charset=utf-8")
        XCTAssertEqual(WebFiles.mimeType(for: URL(fileURLWithPath: "/w/assets/sprites.JSON")), "application/json; charset=utf-8")
        XCTAssertEqual(WebFiles.mimeType(for: URL(fileURLWithPath: "/w/assets/audio/gm.mp3")), "audio/mpeg")
        XCTAssertEqual(WebFiles.mimeType(for: URL(fileURLWithPath: "/w/clips/tips.mp4")), "video/mp4")
        XCTAssertEqual(WebFiles.mimeType(for: URL(fileURLWithPath: "/w/clips/tips.webm")), "video/webm")
        XCTAssertEqual(WebFiles.mimeType(for: URL(fileURLWithPath: "/w/blob.bin")), "application/octet-stream")
    }

    func testByteRanges() {
        XCTAssertEqual(ByteRange.parse("bytes=0-1", length: 10), ByteRange(lower: 0, upper: 1))
        XCTAssertEqual(ByteRange.parse("bytes=4-", length: 10), ByteRange(lower: 4, upper: 9))
        XCTAssertEqual(ByteRange.parse("bytes=-3", length: 10), ByteRange(lower: 7, upper: 9))
        XCTAssertEqual(ByteRange.parse("bytes=2-99", length: 10), ByteRange(lower: 2, upper: 9))
        XCTAssertNil(ByteRange.parse("bytes=10-", length: 10))
        XCTAssertNil(ByteRange.parse("bytes=5-2", length: 10))
        XCTAssertNil(ByteRange.parse("bytes=0-1,4-5", length: 10))
        XCTAssertNil(ByteRange.parse("items=0-1", length: 10))
        XCTAssertEqual(ByteRange(lower: 0, upper: 1).contentRange(length: 10), "bytes 0-1/10")
    }
}
