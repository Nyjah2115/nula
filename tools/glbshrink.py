#!/usr/bin/env python3
"""Zmniejsza tekstury w pliku GLB.

Modele z generatora przychodzą z teksturami 2K-4K. Owoc ma na ekranie
kilkadziesiąt pikseli, więc to czysty balast — w limonce geometria ważyła
420 kB, a trzy tekstury 1,5 MB.

Skrypt przepisuje cały bufor binarny od nowa: wycina każdy bufferView,
podmienia te, które są obrazami, na przeskalowane (przez `sips`), i składa
bufor z powrotem z wyrównaniem do 4 bajtów. Accessory adresują dane przez
indeks bufferView, a nie przez surowy offset, więc geometria pozostaje ważna.

użycie: glbshrink.py <plik.glb> [rozmiar]
"""
import json
import os
import struct
import subprocess
import sys
import tempfile

MAGIC = b"glTF"
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path):
    raw = open(path, "rb").read()
    if raw[:4] != MAGIC:
        sys.exit(f"{path}: to nie jest GLB")
    off, chunks = 12, {}
    while off < len(raw):
        length, ctype = struct.unpack_from("<II", raw, off)
        off += 8
        chunks[ctype] = raw[off:off + length]
        off += length
    return json.loads(chunks[JSON_CHUNK].decode("utf-8")), chunks[BIN_CHUNK]


def resize_jpeg(data, mime, size):
    ext = ".png" if "png" in mime else ".jpg"
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "in" + ext)
        dst = os.path.join(tmp, "out.jpg")
        open(src, "wb").write(data)
        subprocess.run(
            ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82",
             "-Z", str(size), src, "--out", dst],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return open(dst, "rb").read()


def shrink(path, size=512):
    doc, binary = read_glb(path)
    before = os.path.getsize(path)

    image_bv = {}
    for img in doc.get("images", []):
        if "bufferView" in img:
            image_bv[img["bufferView"]] = img.get("mimeType", "image/jpeg")

    pieces = []
    for i, bv in enumerate(doc["bufferViews"]):
        start = bv.get("byteOffset", 0)
        data = binary[start:start + bv["byteLength"]]
        if i in image_bv:
            data = resize_jpeg(data, image_bv[i], size)
        pieces.append(data)

    out = bytearray()
    for i, data in enumerate(pieces):
        while len(out) % 4:
            out.append(0)
        doc["bufferViews"][i]["byteOffset"] = len(out)
        doc["bufferViews"][i]["byteLength"] = len(data)
        out += data
    while len(out) % 4:
        out.append(0)

    for img in doc.get("images", []):
        if img.get("bufferView") in image_bv:
            img["mimeType"] = "image/jpeg"
    doc["buffers"][0]["byteLength"] = len(out)

    js = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    js += b" " * (-len(js) % 4)

    total = 12 + 8 + len(js) + 8 + len(out)
    with open(path, "wb") as f:
        f.write(MAGIC + struct.pack("<II", 2, total))
        f.write(struct.pack("<II", len(js), JSON_CHUNK) + js)
        f.write(struct.pack("<II", len(out), BIN_CHUNK) + bytes(out))

    print(f"{os.path.basename(path)}: {before//1024} kB -> {total//1024} kB")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    px = int(sys.argv[2]) if len(sys.argv) > 2 else 512
    shrink(sys.argv[1], px)
