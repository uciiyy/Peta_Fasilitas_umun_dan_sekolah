/* =========================================================
   Peta Kios UMKM — Multi-Kota
   Identitas visual: "papan gantung pasar" — pin berbentuk
   label harga, panel info sebagai bottom-sheet, strip sektor
   sebagai rak ikon yang bisa digeser.
   ========================================================= */

const POTENSI_LABELS = ['Rendah', 'Sedang', 'Tinggi', 'Sangat Tinggi', 'Sentra Utama'];
function fmt(n) { return new Intl.NumberFormat('id-ID').format(Math.round(n)); }
function fmt1(n) { return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n); }

/* ---------- City registry ----------
   Setiap file data/cities/<key>.js mendaftarkan dirinya ke window.CITY_DATA.
   Kota dengan features kosong dianggap "belum ada data". */
const CITY_ORDER = ['makassar', 'surabaya', 'bandung', 'bandungkab', 'jambi'];
window.CITY_DATA = window.CITY_DATA || {};
let currentCity = 'makassar';
let CITY = window.CITY_DATA[currentCity];

function cityHasData(key) {
  const c = window.CITY_DATA[key];
  return !!(c && c.kecamatan && c.kecamatan.features && c.kecamatan.features.length);
}

/* ---------- Sektor UMKM state ----------
   data/diseases.js masih mendeklarasikan variabel bernama DISEASE_DEFS
   (nama lama), tapi isinya sudah berupa 8 sektor UMKM. Alias di sini
   supaya sisa kode di file ini konsisten memakai istilah "sektor". */
const SEKTOR_DEFS = DISEASE_DEFS;
const sektorKeys = Object.keys(SEKTOR_DEFS);
let currentSektor = sektorKeys[0];

function sektorDef(key) { return SEKTOR_DEFS[key || currentSektor]; }
function sektorStat(feature, key) {
  const p = feature.properties;
  const d = (p.diseases && p.diseases[key || currentSektor]);
  return d || { kasus: 0, ir: 0 };
}
function potensiIndex(val, key) {
  const b = sektorDef(key).breaks;
  if (val < b[0]) return 0;
  if (val < b[1]) return 1;
  if (val < b[2]) return 2;
  if (val < b[3]) return 3;
  return 4;
}
function potensiColor(val, key) { return sektorDef(key).color[potensiIndex(val, key)]; }
function potensiLabel(val, key) { return POTENSI_LABELS[potensiIndex(val, key)]; }

/* ---------- Ikon sektor (SVG stroke, gaya piktogram sederhana) ---------- */
const SEKTOR_ICON_PATHS = {
  kuliner: '<path d="M4 11a8 4 0 0 0 16 0"/><path d="M4 11h16"/><path d="M8 6c0 1-1 1-1 2M12 5c0 1-1 1-1 2M16 6c0 1-1 1-1 2"/>',
  dagang: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  jasa: '<path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8z"/>',
  fashion: '<path d="M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8l4-4z"/>',
  kerajinan: '<circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><path d="M9 8l10 8M9 16l10-8"/>',
  agribisnis: '<path d="M4 20c8 0 14-6 14-14 0-1 0-2-.3-3C10 4 4 10 4 18c0 .7 0 1.4.1 2z"/><path d="M4 20c3-6 6-9 12-13"/>',
  otomotif: '<path d="M5 16V11l2-4h10l2 4v5"/><path d="M5 16h14"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/>',
  digital: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  faskes: '<path d="M12 5v14M5 12h14"/>'
};
function sektorIconSvg(key, size) {
  size = size || 15;
  const path = SEKTOR_ICON_PATHS[key] || SEKTOR_ICON_PATHS.faskes;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

/* ---------- Base map ---------- */
const map = L.map('map', { zoomControl: false, attributionControl: true })
  .setView(CITY.center, CITY.zoom);

const streetLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 20, className: 'tile-warm'
}).addTo(map);

const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri', maxZoom: 19
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

document.querySelectorAll('#mapType button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mapType button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (btn.dataset.mode === 'sat') {
      map.removeLayer(streetLayer); satLayer.addTo(map);
    } else {
      map.removeLayer(satLayer); streetLayer.addTo(map);
    }
  });
});

