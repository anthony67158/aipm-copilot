import Foundation
import PDFKit
import Vision
import AppKit

if CommandLine.arguments.count < 2 {
  fputs("missing file path\n", stderr)
  exit(1)
}

let filePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: filePath)

guard let document = PDFDocument(url: fileURL) else {
  fputs("open pdf failed\n", stderr)
  exit(2)
}

var pageTexts: [String] = []
let scale: CGFloat = 2.0

for pageIndex in 0..<document.pageCount {
  guard let page = document.page(at: pageIndex) else { continue }
  let bounds = page.bounds(for: .mediaBox)
  let width = max(Int(bounds.width * scale), 1)
  let height = max(Int(bounds.height * scale), 1)

  guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    continue
  }

  NSGraphicsContext.saveGraphicsState()
  guard let graphicsContext = NSGraphicsContext(bitmapImageRep: bitmap) else {
    NSGraphicsContext.restoreGraphicsState()
    continue
  }

  NSGraphicsContext.current = graphicsContext
  let cgContext = graphicsContext.cgContext
  cgContext.setFillColor(NSColor.white.cgColor)
  cgContext.fill(CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
  cgContext.scaleBy(x: scale, y: scale)
  page.draw(with: .mediaBox, to: cgContext)
  graphicsContext.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()

  guard let image = bitmap.cgImage else { continue }
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  request.recognitionLanguages = ["zh-Hans", "en-US"]

  let handler = VNImageRequestHandler(cgImage: image, options: [:])
  do {
    try handler.perform([request])
    let text = (request.results ?? [])
      .compactMap { $0.topCandidates(1).first?.string }
      .joined(separator: "\n")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if !text.isEmpty {
      pageTexts.append(text)
    }
  } catch {
    continue
  }
}

let output = [
  "text": pageTexts.joined(separator: "\n\n"),
  "pageCount": String(document.pageCount)
]

let data = try JSONSerialization.data(withJSONObject: [
  "text": pageTexts.joined(separator: "\n\n"),
  "pageCount": document.pageCount
], options: [])
FileHandle.standardOutput.write(data)
