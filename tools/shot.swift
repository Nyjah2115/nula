// Zrzut strony bez panelu przeglądarki: WKWebView w oknie poza ekranem.
// użycie: shot <url> <out.png> [szerokość] [wysokość] [scrollY] [sekundy]
import Cocoa
import WebKit

let a = CommandLine.arguments
guard a.count >= 3 else { print("shot <url> <out.png> [w] [h] [scrollY] [wait]"); exit(1) }
let url = URL(string: a[1])!
let out = a[2]
let W = a.count > 3 ? Double(a[3])! : 1440
let H = a.count > 4 ? Double(a[4])! : 900
let scrollY = a.count > 5 ? Double(a[5])! : 0
let wait = a.count > 6 ? Double(a[6])! : 3.5

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let rect = NSRect(x: 0, y: 0, width: W, height: H)
let win = NSWindow(contentRect: rect, styleMask: [.borderless], backing: .buffered, defer: false)
win.setFrameOrigin(NSPoint(x: -4000, y: -4000))   // poza widocznym ekranem
let web = WKWebView(frame: rect)
win.contentView = web
win.orderFront(nil)

class Nav: NSObject, WKNavigationDelegate {
    var done = false
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { done = true }
}
let nav = Nav()
web.navigationDelegate = nav
web.load(URLRequest(url: url))

let deadline = Date().addingTimeInterval(20)
while !nav.done && Date() < deadline {
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
}
// czekamy na czcionki, obrazy i wejścia sekcji
let until = Date().addingTimeInterval(wait)
while Date() < until { RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05)) }

if scrollY > 0 {
    web.evaluateJavaScript("document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,\(scrollY));")
    let u2 = Date().addingTimeInterval(2.2)
    while Date() < u2 { RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05)) }
}

var finished = false
let cfg = WKSnapshotConfiguration()
cfg.rect = CGRect(x: 0, y: 0, width: W, height: H)
web.takeSnapshot(with: cfg) { img, err in
    if let img = img, let tiff = img.tiffRepresentation,
       let rep = NSBitmapImageRep(data: tiff),
       let png = rep.representation(using: .png, properties: [:]) {
        try? png.write(to: URL(fileURLWithPath: out))
        print("zapisano \(out)")
    } else { print("błąd zrzutu: \(String(describing: err))") }
    finished = true
}
let u3 = Date().addingTimeInterval(15)
while !finished && Date() < u3 { RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05)) }
