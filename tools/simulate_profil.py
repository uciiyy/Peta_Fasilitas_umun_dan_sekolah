#!/usr/bin/env python3
"""
simulate_profil.py — tambahkan properties.profil ke tiap kecamatan di
data/cities/<kota>.js: skala usaha, legalitas, adopsi digital, akses
pembiayaan, dan estimasi serapan tenaga kerja. Simulasi deterministik
(seeded hash) berbasis nama kecamatan + jumlah UMKM per sektor yang
sudah ada di properties.diseases.

Pakai:
    python3 tools/simulate_profil.py
"""
import hashlib
import json
import os

CITY_ORDER = ["makassar", "surabaya", "bandung", "bandungkab", "jambi"]

# rata-rata pekerja per unit usaha, per sektor (estimasi kasar utk simulasi)
AVG_WORKERS = {
    "kuliner": 2.4, "dagang": 1.6, "jasa": 2.0, "fashion": 2.2,
    "kerajinan": 1.8, "agribisnis": 3.0, "otomotif": 2.3, "digital": 1.4,
}


def seeded_rand(key, salt):
    h = hashlib.sha256(f"{key}|{salt}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def build_profil(name, diseases):
    r_men = seeded_rand(name, "skala_menengah")
    r_kecil = seeded_rand(name, "skala_kecil")
    menengah_pct = round(0.2 + r_men * 0.8, 2)
    kecil_pct = round(3 + r_kecil * 4, 2)
    mikro_pct = round(100 - kecil_pct - menengah_pct, 2)

    nib_pct = round(15 + seeded_rand(name, "nib") * 40, 1)
    halal_pct = round(5 + seeded_rand(name, "halal") * 25, 1)
    qris_pct = round(20 + seeded_rand(name, "qris") * 45, 1)
    kur_pct = round(8 + seeded_rand(name, "kur") * 27, 1)

    per_sektor = {}
    total_workers = 0
    for skey, d in diseases.items():
        avg = AVG_WORKERS.get(skey, 2.0)
        r = seeded_rand(name, skey + "_worker")
        w = round(d["kasus"] * avg * (0.85 + 0.3 * r))
        per_sektor[skey] = w
        total_workers += w

    return {
        "skala": {"mikro_pct": mikro_pct, "kecil_pct": kecil_pct, "menengah_pct": menengah_pct},
        "legalitas": {"nib_pct": nib_pct, "halal_pct": halal_pct},
        "digital": {"qris_pct": qris_pct},
        "pembiayaan": {"kur_pct": kur_pct},
        "tenaga_kerja": {"total": total_workers, "per_sektor": per_sektor},
    }


def process_city(city):
    path = f"data/cities/{city}.js"
    if not os.path.exists(path):
        print(f"skip {city}: file tidak ada")
        return
    content = open(path, encoding="utf-8").read()
    marker = f"window.CITY_DATA.{city} = "
    if marker not in content:
        print(f"skip {city}: marker tidak ditemukan")
        return
    prefix, rest = content.split(marker, 1)
    data = json.loads(rest.rstrip(";\n"))

    feats = data["kecamatan"]["features"]
    for f in feats:
        p = f["properties"]
        name = p.get("KECAMATAN", "TANPA NAMA")
        p["profil"] = build_profil(name, p["diseases"])

    new_content = prefix + marker + json.dumps(data, separators=(",", ":")) + ";\n"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(new_content)
    print(f"OK {city}: {len(feats)} kecamatan diberi properties.profil")


def main():
    for city in CITY_ORDER:
        process_city(city)


if __name__ == "__main__":
    main()