/* ---------- Kecamatan choropleth ---------- */
function kecStyle(feature) {
  const ir = sektorStat(feature).ir;
  const isFocused = focusedKec && feature.properties.KECAMATAN === focusedKec;
  return {
    fillColor: potensiColor(ir), fillOpacity: isFocused ? 0.85 : 0.62,
    color: isFocused ? '#F2A73B' : '#fffaf0', weight: isFocused ? 3.4 : 1.6, dashArray: '1,0'
  };
}
function kecHoverStyle() { return { fillOpacity: 0.85, weight: 3, color: '#17213D' }; }

function kecTooltipText(feature) {
  const p = feature.properties;
  const d = sektorStat(feature);
  return `${p.KECAMATAN} · ${fmt1(d.ir)} /1.000`;
}

/* ---------- Point-in-polygon (helper geometri umum) ---------- */
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi)) inside = !inside;
  }
  return inside;
}
function pointInFeatureGeom(lng, lat, geom) {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  for (const poly of polys) {
    if (!pointInRing(lng, lat, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) if (pointInRing(lng, lat, poly[h])) inHole = true;
    if (!inHole) return true;
  }
  return false;
}

const kecLayer = L.geoJSON(null, {
  style: kecStyle,
  onEachFeature: (feature, layer) => {
    layer.bindTooltip(kecTooltipText(feature), { className: 'kec-tooltip', sticky: true });
    layer.on('mouseover', () => layer.setStyle(kecHoverStyle()));
    layer.on('mouseout', () => kecLayer.resetStyle(layer));
    layer.on('click', () => openKecDrawer(feature));
  }
}).addTo(map);

function refreshKecLayer() {
  kecLayer.eachLayer(layer => {
    kecLayer.resetStyle(layer);
    layer.setTooltipContent(kecTooltipText(layer.feature));
  });
}

function loadKecLayer(fc) {
  kecLayer.clearLayers();
  if (fc && fc.features && fc.features.length) kecLayer.addData(fc);
}

/* ---------- Tag-pin generik (dipakai utk titik UMKM) ---------- */
function tagPinIcon(color, sektorKey, size) {
  size = size || 30;
  return L.divIcon({
    className: '',
    html: `<div class="stall-pin" style="--pin-c:${color}">${sektorIconSvg(sektorKey, Math.round(size * 0.46))}</div>`,
    iconSize: [size, size], iconAnchor: [size * 0.18, size], popupAnchor: [size * 0.3, -size]
  });
}
function clusterIconFactory(color) {
  return function (cluster) {
    const count = cluster.getChildCount();
    return L.divIcon({
      html: `<div class="cluster-badge" style="--c:${color}">${count}</div>`,
      className: '', iconSize: [40, 40], iconAnchor: [7, 40]
    });
  };
}

/* ---------- Titik UMKM individual: heatmap + tag-pin per sektor ---------- */
let heatLayer = L.heatLayer([], { radius: 22, blur: 26, maxZoom: 16 });
const caseCluster = L.markerClusterGroup({
  iconCreateFunction: clusterIconFactory(sektorDef().color[3]),
  showCoverageOnHover: false, spiderfyOnMaxZoom: true, maxClusterRadius: 40, disableClusteringAtZoom: 17
});

let focusedKec = null;

function currentCaseFeatures() {
  const fc = CITY.cases && CITY.cases[currentSektor];
  let feats = fc ? fc.features : [];
  if (focusedKec) feats = feats.filter(f => f.properties.kec === focusedKec);
  return feats;
}

function umkmPopupHTML(props) {
  const def = sektorDef();
  return `
    <div class="pop">
      <div class="pop-tear"></div>
      <div class="pt">${props.nama || 'UMKM'}</div>
      <div class="pr"><span>Sektor</span><b>${def.short}</b></div>
      <div class="pr"><span>Kecamatan</span><b>${props.kec || '-'}</b></div>
      <div class="pr"><span>Skala usaha</span><b>${props.skala || '-'}</b></div>
      <div class="pr"><span>Berdiri sejak</span><b>${props.tahun || '-'}</b></div>
      <div class="sample-note">Data simulasi ilustratif — nama &amp; detail usaha belum berbasis data pendataan UMKM asli.</div>
    </div>`;
}

function refreshCaseLayers() {
  const def = sektorDef();
  const feats = currentCaseFeatures();
  const pts = feats.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0], 0.55]);
  heatLayer.setLatLngs(pts);
  heatLayer.setOptions({ gradient: { 0.3: def.color[1], 0.6: def.color[2], 0.85: def.color[3], 1: def.color[4] } });

  caseCluster.options.iconCreateFunction = clusterIconFactory(def.color[3]);
  caseCluster.clearLayers();
  const icon = tagPinIcon(def.color[3], currentSektor, 26);
  feats.forEach(f => {
    const [lng, lat] = f.geometry.coordinates;
    const marker = L.marker([lat, lng], { icon });
    marker.bindPopup(() => umkmPopupHTML(f.properties));
    caseCluster.addLayer(marker);
  });
  caseCluster.refreshClusters && caseCluster.refreshClusters();
}

