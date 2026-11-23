import Foundation

public struct ByteRange: Equatable, Sendable {
    public let lower: Int
    public let upper: Int

    public init(lower: Int, upper: Int) {
        self.lower = lower
        self.upper = upper
    }

    public static func parse(_ header: String, length: Int) -> ByteRange? {
        let prefix = "bytes="
        let value = header.trimmingCharacters(in: .whitespaces)
        guard length > 0, value.hasPrefix(prefix) else { return nil }
        let spec = value.dropFirst(prefix.count)
        guard !spec.contains(","), let dash = spec.firstIndex(of: "-") else { return nil }
        let start = spec[spec.startIndex..<dash].trimmingCharacters(in: .whitespaces)
        let end = spec[spec.index(after: dash)...].trimmingCharacters(in: .whitespaces)
        if start.isEmpty {
            guard let suffix = Int(end), suffix > 0 else { return nil }
            return ByteRange(lower: max(0, length - suffix), upper: length - 1)
        }
        guard let lower = Int(start), lower >= 0, lower < length else { return nil }
        if end.isEmpty { return ByteRange(lower: lower, upper: length - 1) }
        guard let upper = Int(end), upper >= lower else { return nil }
        return ByteRange(lower: lower, upper: min(upper, length - 1))
    }

    public func contentRange(length: Int) -> String {
        "bytes \(lower)-\(upper)/\(length)"
    }
}
