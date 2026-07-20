#!/usr/bin/env python3
"""
simulate_umkm_profil.py — tambah field properties.profil ke tiap kecamatan
di seluruh data/cities/<kota>.js: simulasi skala usaha (mikro/kecil/menengah),
legalitas (NIB/halal), adopsi digital (QRIS), akses pembiayaan (KUR), dan
estimasi tenaga kerja terserap (dari jumlah UMKM x rata-rata pekerja per
sektor). Konsisten dengan metode seeded-random yang sama dipakai
tools/simulate_umkm.py supaya hasilnya stabil & deterministik per kecamatan.

Harus dijalankan SETELAH tools/simulate_umkm.py (butuh properties.diseases
sudah terisi untuk menghitung tenaga_kerja.total).

Pakai:
    python3 tools/simulate_umkm_profil.py
"""
import hashlib
import json
import os

CITY_ORDER = ["makassar", "surabaya", "bandung", "bandungkab", "jambi"]

AVG_WORKERS = {
    "kuliner": 3.2, "dagang": 2.1, "jasa": 1.8, "fashion": 2.4,
    "kerajinan": 2.6, "agribisnis": 2.0, "otomotif": 2.3, "digital": 1.5,
}


def seeded_rand(key, salt):
    h = hashlib.sha256(f"{key}|{salt}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def simulate_profil(name, pop, max_pop, diseases):
    pop_norm = min(pop / max_pop, 1.0) if max_pop else 0.0

    r_kecil = seeded_rand(name, "skala_kecil")
    r_menengah = seeded_rand(name, "skala_menengah")
    kecil = round(5 + (0.5 * r_kecil + 0.5 * pop_norm) * 12, 1)
    menengah = round(0.5 + (0.4 * r_menengah + 0.6 * pop_norm) * 4.5, 1)
    mikro = round(100 - kecil - menengah, 1)

    r_nib_a, r_nib_b = seeded_rand(name, "nib_a"), seeded_rand(name, "nib_b")
    nib = round(22 + (0.55 * r_nib_a + 0.45 * (0.3 * r_nib_b + 0.7 * pop_norm)) * 50, 1)
    r_halal_a, r_halal_b = seeded_rand(name, "halal_a"), seeded_rand(name, "halal_b")
    halal = round(12 + (0.55 * r_halal_a + 0.45 * (0.3 * r_halal_b + 0.7 * pop_norm)) * 45, 1)

    r_qris_a, r_qris_b = seeded_rand(name, "qris_a"), seeded_rand(name, "qris_b")
    qris = round(18 + (0.5 * r_qris_a + 0.5 * (0.25 * r_qris_b + 0.75 * pop_norm)) * 55, 1)

    r_kur_a, r_kur_b = seeded_rand(name, "kur_a"), seeded_rand(name, "kur_b")
    kur = round(8 + (0.6 * r_kur_a + 0.4 * (0.3 * r_kur_b + 0.7 * pop_norm)) * 34, 1)

    tenaga_kerja = round(sum(
        (diseases.get(k, {}).get("kasus", 0)) * AVG_WORKERS[k] for k in AVG_WORKERS
    ))

    return {
        "skala": {"mikro_pct": mikro, "kecil_pct": kecil, "menengah_pct": menengah},
        "legalitas": {"nib_pct": nib, "halal_pct": halal},
        "digital": {"qris_pct": qris},
        "pembiayaan": {"kur_pct": kur},
        "tenaga_kerja": {"total": tenaga_kerja},
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
    pops = [float(f["properties"].get("jmlh_pddk", 0)) for f in feats]
    max_pop = max(pops) if pops else 1
    for f, pop in zip(feats, pops):
        p = f["properties"]
        name = p.get("KECAMATAN", "TANPA NAMA")
        p["profil"] = simulate_profil(name, pop, max_pop, p.get("diseases", {}))
        p.pop("umkmProfil", None)  # bersihkan field lama kalau ada

    new_content = prefix + marker + json.dumps(data, separators=(",", ":")) + ";\n"
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(new_content)
    print(f"OK {city}: {len(feats)} kecamatan diberi profil UMKM tambahan")


def main():
    for city in CITY_ORDER:
        process_city(city)


if __name__ == "__main__":
    main()
