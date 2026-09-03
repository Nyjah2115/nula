// Zamienia fotografię skroplin w komplet map do materiału puszki:
//   drops-normal.png   — mapa normalnych (z gradientu wysokości)
//   drops-rough.png    — chropowatość (woda gładka, lakier matowy)
//   drops-alpha.png    — gdzie w ogóle jest woda (przezroczystość warstwy)
//
// Wszystkie trzy powstają z JEDNEGO obrazu, więc kropla w relief, w połysku
// i w przezroczystości to ta sama kropla.
//
// Obraz jest domykany w poziomie: puszka to walec, więc lewa krawędź musi
// przechodzić w prawą. Zamiast lustra (widać oś symetrii) używam naturalnej
// kontynuacji kadru — źródło jest szersze niż wynik, a nadmiar wtapiam
// w początek.
//
// użycie: drops <wejście.png> <katalog wyjściowy>

import Foundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { print("drops <in.png> <outDir>"); exit(1) }
let outDir = args[2]

guard let src = NSImage(contentsOfFile: args[1]),
      let cg = src.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("nie mogę wczytać \(args[1])"); exit(1)
}

let W = 2048, H = 1024        // docelowy rozmiar map (jak tekstura etykiety)
let BAND = 320                // szerokość pasa wtopienia na szwie

// --- 1. skalowanie do wysokości H, z zapasem szerokości na szew ----------
let srcW = Double(cg.width), srcH = Double(cg.height)
let scaledW = Int((srcW * Double(H) / srcH).rounded())
guard scaledW >= W + BAND else {
    print("źródło za wąskie: \(scaledW) px, potrzeba \(W + BAND)"); exit(1)
}

