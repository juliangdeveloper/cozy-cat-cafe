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
            name: "CozyCatCafeCore"
        ),
        .target(
            name: "CozyCatCafe",
            dependencies: ["CozyCatCafeCore"],
            resources: [
                .copy("web"),
            ]
        ),
        .testTarget(
            name: "CozyCatCafeCoreTests",
            dependencies: ["CozyCatCafeCore"]
        ),
    ]
)
