// Wycina z wyciętego renderu samą puszkę, bez owoców dookoła.
//
// Miniatury do kafelków były kwadratowym kadrem ze środka obrazu, przez co
// ucinały puszce górę i dół. Tutaj szukam największej spójnej wyspy pikseli
// nieprzezroczystych — owoce są osobnymi, mniejszymi wyspami, więc największa
// z nich to zawsze puszka — i przycinam do jej prostokąta z marginesem.
//
// użycie: canthumb <wejście.png> <wyjście.png> [wysokość wyniku]

import Foundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { print("canthumb <in.png> <out.png> [h]"); exit(1) }
let outH = args.count > 3 ? Int(args[3])! : 720

guard let img = NSImage(contentsOfFile: args[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("nie mogę wczytać \(args[1])"); exit(1)
}

let w = cg.width, h = cg.height
var buf = [UInt8](repeating: 0, count: w * h * 4)
let cs = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8,
                    bytesPerRow: w * 4, space: cs,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
// wiersz 0 na GÓRZE obrazu — indeks (y*w + x)

let SOLID: UInt8 = 40                      // próg, od którego uznaję piksel za treść
var seen = [Bool](repeating: false, count: w * h)
var best = (count: 0, x0: 0, y0: 0, x1: 0, y1: 0)

var stack = [Int]()
for start in 0..<(w * h) {
    if seen[start] || buf[start * 4 + 3] < SOLID { continue }
    stack.removeAll(keepingCapacity: true)
    stack.append(start)
    seen[start] = true

    var count = 0
    var x0 = w, y0 = h, x1 = 0, y1 = 0

    while let i = stack.popLast() {
        let x = i % w, y = i / w
        count += 1
        if x < x0 { x0 = x }; if x > x1 { x1 = x }
        if y < y0 { y0 = y }; if y > y1 { y1 = y }

        for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
            let nx = x + dx, ny = y + dy
            if nx < 0 || ny < 0 || nx >= w || ny >= h { continue }
            let j = ny * w + nx
            if seen[j] || buf[j * 4 + 3] < SOLID { continue }
            seen[j] = true
            stack.append(j)
        }
    }
    if count > best.count { best = (count, x0, y0, x1, y1) }
}

guard best.count > 0 else { print("nic nie znalazłem"); exit(1) }

// margines, żeby puszka nie kleiła się do krawędzi kafelka
let padX = (best.x1 - best.x0) / 12
let padY = (best.y1 - best.y0) / 22
let cx0 = max(0, best.x0 - padX), cy0 = max(0, best.y0 - padY)
let cx1 = min(w - 1, best.x1 + padX), cy1 = min(h - 1, best.y1 + padY)
let cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1

let crop = cg.cropping(to: CGRect(x: cx0, y: cy0, width: cw, height: ch))!
let outW = Int((Double(cw) / Double(ch) * Double(outH)).rounded())

var out = [UInt8](repeating: 0, count: outW * outH * 4)
let octx = CGContext(data: &out, width: outW, height: outH, bitsPerComponent: 8,
                     bytesPerRow: outW * 4, space: cs,
                     bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
octx.interpolationQuality = .high
octx.draw(crop, in: CGRect(x: 0, y: 0, width: outW, height: outH))

let rep = NSBitmapImageRep(cgImage: octx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!
    .write(to: URL(fileURLWithPath: args[2]))

let pct = best.count * 100 / (w * h)
print("puszka: \(cw)x\(ch) px (wyspa \(pct)% kadru) -> \(outW)x\(outH)")