var scaled = [UInt8](repeating: 0, count: scaledW * H * 4)
let cs = CGColorSpaceCreateDeviceRGB()
let sctx = CGContext(data: &scaled, width: scaledW, height: H, bitsPerComponent: 8,
                     bytesPerRow: scaledW * 4, space: cs,
                     bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
sctx.interpolationQuality = .high
sctx.draw(cg, in: CGRect(x: 0, y: 0, width: scaledW, height: H))
// wiersz 0 jest na GÓRZE obrazu — indeks (y*w + x)

@inline(__always) func lum(_ buf: [UInt8], _ i: Int) -> Double {
    (0.299 * Double(buf[i*4]) + 0.587 * Double(buf[i*4+1]) + 0.114 * Double(buf[i*4+2])) / 255.0
}

// --- 2. domknięcie w poziomie -------------------------------------------
// out[x] = src[x] dla x >= BAND; w pasie [0, BAND) wtapiamy src[W + x],
// czyli naturalny ciąg dalszy kadru za prawą krawędzią wyniku.
var L = [Double](repeating: 0, count: W * H)
for y in 0..<H {
    for x in 0..<W {
        let a = lum(scaled, y * scaledW + x)
        if x >= BAND {
            L[y * W + x] = a
        } else {
            let b = lum(scaled, y * scaledW + (W + x))
            let u = Double(x) / Double(BAND)
            L[y * W + x] = u * a + (1 - u) * b
        }
    }
}

// --- 3. rozmycie pudełkowe (dwie osie, zawijane w poziomie) --------------
func boxBlur(_ input: [Double], radius: Int) -> [Double] {
    var tmp = [Double](repeating: 0, count: W * H)
    var out = [Double](repeating: 0, count: W * H)
    let n = Double(radius * 2 + 1)
    for y in 0..<H {
        var sum = 0.0
        for k in -radius...radius { sum += input[y * W + ((k % W) + W) % W] }
        for x in 0..<W {
            tmp[y * W + x] = sum / n
            let out_ = input[y * W + ((x - radius) % W + W) % W]
            let in_  = input[y * W + ((x + radius + 1) % W + W) % W]
            sum += in_ - out_
        }
    }
    for x in 0..<W {
        var sum = 0.0
        for k in -radius...radius { sum += tmp[min(H-1, max(0, k)) * W + x] }
        for y in 0..<H {
            out[y * W + x] = sum / n
            let out_ = tmp[min(H-1, max(0, y - radius)) * W + x]
            let in_  = tmp[min(H-1, max(0, y + radius + 1)) * W + x]
            sum += in_ - out_
        }
    }
    return out
}

let low = boxBlur(L, radius: 26)

// wysokość względna: same krople, bez nierówności oświetlenia kadru
var hp = [Double](repeating: 0, count: W * H)
for i in 0..<W*H { hp[i] = L[i] - low[i] }

// maska kropli z lokalnego kontrastu, rozmyta żeby nie była poszarpana
var maskRaw = [Double](repeating: 0, count: W * H)
for i in 0..<W*H { maskRaw[i] = min(1.0, abs(hp[i]) * 7.0) }
let mask0 = boxBlur(maskRaw, radius: 3)

// --- 3b. kafelkowanie: krople w skali 1:1 są wielkości deszczu na szybie,
// a na puszce mają być drobne. Zmniejszam kadr TILES razy i układam go
// TILES x TILES, odbijając co drugi rząd w pionie — dzięki temu styki
// wewnątrz mapy są niewidoczne, a w poziomie kadr i tak był domknięty.
// Rzędów musi być PARZYSTA liczba: przy odbiciu co drugiego rzędu dolny
// brzeg mapy wraca wtedy do tej samej linii co górny, więc mapa zawija się
// też w pionie — a bez tego przewijanie kropel w dół pokazywałoby szew.
let TX = 3, TY = 4
let tw = W / TX, th = H / TY                // 682 x 256
let OW = tw * TX, OH = th * TY              // 2046 x 1024

func shrink(_ src: [Double]) -> [Double] {
    var t = [Double](repeating: 0, count: tw * th)
    for y in 0..<th { for x in 0..<tw {
        var sum = 0.0
        for dy in 0..<TY { for dx in 0..<TX {
            sum += src[(y * TY + dy) * W + (x * TX + dx)]
        }}
        t[y * tw + x] = sum / Double(TX * TY)
    }}
    return t
}
func tile(_ t: [Double]) -> [Double] {
    var o = [Double](repeating: 0, count: OW * OH)
    for Y in 0..<OH { for X in 0..<OW {
        let row = Y / th
        var ty = Y % th
        if row % 2 == 1 { ty = th - 1 - ty }        // co drugi rząd lustrzanie
        o[Y * OW + X] = t[ty * tw + (X % tw)]
    }}
    return o
}

let hpT   = tile(shrink(hp))
let maskT = tile(shrink(mask0))

// --- 4. zapis -------------------------------------------------------------
func write(_ name: String, _ fill: (Int, Int, Int) -> (Double, Double, Double)) {
    var buf = [UInt8](repeating: 255, count: OW * OH * 4)
    for y in 0..<OH { for x in 0..<OW {
        let i = y * OW + x
        let (r, g, b) = fill(x, y, i)
        buf[i*4]   = UInt8(max(0, min(255, r * 255)))
        buf[i*4+1] = UInt8(max(0, min(255, g * 255)))
        buf[i*4+2] = UInt8(max(0, min(255, b * 255)))
        buf[i*4+3] = 255
    }}
    let ctx = CGContext(data: &buf, width: OW, height: OH, bitsPerComponent: 8,
                        bytesPerRow: OW * 4, space: cs,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let img = ctx.makeImage()!
    let rep = NSBitmapImageRep(cgImage: img)
    let url = URL(fileURLWithPath: "\(outDir)/\(name).png")
    try! rep.representation(using: .png, properties: [:])!.write(to: url)
    print("zapisano \(url.lastPathComponent)")
}

// mapa normalnych — gradient wysokości, konwencja OpenGL (+Y w górę)
let NSCALE = 7.0
write("drops-normal") { x, y, _ in
    let xm = (x - 1 + OW) % OW, xp = (x + 1) % OW
    let ym = max(0, y - 1), yp = min(OH - 1, y + 1)
    let gx = (hpT[y * OW + xp] - hpT[y * OW + xm]) * NSCALE
    let gy = (hpT[yp * OW + x] - hpT[ym * OW + x]) * NSCALE
    var nx = -gx, ny = gy, nz = 1.0
    let len = (nx*nx + ny*ny + nz*nz).squareRoot()
    nx /= len; ny /= len; nz /= len
    return (nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5)
}

// chropowatość — woda gładka (0.08), lakier półmatowy (0.62)
write("drops-rough") { _, _, i in
    let r = 0.62 + (0.08 - 0.62) * maskT[i]
    return (r, r, r)
}

// przezroczystość warstwy wody — biało tam, gdzie jest kropla
write("drops-alpha") { _, _, i in
    let a = max(0.0, min(1.0, maskT[i] * 1.15))
    return (a, a, a)
}
