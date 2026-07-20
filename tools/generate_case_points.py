#!/usr/bin/env python3
"""
generate_case_points.py — isi field "cases" (titik kasus individual per
penyakit) untuk sebuah kota di data/cities/<kota>.js, dengan menyebar titik
acak di dalam poligon tiap kecamatan, proporsional terhadap jumlah "kasus"
kecamatan itu untuk penyakit tsb (mengikuti pola yang dipakai untuk contoh
Makassar).

Tidak generate 1 titik per kasus (bisa puluhan ribu) — dibatasi ke "budget"
titik per penyakit per kota supaya file tetap ringan & peta tetap responsif,
lalu dialokasikan proporsional ke tiap kecamatan (minimum 1 titik kalau
kasus kecamatan itu > 0).

Pakai:
    python3 tools/generate_case_points.py --city jambi --budget 300
    python3 tools/generate_case_points.py --city bandungkab --budget 400

Hasilnya langsung menimpa (update) field "cases" di data/cities/<kota>.js,
field lain (kecamatan, puskesmas, dll) tidak diubah.
"""
import argparse
import hashlib
import json
import random
import sys

DISEASE_KEYS = ["kuliner", "dagang", "jasa", "fashion", "kerajinan", "agribisnis", "otomotif", "digital"]

# ---------- Generator nama usaha (simulasi, per sektor) ----------
NAME_PREFIX = {
    "kuliner": ["Warung Makan", "Warung", "Kedai Kopi", "RM", "Angkringan", "Kedai"],
    "dagang": ["Toko", "Kios", "Toserba", "Minimarket"],
    "jasa": ["Laundry", "Salon", "Servis", "Jasa Reparasi", "Cukur"],
    "fashion": ["Butik", "Konveksi", "Tailor", "Distro"],
    "kerajinan": ["Kerajinan", "Sanggar", "Galeri Kriya", "Workshop"],
    "agribisnis": ["Tani", "Kebun", "Peternakan", "Hidroponik"],
    "otomotif": ["Bengkel", "Variasi Motor", "Tambal Ban", "Cuci Motor"],
    "digital": ["Digital Print", "Startup", "Online Shop", "Kreatif Studio"],
}
NAME_WORD = [
    "Barokah", "Sejahtera", "Makmur", "Jaya", "Bahagia", "Sederhana", "Mandiri",
    "Berkah", "Sentosa", "Amanah", "Cahaya", "Rejeki", "Bersama", "Harapan",
    "Sumber Rejeki", "Karya", "Maju", "Abadi", "Sukses", "Indah", "Utama",
    "Anugerah", "Bunda", "Pak Herman", "Bu Sari", "Setia", "Damai", "Merdeka",
]
SKALA_POOL = (["Mikro"] * 85) + (["Kecil"] * 12) + (["Menengah"] * 3)


def business_name(city, kec, sektor, pid):
    h = hashlib.sha256(f"{city}|{kec}|{sektor}|{pid}|name".encode()).hexdigest()
    prefix = NAME_PREFIX[sektor][int(h[0:4], 16) % len(NAME_PREFIX[sektor])]
    word = NAME_WORD[int(h[4:8], 16) % len(NAME_WORD)]
    return f"{prefix} {word}"


def business_info(city, kec, sektor, pid):
    h = hashlib.sha256(f"{city}|{kec}|{sektor}|{pid}|info".encode()).hexdigest()
    skala = SKALA_POOL[int(h[8:12], 16) % len(SKALA_POOL)]
    tahun = 2003 + (int(h[12:16], 16) % 22)  # 2003–2024
    return skala, tahun


def ring_bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi):
            inside = not inside
        j = i
    return inside


def point_in_polygon_with_holes(x, y, poly):
    # poly: list of rings, first = exterior, rest = holes
    if not point_in_ring(x, y, poly[0]):
        return False
    for hole in poly[1:]:
        if point_in_ring(x, y, hole):
            return False
    return True


def point_in_multipolygon(x, y, multipoly):
    for poly in multipoly:
        if point_in_polygon_with_holes(x, y, poly):
            return True
    return False


def sample_point_in_geom(geom, rng, max_attempts=300):
    if geom["type"] == "Polygon":
        polys = [geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        polys = geom["coordinates"]
    else:
        return None

    # bbox across all parts
    all_exteriors = [poly[0] for poly in polys]
    bboxes = [ring_bbox(ext) for ext in all_exteriors]
    minx = min(b[0] for b in bboxes)
    miny = min(b[1] for b in bboxes)
    maxx = max(b[2] for b in bboxes)
    maxy = max(b[3] for b in bboxes)

    for _ in range(max_attempts):
        x = rng.uniform(minx, maxx)
        y = rng.uniform(miny, maxy)
        if point_in_multipolygon(x, y, polys):
            return [x, y]

    # fallback: centroid of first exterior ring (rough, but always inside-ish)
    ext = all_exteriors[0]
    xs = [p[0] for p in ext]
    ys = [p[1] for p in ext]
    return [sum(xs) / len(xs), sum(ys) / len(ys)]


def allocate_points(kasus_by_kec, budget):
    total = sum(kasus_by_kec.values())
    if total <= 0:
        return {k: 0 for k in kasus_by_kec}
    alloc = {}
    for k, kasus in kasus_by_kec.items():
        if kasus <= 0:
            alloc[k] = 0
            continue
        n = round(kasus / total * budget)
        alloc[k] = max(1, n)
    return alloc


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--city", required=True, help="key kota, mis. jambi")
    ap.add_argument("--budget", type=int, default=300, help="target jumlah titik per penyakit per kota (default 300)")
    ap.add_argument("--path", default=None, help="path file .js kota (default: data/cities/<city>.js)")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    path = args.path or f"data/cities/{args.city}.js"
    content = open(path, encoding="utf-8").read()
    marker = f"window.CITY_DATA.{args.city} = "
    if marker not in content:
        print(f"ERROR: tidak menemukan '{marker}' di {path}", file=sys.stderr)
        sys.exit(1)
    prefix, rest = content.split(marker, 1)
    data = json.loads(rest.rstrip(";\n"))

    feats = data["kecamatan"]["features"]
    rng = random.Random(args.seed)

    cases = {}
    for dk in DISEASE_KEYS:
        kasus_by_kec = {}
        for i, f in enumerate(feats):
            kasus_by_kec[i] = f["properties"].get("diseases", {}).get(dk, {}).get("kasus", 0)
        alloc = allocate_points(kasus_by_kec, args.budget)

        points = []
        pid = 0
        for i, f in enumerate(feats):
            n = alloc[i]
            geom = f["geometry"]
            for _ in range(n):
                pt = sample_point_in_geom(geom, rng)
                if pt is None:
                    continue
                kec_name = f["properties"].get("KECAMATAN", "")
                skala, tahun = business_info(args.city, kec_name, dk, pid)
                points.append({
                    "type": "Feature",
                    "properties": {
                        "id": str(pid), "disease": dk, "kec": kec_name,
                        "nama": business_name(args.city, kec_name, dk, pid),
                        "skala": skala, "tahun": tahun,
                    },
                    "geometry": {"type": "Point", "coordinates": pt},
                })
                pid += 1
        cases[dk] = {"type": "FeatureCollection", "features": points}
        print(f"{args.city} / {dk}: {len(points)} titik (dari {sum(kasus_by_kec.values())} kasus total)")

    data["cases"] = cases
    new_content = prefix + marker + json.dumps(data, separators=(",", ":")) + ";\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"OK: cases ditulis ke {path}")


if __name__ == "__main__":
    main()
