# Format data per kota

> **Catatan tema:** aplikasi ini sekarang bertema **Sebaran & Potensi UMKM**
> (sebelumnya surveilans penyakit). Nama field JSON di bawah (`diseases`,
> `cases`) masih dipertahankan apa adanya untuk kompatibilitas kode
> (`app.js` tidak perlu diubah), tapi isinya sekarang merepresentasikan
> **sektor UMKM**, bukan penyakit. Field `puskesmas` (data fasilitas
> kesehatan dari OSM) masih ada di file data kota untuk arsip, tapi **sudah
> tidak dipakai/ditampilkan** di UI — layer itu sudah dihapus dari peta.

Setiap kota punya satu file `data/cities/<key>.js` (`key` = `makassar`, `surabaya`,
`bandung`, `bandungkab`, `jambi`). File ini mendaftarkan objeknya sendiri ke
`window.CITY_DATA`, jadi tidak perlu mengubah `app.js` untuk menambah kota baru
selama nama file & key-nya cocok dan didaftarkan di `index.html` +
`CITY_ORDER` (app.js).

## Struktur objek

```js
window.CITY_DATA.namakota = {
  "label": "Kota Nama",              // ditampilkan di UI
  "province": "Nama Provinsi",
  "available": true,                 // true = tampilkan sebagai "Data tersedia"
  "center": [-6.9175, 107.6191],      // [lat, lng] titik tengah peta
  "zoom": 12,
  "kecamatanLabel": "Kecamatan",
  "kecamatan": { ...GeoJSON FeatureCollection... },
  "cases": { "kuliner": { ...FeatureCollection titik UMKM (opsional)... }, ... }
};
```

### 1. `kecamatan` (wajib, poligon)

GeoJSON `FeatureCollection` dengan tiap `feature.properties` berisi minimal:

| Field         | Tipe   | Keterangan                                  |
|---------------|--------|----------------------------------------------|
| `KECAMATAN`   | string | Nama kecamatan (huruf besar/kecil bebas)      |
| `jmlh_pddk`   | number | Jumlah penduduk                               |
| `diseases`    | object | `{ "<sektor_key>": { "kasus": n, "ir": n } }` untuk **setiap** key di `data/diseases.js` (`kuliner`, `dagang`, `jasa`, `fashion`, `kerajinan`, `agribisnis`, `otomotif`, `digital`). `kasus` = jumlah UMKM, `ir` = kepadatan UMKM per 1.000 penduduk. |

`ir` = kepadatan = `kasus / jmlh_pddk * 1000`.

### 2. `cases` (opsional, titik UMKM individual per sektor — tap untuk info)

Object `{ "<sektor_key>": FeatureCollection titik }`. Tiap titik punya:

| Field    | Keterangan                                                        |
|----------|--------------------------------------------------------------------|
| `kec`    | Nama kecamatan, harus cocok dengan `KECAMATAN` di poligon (dipakai fitur "Fokus ke kecamatan ini") |
| `nama`   | Nama usaha simulasi (mis. "Warung Bu Sari") — ditampilkan di popup saat titik di-tap |
| `skala`  | "Mikro" / "Kecil" / "Menengah"                                     |
| `tahun`  | Tahun berdiri (simulasi)                                           |

Ini yang menghidupkan heatmap, mode "titik UMKM individual" (ikon
ber-cluster, tap untuk lihat popup nama & info usaha), dan daftar "Contoh
UMKM" di drawer kecamatan. Kalau kosong untuk suatu sektor, layer tersebut
otomatis kosong untuk sektor itu saja (statistik kecamatan tetap tampil
normal). Generate otomatis pakai `tools/generate_case_points.py`.

### 3. `properties.profil` (opsional, per kecamatan — data profil UMKM tambahan)

```js
"profil": {
  "skala": { "mikro_pct": 88.4, "kecil_pct": 9.0, "menengah_pct": 2.6 },
  "legalitas": { "nib_pct": 45.5, "halal_pct": 23.1 },
  "digital": { "qris_pct": 56.6 },
  "pembiayaan": { "kur_pct": 16.2 },
  "tenaga_kerja": { "total": 23667 }
}
```

Dipakai di drawer "Profil Kecamatan" (klik kecamatan di peta). Generate
otomatis pakai `tools/simulate_umkm_profil.py` (harus dijalankan **setelah**
`tools/simulate_umkm.py`, karena `tenaga_kerja.total` dihitung dari jumlah
UMKM tiap sektor × rata-rata pekerja per sektor di `data/diseases.js`).

## Cara tercepat: pakai `tools/convert_city.py` + skrip simulasi

Kalau kamu punya shapefile/GeoJSON batas kecamatan (mis. hasil export dari
QGIS atau GADM), jalankan:

```bash
python3 tools/convert_city.py \
  --city surabaya \
  --label "Kota Surabaya" \
  --province "Jawa Timur" \
  --kecamatan path/ke/kecamatan.geojson \
  --name-field NAMOBJ \
  --pop-field JUMLAH_PDDK \
  --center-lat -7.2575 --center-lng 112.7521 --zoom 12 \
  --out data/cities/surabaya.js
```

Lalu jalankan berurutan untuk mengisi semua data simulasi ke semua kota
(termasuk kota baru):

```bash
python3 tools/simulate_umkm.py           # jumlah UMKM & kepadatan per sektor
python3 tools/simulate_umkm_profil.py    # skala usaha, legalitas, digital, pembiayaan, tenaga kerja
python3 tools/generate_case_points.py --city surabaya --budget 300   # titik UMKM individual
```

Kalau file kamu masih `.shp`, ubah dulu ke `.geojson` (di QGIS: klik kanan
layer → Export → Save Features As → format GeoJSON), lalu jalankan perintah
di atas.

Setelah file dibuat, tinggal reload `index.html` — kota tersebut otomatis
muncul dengan badge "Data tersedia" di pemilih kota dan bisa langsung diklik.

## Catatan tentang breaks/warna

Ambang batas klasifikasi warna (`breaks`) & palet warna tiap sektor UMKM
didefinisikan **sekali secara global** di `data/diseases.js` (nama file lama,
isinya sudah sektor UMKM), dipakai bersama oleh semua kota (bukan dihitung
ulang per kota). Ini supaya legenda warna konsisten saat kamu membandingkan
beberapa kota. Kalau distribusi kepadatan kota baru jauh berbeda dari
Makassar, kamu bisa sesuaikan array `breaks` sektor terkait di
`data/diseases.js`.
