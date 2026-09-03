// Wycina obiekty (puszka, owoce, bąbelki) z gładkiego tła gradientowego.
// Zalewanie od krawędzi kadru z lokalną tolerancją — gradient nie przeszkadza,
// bo porównujemy piksel z sąsiadem, z którego przyszliśmy, a nie z jednym kolorem.
import Foundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { print("cutout <in.png> <out.png> [tol] [feather]"); exit(1) }
let tol = args.count > 3 ? Int(args[3])! : 26
let feather = args.count > 4 ? Int(args[4])! : 2

guard let src = NSImage(contentsOfFile: args[1]),
      let cg = src.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("brak pliku"); exit(1) }
let w = cg.width, h = cg.height
var buf = [UInt8](repeating: 0, count: w*h*4)
let cs = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w*4,
                    space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
// wiersz 0 jest na GÓRZE obrazu — indeks (y*w+x)*4

@inline(__always) func px(_ i: Int) -> (Int, Int, Int) {
    (Int(buf[i*4]), Int(buf[i*4+1]), Int(buf[i*4+2]))
}
var isBg = [Bool](repeating: false, count: w*h)
var stack = [Int]()
for x in 0..<w { stack.append(x); stack.append((h-1)*w + x) }
for y in 0..<h { stack.append(y*w); stack.append(y*w + w-1) }
for i in stack { isBg[i] = true }

while let i = stack.popLast() {
    let (r, g, b) = px(i)
    let x = i % w, y = i / w
    for (dx, dy) in [(1,0),(-1,0),(0,1),(0,-1)] {
        let nx = x+dx, ny = y+dy
        if nx < 0 || ny < 0 || nx >= w || ny >= h { continue }
        let j = ny*w + nx
        if isBg[j] { continue }
        let (r2, g2, b2) = px(j)
        if abs(r-r2) + abs(g-g2) + abs(b-b2) <= tol { isBg[j] = true; stack.append(j) }
    }
}

// alfa: 0 dla tła, 255 dla treści; potem miękka krawędź uśrednianiem w promieniu `feather`
var alpha = [Float](repeating: 0, count: w*h)
for i in 0..<w*h { alpha[i] = isBg[i] ? 0 : 1 }
if feather > 0 {
    var tmp = alpha
    for _ in 0..<feather {
        for y in 0..<h { for x in 0..<w {
            var s: Float = 0; var n: Float = 0
            for dy in -1...1 { for dx in -1...1 {
                let nx = x+dx, ny = y+dy
                if nx < 0 || ny < 0 || nx >= w || ny >= h { continue }
                s += alpha[ny*w+nx]; n += 1
            }}
            tmp[y*w+x] = s/n
        }}
        alpha = tmp
    }
    // lekka erozja, żeby nie zostawić poświaty tła na brzegu
    for i in 0..<w*h { alpha[i] = max(0, min(1, (alpha[i] - 0.22) / 0.78)) }
}

var out = [UInt8](repeating: 0, count: w*h*4)
var kept = 0
for i in 0..<w*h {
    let a = alpha[i]
    if a > 0.004 { kept += 1 } 
    let aa = a < 0.004 ? Float(0) : a          // zerujemy śladową alfę
    out[i*4]   = UInt8(Float(buf[i*4])   * aa)
    out[i*4+1] = UInt8(Float(buf[i*4+1]) * aa)
    out[i*4+2] = UInt8(Float(buf[i*4+2]) * aa)
    out[i*4+3] = UInt8(aa * 255)
}
let octx = CGContext(data: &out, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w*4,
                     space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
let img = octx.makeImage()!
let rep = NSBitmapImageRep(cgImage: img)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("zachowane piksele: \(kept*100/(w*h))% z \(w)x\(h)")