/* ---------- Drawer: Profil Kecamatan ---------- */
const kecDrawer = document.getElementById('kecDrawer');

function kecRank(feature) {
  const feats = (CITY.kecamatan && CITY.kecamatan.features) || [];
  const ranked = [...feats].sort((a, b) => sektorStat(b).ir - sektorStat(a).ir);
  const idx = ranked.findIndex(f => f.properties.KECAMATAN === feature.properties.KECAMATAN);
  return { rank: idx + 1, total: feats.length };
}

function sektorFingerprintHTML(feature) {
  const vals = sektorKeys.map(k => ({ k, def: SEKTOR_DEFS[k], stat: sektorStat(feature, k) }));
  const max = Math.max(...vals.map(v => v.stat.ir), 0.001);
  return vals.sort((a, b) => b.stat.ir - a.stat.ir).map(v => `
    <div class="fp-row">
      <span class="fp-ico" style="background:${v.def.color[3]}">${sektorIconSvg(v.k, 13)}</span>
      <span class="fp-lbl">${v.def.short}</span>
      <div class="fp-bar"><div style="width:${Math.max(6, v.stat.ir / max * 100)}%;background:${v.def.color[3]}"></div></div>
      <span class="fp-val">${fmt1(v.stat.ir)}</span>
    </div>`).join('');
}

function sampleUmkmHTML(feature) {
  const def = sektorDef();
  const fc = CITY.cases && CITY.cases[currentSektor];
  const all = fc ? fc.features.filter(f => f.properties.kec === feature.properties.KECAMATAN) : [];
  const list = all.slice(0, 6);
  if (!list.length) return `<p class="side-hint">Belum ada titik UMKM sektor ${def.short} yang terpetakan di kecamatan ini.</p>`;
  return `<div class="pkm-list">${list.map(f => {
    const pr = f.properties;
    return `
    <div class="pkm-item" data-id="${pr.id}">
      <div class="pkm-ico" style="background:${def.color[3]}">${sektorIconSvg(currentSektor, 13)}</div>
      <div><div class="pkm-name">${pr.nama}</div><div class="pkm-sub">${pr.skala} &middot; berdiri ${pr.tahun}</div></div>
    </div>`;
  }).join('')}</div>${all.length > 6 ? `<p class="side-hint">+${all.length - 6} usaha ${def.short} lainnya di kecamatan ini</p>` : ''}`;
}

