#!/usr/bin/env python3
"""
convert_city.py — buat file data/cities/<kota>.js dari GeoJSON batas kecamatan
(dan opsional titik puskesmas), lengkap dengan simulasi 8 jenis penyakit
(dbd, ispa, diare, chikv, malaria, tbc, campak, pneumonia) berbasis populasi.

Tidak butuh dependency selain Python 3 standar (json, hashlib, argparse).
Kalau file kamu masih .shp, export dulu ke GeoJSON lewat QGIS
(klik kanan layer > Export > Save Features As > format GeoJSON).

Contoh:
    python3 tools/convert_city.py \
        --city surabaya --label "Kota Surabaya" --province "Jawa Timur" \
        --kecamatan kecamatan_surabaya.geojson \
        --name-field NAMOBJ --pop-field JUMLAH_PDDK \
        --puskesmas puskesmas_surabaya.geojson --puskesmas-name-field NAMA \
        --center-lat -7.2575 --center-lng 112.7521 --zoom 12 \
        --out data/cities/surabaya.js
"""
import argparse
import hashlib
import json
import sys

# Harus konsisten dengan data/diseases.js (rateRange dipakai untuk simulasi;
# breaks/warna TIDAK dihitung ulang di sini karena sudah global di diseases.js)
DISEASE_RATE_RANGES = {
    "dbd": (2.0, 12.0),
    "ispa": (12.0, 34.0),
    "diare": (6.0, 20.0),
    "chikv": (0.4, 3.2),
    "malaria": (0.05, 1.4),
    "tbc": (0.6, 3.8),
    "campak": (0.05, 0.75),
    "pneumonia": (4.0, 24.0),
}


def seeded_rand(key, salt):
    h = hashlib.sha256(f"{key}|{salt}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def simulate_diseases(name, pop, max_pop):
    out = {}
    pop_norm = min(pop / max_pop, 1.0) if max_pop else 0.0
    for dkey, (lo, hi) in DISEASE_RATE_RANGES.items():
        r1 = seeded_rand(name, dkey + "_a")
        r2 = seeded_rand(name, dkey + "_b")
        mix = 0.55 * r1 + 0.45 * (0.3 * r2 + 0.7 * pop_norm)
        ir = round(lo + mix * (hi - lo), 2)
        kasus = round(ir / 1000 * pop)
        out[dkey] = {"kasus": kasus, "ir": ir}
    return out


def load_geojson(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_kecamatan(path, name_field, pop_field):
    gj = load_geojson(path)
    feats = gj.get("features", [])
    pops = []
    for f in feats:
        p = f["properties"]
        pop = p.get(pop_field)
        if pop is None:
            print(f"PERINGATAN: fitur tanpa field populasi '{pop_field}': {p}", file=sys.stderr)
            pop = 0
        pops.append(float(pop))
    max_pop = max(pops) if pops else 1
    for f, pop in zip(feats, pops):
        p = f["properties"]
        name = str(p.get(name_field, "TANPA NAMA")).upper()
        p["KECAMATAN"] = name
        p["jmlh_pddk"] = int(pop)
        p["diseases"] = simulate_diseases(name, pop, max_pop)
    return {"type": "FeatureCollection", "name": "kecamatan", "features": feats}


def build_puskesmas(path, name_field):
    if not path:
        return {"type": "FeatureCollection", "name": "puskesmas", "features": []}
    gj = load_geojson(path)
    feats = gj.get("features", [])
    for f in feats:
        p = f["properties"]
        if name_field in p:
            p["Nama Puske"] = p[name_field]
        geom = f.get("geometry", {})
        # Pastikan Point (bukan MultiPoint / lainnya)
        if geom.get("type") != "Point":
            print(f"PERINGATAN: geometry bukan Point, dilewati: {geom.get('type')}", file=sys.stderr)
    feats = [f for f in feats if f.get("geometry", {}).get("type") == "Point"]
    return {"type": "FeatureCollection", "name": "puskesmas", "features": feats}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--city", required=True, help="key kota, mis. surabaya")
    ap.add_argument("--label", required=True, help='label tampilan, mis. "Kota Surabaya"')
    ap.add_argument("--province", default="")
    ap.add_argument("--kecamatan", required=True, help="path GeoJSON batas kecamatan")
    ap.add_argument("--name-field", required=True, help="nama field nama kecamatan di GeoJSON")
    ap.add_argument("--pop-field", required=True, help="nama field jumlah penduduk di GeoJSON")
    ap.add_argument("--puskesmas", default=None, help="path GeoJSON titik puskesmas (opsional)")
    ap.add_argument("--puskesmas-name-field", default="nama", help="nama field nama puskesmas")
    ap.add_argument("--center-lat", type=float, required=True)
    ap.add_argument("--center-lng", type=float, required=True)
    ap.add_argument("--zoom", type=int, default=12)
    ap.add_argument("--out", default=None, help="path output .js (default: data/cities/<city>.js)")
    args = ap.parse_args()

    kec_fc = build_kecamatan(args.kecamatan, args.name_field, args.pop_field)
    pkm_fc = build_puskesmas(args.puskesmas, args.puskesmas_name_field)

    city_obj = {
        "label": args.label,
        "province": args.province,
        "available": True,
        "center": [args.center_lat, args.center_lng],
        "zoom": args.zoom,
        "kecamatanLabel": "Kecamatan",
        "kecamatan": kec_fc,
        "puskesmas": pkm_fc,
        "cases": {},
    }

    out_path = args.out or f"data/cities/{args.city}.js"
    header = (
        "/* Dihasilkan otomatis oleh tools/convert_city.py.\n"
        "   Statistik penyakit di bawah adalah SIMULASI berbasis populasi —\n"
        "   ganti kasus/ir per kecamatan dengan data dinas kesehatan riil bila ada. */\n"
    )
    content = header + "window.CITY_DATA = window.CITY_DATA || {};\n" \
        + f"window.CITY_DATA.{args.city} = " + json.dumps(city_obj, separators=(",", ":")) + ";\n"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"OK: {len(kec_fc['features'])} kecamatan, {len(pkm_fc['features'])} puskesmas -> {out_path}")
    print("Jangan lupa tambahkan <script src=\"" + out_path.replace("\\", "/") + "\"></script> di index.html")
    print("kalau file output di luar data/cities/, atau pastikan path-nya sudah benar.")


if __name__ == "__main__":
    main()
