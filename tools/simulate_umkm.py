#!/usr/bin/env python3
"""
simulate_umkm.py — regenerate simulasi 8 sektor UMKM (jumlah UMKM & kepadatan
per 1.000 penduduk) untuk kecamatan di seluruh data/cities/<kota>.js, memakai
rateRange yang sama dengan data/diseases.js (sekarang berisi SEKTOR_DEFS
walau nama variabelnya masih DISEASE_DEFS untuk kompatibilitas kode lama).

Pakai:
    python3 tools/simulate_umkm.py
"""
import glob
import hashlib
import json
import os
import re

CITY_ORDER = ["makassar", "surabaya", "bandung", "bandungkab", "jambi"]

SEKTOR_RATE_RANGES = {
    "kuliner": (15, 45),
    "dagang": (10, 35),
    "jasa": (5, 20),
    "fashion": (4, 16),
    "kerajinan": (2, 10),
    "agribisnis": (1, 18),
    "otomotif": (1, 8),
    "digital": (0.5, 10),
}


def seeded_rand(key, salt):
    h = hashlib.sha256(f"{key}|{salt}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def simulate(name, pop, max_pop):
    out = {}
    pop_norm = min(pop / max_pop, 1.0) if max_pop else 0.0
    for skey, (lo, hi) in SEKTOR_RATE_RANGES.items():
        r1 = seeded_rand(name, skey + "_umkm_a")
        r2 = seeded_rand(name, skey + "_umkm_b")
        mix = 0.55 * r1 + 0.45 * (0.3 * r2 + 0.7 * pop_norm)
        rate = round(lo + mix * (hi - lo), 2)
        jumlah = round(rate / 1000 * pop)
        out[skey] = {"kasus": jumlah, "ir": rate}
    return out


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
    pops = [float(f["properties"].get("jmlh_pddk", 0)) for f in feats]
    max_pop = max(pops) if pops else 1
    for f, pop in zip(feats, pops):
        p = f["properties"]
        name = p.get("KECAMATAN", "TANPA NAMA")
        p["diseases"] = simulate(name, pop, max_pop)

    new_content = prefix + marker + json.dumps(data, separators=(",", ":")) + ";\n"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(new_content)
    print(f"OK {city}: {len(feats)} kecamatan diperbarui ke sektor UMKM")


def main():
    for city in CITY_ORDER:
        process_city(city)


if __name__ == "__main__":
    main()