function openKecDrawer(feature) {
  const p = feature.properties;
  const def = sektorDef();
  const d = sektorStat(feature);
  const { rank, total } = kecRank(feature);
  const prof = p.profil || {};
  const skala = prof.skala || {};
  const leg = prof.legalitas || {};
  const dig = prof.digital || {};
  const biaya = prof.pembiayaan || {};
  const tk = prof.tenaga_kerja || { total: 0 };

  document.getElementById('kecDrawerName').textContent = p.KECAMATAN;
  document.getElementById('kecDrawerRank').textContent = `Peringkat ${rank} dari ${total} · ${def.short}`;
  document.getElementById('kecDrawerBody').innerHTML = `
    <div class="stat-strip">
      <div class="stat-tag"><div class="num">${fmt(p.jmlh_pddk)}</div><div class="lbl">Penduduk</div></div>
      <div class="stat-tag"><div class="num">${fmt(d.kasus)}</div><div class="lbl">Total ${def.short}</div></div>
      <div class="stat-tag"><div class="num">${fmt(tk.total)}</div><div class="lbl">Tenaga kerja terserap</div></div>
    </div>

    <div class="section-title">Sidik Jari Sektor<span class="hint">UMKM / 1.000 penduduk</span></div>
    <div class="fingerprint">${sektorFingerprintHTML(feature)}</div>

    <div class="section-title">Profil Usaha</div>
    <div class="profil-grid">
      <div class="profil-card">
        <div class="pc-t">Skala usaha</div>
        <div class="skala-bar">
          <div style="width:${skala.mikro_pct || 0}%;background:var(--daun)" title="Mikro ${skala.mikro_pct}%"></div>
          <div style="width:${skala.kecil_pct || 0}%;background:var(--marigold)" title="Kecil ${skala.kecil_pct}%"></div>
          <div style="width:${(skala.menengah_pct || 0) * 3}%;background:var(--cabai)" title="Menengah ${skala.menengah_pct}%"></div>
        </div>
        <div class="pc-legend">
          <span><i style="background:var(--daun)"></i>Mikro ${fmt1(skala.mikro_pct)}%</span>
          <span><i style="background:var(--marigold)"></i>Kecil ${fmt1(skala.kecil_pct)}%</span>
          <span><i style="background:var(--cabai)"></i>Menengah ${fmt1(skala.menengah_pct)}%</span>
        </div>
      </div>
      <div class="profil-card">
        <div class="pc-t">Legalitas usaha</div>
        <div class="pc-num">${fmt1(leg.nib_pct)}%<span>sudah punya NIB</span></div>
        <div class="pc-num sm">${fmt1(leg.halal_pct)}%<span>bersertifikat halal</span></div>
      </div>
      <div class="profil-card">
        <div class="pc-t">Adopsi digital</div>
        <div class="pc-num">${fmt1(dig.qris_pct)}%<span>sudah pakai QRIS / lapak online</span></div>
      </div>
      <div class="profil-card">
        <div class="pc-t">Akses pembiayaan</div>
        <div class="pc-num">${fmt1(biaya.kur_pct)}%<span>pernah menerima KUR / pinjaman modal</span></div>
      </div>
    </div>

    <div class="section-title">Contoh UMKM ${def.short} di Kecamatan Ini</div>
    ${sampleUmkmHTML(feature)}

    ${def.isSample ? '<div class="sample-note">Seluruh angka &amp; nama usaha di panel ini simulasi ilustratif berbasis populasi — ganti dengan data pendataan UMKM / Dinas Koperasi &amp; UKM asli bila tersedia.</div>' : ''}
  `;
  document.getElementById('kecDrawerBody').querySelectorAll('.pkm-item').forEach(el => {
    el.addEventListener('click', () => {
      const f = (CITY.cases[currentSektor].features || []).find(x => x.properties.id === el.dataset.id);
      if (f) {
        const [lng, lat] = f.geometry.coordinates;
        kecDrawer.classList.remove('show');
        map.flyTo([lat, lng], 17, { duration: 0.9 });
      }
    });
  });

  document.getElementById('kecDrawerFocusBtn').onclick = () => {
    focusedKec = p.KECAMATAN;
    refreshKecLayer(); kecLayer.eachLayer(l => kecLayer.resetStyle(l));
    refreshCaseLayers();
    map.flyToBounds(L.geoJSON(feature).getBounds(), { duration: 0.8, padding: [60, 60] });
    document.getElementById('kecDrawerFocusBtn').classList.add('active');
    document.getElementById('kecFocusChip').classList.add('show');
    document.getElementById('kecFocusChip').querySelector('span').textContent = p.KECAMATAN;
  };

  kecDrawer.classList.add('show');
}

document.getElementById('kecDrawerClose').addEventListener('click', () => kecDrawer.classList.remove('show'));

function clearKecFocus() {
  focusedKec = null;
  refreshKecLayer();
  refreshCaseLayers();
  document.getElementById('kecFocusChip').classList.remove('show');
}
document.getElementById('kecFocusChipClear').addEventListener('click', clearKecFocus);

/* ---------- Layer toggles ---------- */
document.getElementById('toggleKec').addEventListener('change', e => {
  e.target.checked ? kecLayer.addTo(map) : map.removeLayer(kecLayer);
  document.getElementById('legendFloat').classList.toggle('show', e.target.checked);
});
document.getElementById('toggleHeat').addEventListener('change', e => {
  e.target.checked ? heatLayer.addTo(map) : map.removeLayer(heatLayer);
});
document.getElementById('toggleDots').addEventListener('change', e => {
  e.target.checked ? map.addLayer(caseCluster) : map.removeLayer(caseCluster);
});
document.getElementById('legendFloat').classList.add('show');

