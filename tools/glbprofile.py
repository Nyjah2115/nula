#!/usr/bin/env python3
"""Wyciąga profil promienia z modelu GLB obrotowego (puszka, butelka).

Bryła z generatora ma dobre proporcje, ale faluje — korpus nie jest idealnym
walcem. Ten skrypt liczy dla każdej wysokości promień w wielu kierunkach
i bierze wysoki percentyl, przez co wgniecenia i guzy się uśredniają,
a zostaje sam kształt sylwetki.

Wynik to lista punktów [promień, wysokość] gotowa do LatheGeometry —
czyli bryła obrotowa idealnie symetryczna z definicji, ale o proporcjach
zdjętych z modelu.

użycie: glbprofile.py <plik.glb> [liczba_poziomów]
"""
import json
import struct
import sys

MAGIC = b"glTF"
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942

COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
             5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


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


def read_accessor(doc, binary, index):
    acc = doc["accessors"][index]
    bv = doc["bufferViews"][acc["bufferView"]]
    fmt, size = COMPONENT[acc["componentType"]]
    n = COUNTS[acc["type"]]
    stride = bv.get("byteStride") or size * n
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    out = []
    for i in range(acc["count"]):
        out.append(struct.unpack_from("<" + fmt * n, binary, base + i * stride))
    return out


def profile(path, levels=90, pct=0.93):
    doc, binary = read_glb(path)
    pts = []
    for mesh in doc["meshes"]:
        for prim in mesh["primitives"]:
            if "POSITION" in prim["attributes"]:
                pts += read_accessor(doc, binary, prim["attributes"]["POSITION"])
    if not pts:
        sys.exit("brak wierzchołków")

    ys = [p[1] for p in pts]
    lo, hi = min(ys), max(ys)
    span = hi - lo or 1.0

    bins = [[] for _ in range(levels)]
    for x, y, z in pts:
        k = min(levels - 1, int((y - lo) / span * levels))
        bins[k].append((x * x + z * z) ** .5)

    rows = []
    for k, vals in enumerate(bins):
        if not vals:
            continue
        vals.sort()
        r = vals[min(len(vals) - 1, int(len(vals) * pct))]
        y = (k + .5) / levels                      # 0 = dno, 1 = wieczko
        rows.append((y, r))

    rmax = max(r for _, r in rows) or 1.0
    print(f"wysokość {span:.4f}, największy promień {rmax:.4f}, "
          f"smukłość H/D = {span / (2 * rmax):.2f}\n")
    print("  y      r/rmax")
    for y, r in rows:
        print(f"  {y:.3f}  {r / rmax:.4f}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    profile(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 90)
