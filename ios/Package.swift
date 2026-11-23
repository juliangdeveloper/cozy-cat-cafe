// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "CozyCatCafe",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "CozyCatCafe",
            targets: ["CozyCatCafe"]
        ),
    ],
    targets: [
        .target(
            name: "CozyCatCafe",
            resources: [
                .copy("web"),
            ]
        ),
    ]
)