/* ---------- Sektor UMKM: rak ikon horizontal ---------- */
function renderSektorStrip() {
  const wrap = document.getElementById('sektorStrip');
  wrap.innerHTML = sektorKeys.map(k => {
    const d = SEKTOR_DEFS[k];
    return `<button class="sektor-chip ${k === currentSektor ? 'active' : ''}" data-key="${k}" style="--chip-c:${d.color[3]}">
      <span class="chip-ico">${sektorIconSvg(k, 16)}</span>
      <span class="chip-lbl">${d.short}</span>
    </button>`;
  }).join('');
  wrap.querySelectorAll('.sektor-chip').forEach(btn => {
    btn.addEventListener('click', () => setSektor(btn.dataset.key));
  });
}

function setSektor(key) {
  if (!SEKTOR_DEFS[key]) return;
  currentSektor = key;
  document.querySelectorAll('.sektor-chip').forEach(b => b.classList.toggle('active', b.dataset.key === key));
  refreshKecLayer();
  refreshCaseLayers();
  renderLegend();
  renderStats();
  renderChart();
  renderSektorNote();
}

function renderSektorNote() {
  const def = sektorDef();
  const el = document.getElementById('sektorNote');
  el.innerHTML = def.isSample
    ? `<b>${def.label}</b> — data simulasi untuk mendemonstrasikan fitur multi-sektor UMKM. Ganti dengan data resmi Dinas Koperasi &amp; UKM / BPS bila tersedia.`
    : `<b>${def.label}</b> — data riil per kecamatan.`;
  el.classList.toggle('sample', !!def.isSample);
}

/* ---------- Legend ---------- */
function renderLegend() {
  const def = sektorDef();
  document.getElementById('legendTitle').textContent = `Kepadatan ${def.label}`;
  document.getElementById('legendUnit').textContent = def.unit;
  const scale = document.getElementById('legendScale');
  scale.innerHTML = def.color.map(c => `<div style="background:${c}"></div>`).join('');
  const b = def.breaks;
  const vals = document.getElementById('legendValues');
  vals.innerHTML = `<span>&lt;${fmt1(b[0])}</span><span>${fmt1(b[1])}</span><span>${fmt1(b[2])}</span><span>${fmt1(b[3])}</span><span>&ge;${fmt1(b[3])}</span>`;
}

/* ---------- Bottom sheet: statistik ---------- */
function renderStats() {
  const def = sektorDef();
  const feats = (CITY.kecamatan && CITY.kecamatan.features) || [];
  if (!feats.length) {
    document.getElementById('statStrip').innerHTML = `
      <div class="stat-tag" style="min-width:100%"><div class="num">—</div><div class="lbl">Belum ada data wilayah untuk kota ini</div></div>`;
    document.getElementById('titikCount').textContent = 'Belum ada data UMKM untuk kota ini';
    return;
  }
  const totalPop = feats.reduce((s, f) => s + (f.properties.jmlh_pddk || 0), 0);
  const totalKasus = feats.reduce((s, f) => s + sektorStat(f).kasus, 0);
  const avgIR = feats.reduce((s, f) => s + sektorStat(f).ir, 0) / feats.length;
  const totalTitik = currentCaseFeatures().length;

  const stats = [
    { num: fmt(totalKasus), lbl: `Total ${def.short}` },
    { num: fmt1(avgIR), lbl: `Kepadatan rata² ${def.unit}` },
    { num: fmt(totalPop), lbl: 'Populasi wilayah' },
    { num: fmt(totalTitik), lbl: 'Titik UMKM terpetakan' },
  ];
  document.getElementById('statStrip').innerHTML = stats.map(s => `
    <div class="stat-tag"><div class="num">${s.num}</div><div class="lbl">${s.lbl}</div></div>
  `).join('');
  document.getElementById('titikCount').textContent = fmt(totalTitik) + ' titik UMKM dipetakan';
}

/* ---------- Ranking chart ---------- */
let irChart = null;
function renderChart() {
  const def = sektorDef();
  const feats = (CITY.kecamatan && CITY.kecamatan.features) || [];
  const ranked = [...feats].sort((a, b) => sektorStat(b).ir - sektorStat(a).ir);
  const labels = ranked.map(f => f.properties.KECAMATAN);
  const data = ranked.map(f => sektorStat(f).ir);
  const colors = data.map(v => potensiColor(v));

  if (irChart) {
    irChart.data.labels = labels;
    irChart.data.datasets[0].data = data;
    irChart.data.datasets[0].backgroundColor = colors;
    irChart.options.plugins.tooltip.callbacks.label = c => ` ${c.raw.toFixed(2)} ${def.unit}`;
    irChart.update();
    return;
  }
  irChart = new Chart(document.getElementById('irChart'), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 5, barThickness: 12 }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw.toFixed(2)} ${def.unit}` } } },
      scales: {
        x: { grid: { color: '#efe6cd' }, ticks: { font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { font: { size: 10.5, family: 'Plus Jakarta Sans' } } }
      }
    }
  });
}

/* ---------- Unified search ---------- */
let searchIndex = [];
function buildSearchIndex() {
  const feats = (CITY.kecamatan && CITY.kecamatan.features) || [];
  searchIndex = feats.map(f => {
    const c = f.properties;
    const b = L.geoJSON(f).getBounds();
    return { type: 'kec', name: c.KECAMATAN, sub: c.KECAMATAN, bounds: b, layerRef: f };
  });
}

const input = document.getElementById('searchInput');
const suggestBox = document.getElementById('suggestBox');

input.addEventListener('input', () => {
  const q = input.value.trim().toLowerCase();
  if (!q) { suggestBox.classList.remove('show'); return; }
  const results = searchIndex.filter(i => i.name.toLowerCase().includes(q)).slice(0, 8);
  if (!results.length) { suggestBox.innerHTML = `<div class="suggest-item"><span class="sub">Tidak ditemukan</span></div>`; suggestBox.classList.add('show'); return; }
  suggestBox.innerHTML = results.map((r, idx) => `
    <div class="suggest-item" data-idx="${idx}">
      <span class="tag kec">Kec</span>
      <div><div class="nm">${r.name}</div><div class="sub">${fmt1(sektorStat(r.layerRef).ir)} ${sektorDef().unit}</div></div>
    </div>
  `).join('');
  suggestBox.classList.add('show');
  suggestBox.querySelectorAll('.suggest-item').forEach((el, idx) => {
    el.addEventListener('click', () => {
      const r = results[idx];
      input.value = r.name;
      suggestBox.classList.remove('show');
      collapseSheet();
      map.flyToBounds(r.bounds, { duration: 0.9, padding: [40, 40] });
      setTimeout(() => openKecDrawer(r.layerRef), 700);
    });
  });
});
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) suggestBox.classList.remove('show');
});

/* ---------- Bottom sheet: peek / expand + drag ---------- */
const sheet = document.getElementById('sheet');
const sheetHandle = document.getElementById('sheetHandle');
function setSheetState(state) { sheet.dataset.state = state; }
function collapseSheet() { if (window.innerWidth <= 760) setSheetState('peek'); }
sheetHandle.addEventListener('click', () => {
  setSheetState(sheet.dataset.state === 'expanded' ? 'peek' : 'expanded');
});
(function enableDrag() {
  let startY = null, startState = null;
  function onDown(y) { startY = y; startState = sheet.dataset.state; sheet.classList.add('dragging'); }
  function onMove(y) {
    if (startY === null) return;
    const dy = y - startY;
    if (dy < -30) setSheetState('expanded');
    else if (dy > 30) setSheetState('peek');
  }
  function onUp() { startY = null; sheet.classList.remove('dragging'); }
  sheetHandle.addEventListener('touchstart', e => onDown(e.touches[0].clientY), { passive: true });
  sheetHandle.addEventListener('touchmove', e => onMove(e.touches[0].clientY), { passive: true });
  sheetHandle.addEventListener('touchend', onUp);
  sheetHandle.addEventListener('pointerdown', e => onDown(e.clientY));
  window.addEventListener('pointermove', e => { if (startY !== null) onMove(e.clientY); });
  window.addEventListener('pointerup', onUp);
})();

/* ---------- City gallery (ganti kota) ---------- */
function renderCitySelector() {
  const wrap = document.getElementById('cityGalleryTrack');
  wrap.innerHTML = CITY_ORDER.map(key => {
    const c = window.CITY_DATA[key];
    if (!c) return '';
    const has = cityHasData(key);
    const isActive = key === currentCity;
    const badge = isActive ? 'Aktif' : (has ? 'Data tersedia' : 'Menunggu data');
    let totalUmkm = 0, totalKec = 0;
    if (has) {
      totalKec = c.kecamatan.features.length;
      totalUmkm = c.kecamatan.features.reduce((s, f) => {
        const diseases = f.properties.diseases || {};
        return s + Object.values(diseases).reduce((s2, v) => s2 + (v.kasus || 0), 0);
      }, 0);
    }
    return `<div class="city-card ${isActive ? 'active' : ''}" data-key="${key}" data-available="${has ? 1 : 0}">
      <div class="cc-badge ${has ? 'ok' : 'wait'}">${badge}</div>
      <div class="cc-mark">${sektorIconSvg('dagang', 20)}</div>
      <div class="cc-name">${c.label}</div>
      <div class="cc-sub">${c.province || ''}</div>
      ${has ? `<div class="cc-stats"><span><b>${totalKec}</b> kecamatan</span><span><b>${fmt(totalUmkm)}</b> UMKM</span></div>` : ''}
    </div>`;
  }).join('');
  wrap.querySelectorAll('.city-card[data-available="1"]').forEach(el => {
    el.addEventListener('click', () => {
      loadCity(el.dataset.key);
      document.getElementById('cityGallery').classList.remove('show');
    });
  });
}

function ensureEmptyStateEl() {
  let el = document.getElementById('emptyCityNote');
  if (!el) {
    el = document.createElement('div');
    el.id = 'emptyCityNote';
    el.className = 'legend-float';
    el.style.left = '16px';
    el.style.top = '128px';
    el.style.bottom = 'auto';
    el.style.maxWidth = '260px';
    el.innerHTML = `<div class="lt">Data belum tersedia</div>
      <p style="margin:0;font-size:11.5px;line-height:1.5;color:var(--ink-soft)">
        Batas kecamatan &amp; fasilitas untuk kota ini belum diunggah. Tambahkan file GeoJSON sesuai
        <code>data/cities/README_FORMAT.md</code>, atau jalankan <code>tools/convert_city.py</code>
        pada shapefile kamu.
      </p>`;
    document.body.appendChild(el);
  }
  return el;
}

function loadCity(key) {
  const data = window.CITY_DATA[key];
  if (!data) return;
  currentCity = key;
  CITY = data;
  focusedKec = null;
  document.getElementById('kecFocusChip').classList.remove('show');
  kecDrawer.classList.remove('show');

  document.getElementById('cityPillBtn').lastChild.textContent = ' ' + data.label.replace(/^Kota\s/, '').replace(/^DKI\s/, '');
  const sheetSub = document.getElementById('sheetSub');
  if (sheetSub) sheetSub.textContent = `${data.label} · pilih sektor UMKM, lihat sebaran usaha dan kepadatan per kecamatan.`;
  document.title = `Peta Kios UMKM — ${data.label}`;

  loadKecLayer(data.kecamatan);
  refreshCaseLayers();
  buildSearchIndex();
  renderStats();
  renderChart();
  renderLegend();
  renderSektorNote();
  renderCitySelector();

  const empty = ensureEmptyStateEl();
  empty.style.display = cityHasData(key) ? 'none' : 'block';

  map.flyTo(data.center, data.zoom, { duration: 0.6 });
}

/* ---------- Locate me ---------- */
let locateMarker = null;
document.getElementById('locateBtn').addEventListener('click', function () {
  if (!navigator.geolocation) return;
  this.classList.add('active');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    if (locateMarker) map.removeLayer(locateMarker);
    locateMarker = L.marker([latitude, longitude], {
      icon: L.divIcon({ className: '', html: '<div class="pulse-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
    }).addTo(map);
    map.flyTo([latitude, longitude], 15, { duration: 0.9 });
  }, () => { this.classList.remove('active'); alert('Tidak bisa mengakses lokasi. Izinkan akses lokasi di browser.'); });
});

/* ---------- Init ---------- */
renderSektorStrip();
loadCity(currentCity);
if (document.getElementById('toggleHeat').checked) heatLayer.addTo(map);
if (document.getElementById('toggleDots').checked) map.addLayer(caseCluster);
document.getElementById('cityPillBtn').addEventListener('click', () => {
  document.getElementById('cityGallery').classList.add('show');
});
document.getElementById('cityGalleryClose').addEventListener('click', () => {
  document.getElementById('cityGallery').classList.remove('show');
});
document.getElementById('cityGallery').addEventListener('click', e => {
  if (e.target.id === 'cityGallery') document.getElementById('cityGallery').classList.remove('show');
});
