/* ============================================================
   PetaSekolah — App Logic
   ============================================================ */

const JENJANG_COLORS = {
  "TK/PAUD":          "#FFB4C6",
  "SD/MI":             "#FFD59E",
  "SMP/MTs":           "#B8E8C4",
  "SMA/MA":            "#A8D8F0",
  "SMK":               "#C9B8F0",
  "Perguruan Tinggi":  "#F0C9E8",
  "Kursus/Bahasa":     "#D9D9E3",
  "Lainnya":           "#D9D9E3"
};

const JENJANG_ORDER = ["TK/PAUD","SD/MI","SMP/MTs","SMA/MA","SMK","Perguruan Tinggi","Kursus/Bahasa","Lainnya"];

const CITY_COLORS = {
  "Jakarta": "#A8D8F0",
  "Padang": "#FFD59E",
  "Jambi": "#B8E8C4",
  "Makassar": "#F0C9E8"
};

const FACILITY_JENIS_ORDER = ["Kesehatan", "Peribadatan", "Keamanan"];
const FACILITY_COLORS = {
  "Kesehatan":   "#FF8FA3",
  "Peribadatan": "#9BB8FF",
  "Keamanan":    "#6E6B82"
};
const FACILITY_ICONS = {
  "Kesehatan":   "🏥",
  "Peribadatan": "🛐",
  "Keamanan":    "🚓"
};

let activeCity = "all";
let activeJenjang = new Set(JENJANG_ORDER);
let activeFacilityJenis = new Set(FACILITY_JENIS_ORDER);
let facilitiesVisible = false;
let boundariesVisible = true;

/* ---------- MAP INIT ---------- */
const map = L.map('map', {
  zoomControl: false,
  minZoom: 4,
  maxZoom: 19,
  preferCanvas: true
}).setView([-2.5, 108], 5);

L.control.zoom({ position: 'bottomright' }).addTo(map);

// Pastel "Google Maps"-like basemap (CARTO Voyager: soft, colorful but light)
const baseLayerLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  maxZoom: 19
}).addTo(map);

// Alternate dark basemap for the basemap toggle feature
const baseLayerDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  maxZoom: 19
});
let darkBasemap = false;

/* ---------- BOUNDARIES (batas kecamatan, ditampilkan sebagai konteks wilayah) ---------- */
const boundariesLayer = L.geoJSON(BOUNDARIES_DATA, {
  style: () => ({
    color: '#8FB3F5',
    weight: 1,
    fillColor: '#8FB3F5',
    fillOpacity: 0.05
  }),
  onEachFeature: (feature, layer) => {
    const p = feature.properties;
    const popupHtml = `
      <div class="popup-title">${p.kecamatan || '-'}</div>
      <span class="popup-tag" style="background:${CITY_COLORS[p.kota]||'#ccc'}33;color:${shade(CITY_COLORS[p.kota]||'#999999')}">${p.kota}</span>
      <div class="popup-row">${p.kab_kota ? p.kab_kota + ', ' : ''}${p.provinsi || ''}</div>
    `;
    layer.bindPopup(popupHtml);
    layer.on('mouseover', (e) => {
      layer.setStyle({ weight: 2.5, fillOpacity: 0.18 });
      showHoverCard(e.originalEvent, `
        <b>${p.kecamatan || '-'}</b>
        ${p.kab_kota ? p.kab_kota + ', ' : ''}${p.provinsi || ''}
      `);
    });
    layer.on('mousemove', (e) => moveHoverCard(e.originalEvent));
    layer.on('mouseout', () => {
      layer.setStyle({ weight: 1, fillOpacity: 0.05 });
      hideHoverCard();
    });
  }
}).addTo(map);

function showHoverCard(evt, html){
  const el = document.getElementById('hoverCard');
  el.innerHTML = html;
  el.classList.remove('hidden');
  moveHoverCard(evt);
}
function moveHoverCard(evt){
  const el = document.getElementById('hoverCard');
  const rect = document.querySelector('.map-area').getBoundingClientRect();
  el.style.left = (evt.clientX - rect.left + 14) + 'px';
  el.style.top = (evt.clientY - rect.top + 10) + 'px';
}
function hideHoverCard(){
  document.getElementById('hoverCard').classList.add('hidden');
}

/* ---------- SCHOOL MARKERS ---------- */
const clusterGroup = L.markerClusterGroup({
  maxClusterRadius: 46,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false
});

function pinIcon(jenjang){
  const color = JENJANG_COLORS[jenjang] || JENJANG_COLORS['Lainnya'];
  return L.divIcon({
    className: '',
    html: `<div class="school-pin" style="background:${color}"><span>🏫</span></div>`,
    iconSize: [22,22],
    iconAnchor: [11,20],
    popupAnchor: [0,-18]
  });
}

const allMarkers = []; // {marker, feature}

SCHOOLS_DATA.features.forEach(f => {
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties;
  const marker = L.marker([lat, lon], { icon: pinIcon(p.jenjang) });
  const color = JENJANG_COLORS[p.jenjang] || JENJANG_COLORS['Lainnya'];
  marker.bindPopup(`
    <div class="popup-title">${p.name}</div>
    <span class="popup-tag" style="background:${color}22;color:${shade(color)}">${p.jenjang}</span>
    <div class="popup-row">Kota: <b>${p.kota}</b></div>
    <div class="popup-row">Kategori OSM: ${p.amenity || '-'}</div>
  `);
  allMarkers.push({ marker, feature: f });
});

function shade(hex){
  // darken pastel hex a bit for readable text
  const num = parseInt(hex.slice(1),16);
  let r=(num>>16)-70, g=((num>>8)&0xff)-70, b=(num&0xff)-70;
  r=Math.max(0,r); g=Math.max(0,g); b=Math.max(0,b);
  return `rgb(${r},${g},${b})`;
}

function refreshMarkers(){
  clusterGroup.clearLayers();
  const visible = allMarkers.filter(({feature}) => {
    const p = feature.properties;
    if (activeCity !== 'all' && p.kota !== activeCity) return false;
    if (!activeJenjang.has(p.jenjang)) return false;
    return true;
  });
  visible.forEach(({marker}) => clusterGroup.addLayer(marker));
  if (!map.hasLayer(clusterGroup)) clusterGroup.addTo(map);
  return visible.length;
}
refreshMarkers();

/* ---------- FACILITY MARKERS (fasilitas umum: kesehatan, peribadatan, keamanan) ---------- */
const facilityClusterGroup = L.markerClusterGroup({
  maxClusterRadius: 46,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false
});

function facilityIcon(jenis){
  const color = FACILITY_COLORS[jenis] || '#999';
  const icon = FACILITY_ICONS[jenis] || '📍';
  return L.divIcon({
    className: '',
    html: `<div class="facility-pin" style="background:${color}"><span>${icon}</span></div>`,
    iconSize: [18,18],
    iconAnchor: [9,17],
    popupAnchor: [0,-15]
  });
}

const allFacilityMarkers = []; // {marker, feature}

(typeof FACILITIES_DATA !== 'undefined' ? FACILITIES_DATA.features : []).forEach(f => {
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties;
  const marker = L.marker([lat, lon], { icon: facilityIcon(p.jenis) });
  const color = FACILITY_COLORS[p.jenis] || '#999';
  marker.bindPopup(`
    <div class="popup-title">${p.name}</div>
    <span class="popup-tag" style="background:${color}22;color:${shade(color)}">${p.subtype}</span>
    <div class="popup-row">Kategori: <b>${p.jenis}</b></div>
    <div class="popup-row">Kota: <b>${p.kota}</b></div>
    <div class="popup-row" style="margin-top:4px;font-size:10.5px">Sumber: OpenStreetMap (HOTOSM export)</div>
  `);
  allFacilityMarkers.push({ marker, feature: f });
});

function getVisibleFacilities(){
  return allFacilityMarkers.filter(({feature}) => {
    const p = feature.properties;
    if (activeCity !== 'all' && p.kota !== activeCity) return false;
    if (!activeFacilityJenis.has(p.jenis)) return false;
    return true;
  });
}

function refreshFacilityMarkers(){
  facilityClusterGroup.clearLayers();
  const visible = getVisibleFacilities();
  visible.forEach(({marker}) => facilityClusterGroup.addLayer(marker));
  if (facilitiesVisible && !map.hasLayer(facilityClusterGroup)) facilityClusterGroup.addTo(map);
  return visible.length;
}

/* ---------- HEATMAP (kepadatan sekolah) ---------- */
let heatLayer = L.heatLayer([], { radius: 20, blur: 24, maxZoom: 16, gradient: { 0.3:'#C9EFD6', 0.6:'#FFD3A8', 1:'#F0A8D8' } });

function refreshHeatLayer(){
  const visible = getVisibleFeatures();
  const pts = visible.map(({feature}) => {
    const [lon, lat] = feature.geometry.coordinates;
    return [lat, lon, 0.5];
  });
  heatLayer.setLatLngs(pts);
}

/* ---------- BUFFER (jangkauan sekolah & fasilitas umum) ---------- */
let bufferLayer = L.layerGroup();
let bufferRadius = 800;
let bufferIncludeSchools = true;
let bufferIncludeFacilities = false;
const BUFFER_CAP = 400; // batasi jumlah lingkaran demi performa

function getVisibleFeatures(){
  return allMarkers.filter(({feature}) => {
    const p = feature.properties;
    if (activeCity !== 'all' && p.kota !== activeCity) return false;
    if (!activeJenjang.has(p.jenjang)) return false;
    return true;
  });
}

function refreshBufferLayer(){
  bufferLayer.clearLayers();

  let points = [];
  if (bufferIncludeSchools) {
    points = points.concat(getVisibleFeatures().map(({feature}) => ({
      coords: feature.geometry.coordinates,
      color: JENJANG_COLORS[feature.properties.jenjang] || JENJANG_COLORS['Lainnya']
    })));
  }
  if (bufferIncludeFacilities) {
    points = points.concat(getVisibleFacilities().map(({feature}) => ({
      coords: feature.geometry.coordinates,
      color: FACILITY_COLORS[feature.properties.jenis] || '#999'
    })));
  }

  // Prioritaskan titik yang sedang terlihat di layar peta, bukan sekadar N pertama
  // dari data — supaya buffer selalu tampak di area yang sedang dilihat pengguna.
  const bounds = map.getBounds().pad(0.3);
  const inView = [];
  const outView = [];
  points.forEach(pt => {
    const [lon, lat] = pt.coords;
    (bounds.contains([lat, lon]) ? inView : outView).push(pt);
  });
  const subset = inView.length >= BUFFER_CAP
    ? inView.slice(0, BUFFER_CAP)
    : inView.concat(outView.slice(0, BUFFER_CAP - inView.length));

  subset.forEach(({coords, color}) => {
    const [lon, lat] = coords;
    L.circle([lat, lon], {
      radius: bufferRadius, color: shade(color), weight: 1, opacity: 0.45,
      fillColor: color, fillOpacity: 0.12
    }).addTo(bufferLayer);
  });

  const hint = document.getElementById('bufferHint');
  if (hint) {
    const radiusLabel = bufferRadius >= 1000 ? (bufferRadius/1000) + ' km' : bufferRadius + ' m';
    const parts = [];
    if (bufferIncludeSchools) parts.push('sekolah');
    if (bufferIncludeFacilities) parts.push('fasilitas umum');
    const sourceLabel = parts.length ? parts.join(' & ') : 'titik (pilih sumber data di bawah)';
    hint.textContent = points.length > BUFFER_CAP
      ? `Menampilkan buffer untuk ${subset.length} dari ${points.length} titik ${sourceLabel} pada area peta saat ini (dibatasi agar peta tetap ringan — geser/zoom peta atau persempit filter untuk melihat area lain).`
      : `Menampilkan buffer radius ${radiusLabel} untuk ${points.length} titik ${sourceLabel}.`;
  }
}

map.on('moveend', () => {
  if (document.getElementById('toggleBuffer').checked) refreshBufferLayer();
});

/* ---------- FILTER PANEL (jenjang) ---------- */
const jenjangFiltersEl = document.getElementById('jenjangFilters');
JENJANG_ORDER.forEach(j => {
  if (j === 'Lainnya') return; // fold Lainnya silently to keep UI tidy, still counted
  const row = document.createElement('label');
  row.className = 'filter-row';
  row.innerHTML = `
    <input type="checkbox" checked data-jenjang="${j}">
    <span class="swatch" style="background:${JENJANG_COLORS[j]}"></span>
    <span>${j}</span>
    <span class="count" id="count-${cssSafe(j)}">0</span>
  `;
  jenjangFiltersEl.appendChild(row);
});

function cssSafe(s){ return s.replace(/[^a-zA-Z0-9]/g,''); }

jenjangFiltersEl.addEventListener('change', (e) => {
  const j = e.target.dataset.jenjang;
  if (!j) return;
  if (e.target.checked) activeJenjang.add(j); else activeJenjang.delete(j);
  update();
});

/* ---------- FACILITY FILTER PANEL (jenis fasilitas) ---------- */
const facilityFiltersEl = document.getElementById('facilityFilters');
FACILITY_JENIS_ORDER.forEach(j => {
  const row = document.createElement('label');
  row.className = 'filter-row';
  row.innerHTML = `
    <input type="checkbox" checked data-facility-jenis="${j}">
    <span class="swatch" style="background:${FACILITY_COLORS[j]}"></span>
    <span>${FACILITY_ICONS[j]} ${j}</span>
    <span class="count" id="count-fac-${cssSafe(j)}">0</span>
  `;
  facilityFiltersEl.appendChild(row);
});

facilityFiltersEl.addEventListener('change', (e) => {
  const j = e.target.dataset.facilityJenis;
  if (!j) return;
  if (e.target.checked) activeFacilityJenis.add(j); else activeFacilityJenis.delete(j);
  update();
});

document.getElementById('toggleFacilities').addEventListener('change', (e) => {
  facilitiesVisible = e.target.checked;
  document.getElementById('legendCard3').classList.toggle('hidden', !facilitiesVisible);
  if (facilitiesVisible) {
    refreshFacilityMarkers();
    facilityClusterGroup.addTo(map);
  } else {
    map.removeLayer(facilityClusterGroup);
  }
});

/* ---------- CITY CHIPS ---------- */
document.getElementById('cityChips').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  activeCity = btn.dataset.city;
  if (activeCity !== 'all' && CITY_STATS[activeCity]) {
    map.flyTo(CITY_STATS[activeCity].center, 12, { duration: 0.9 });
  } else {
    map.flyTo([-2.5,108], 5, { duration: 0.9 });
  }
  update();
});

/* ---------- LEGEND ---------- */
const legendBody = document.getElementById('legendBody');
JENJANG_ORDER.filter(j=>j!=='Lainnya').forEach(j => {
  const row = document.createElement('div');
  row.className = 'legend-row';
  row.innerHTML = `<span class="swatch" style="background:${JENJANG_COLORS[j]}"></span>${j}`;
  legendBody.appendChild(row);
});
document.getElementById('legendToggle').addEventListener('click', (e) => {
  legendBody.classList.toggle('hidden');
  e.target.textContent = legendBody.classList.contains('hidden') ? '+' : '−';
});

/* ---------- LEGEND 3: fasilitas umum ---------- */
const legendBody3 = document.getElementById('legendBody3');
FACILITY_JENIS_ORDER.forEach(j => {
  const row = document.createElement('div');
  row.className = 'legend-row';
  row.innerHTML = `<span class="swatch" style="background:${FACILITY_COLORS[j]}"></span>${FACILITY_ICONS[j]} ${j}`;
  legendBody3.appendChild(row);
});
document.getElementById('legendToggle3').addEventListener('click', (e) => {
  legendBody3.classList.toggle('hidden');
  e.target.textContent = legendBody3.classList.contains('hidden') ? '+' : '−';
});

/* ---------- FAB CONTROLS ---------- */
const toggleBoundariesBtn = document.getElementById('toggleBoundaries');
toggleBoundariesBtn.classList.add('on');
toggleBoundariesBtn.addEventListener('click', () => {
  boundariesVisible = !boundariesVisible;
  if (boundariesVisible) { boundariesLayer.addTo(map); toggleBoundariesBtn.classList.add('on'); }
  else { map.removeLayer(boundariesLayer); toggleBoundariesBtn.classList.remove('on'); }
});

document.getElementById('locateBtn').addEventListener('click', () => {
  map.locate({ setView: true, maxZoom: 13 });
});
map.on('locationfound', (e) => showNearestSchools(e.latlng));

document.getElementById('toggleBasemap').addEventListener('click', (e) => {
  darkBasemap = !darkBasemap;
  if (darkBasemap) {
    map.removeLayer(baseLayerLight);
    baseLayerDark.addTo(map);
    baseLayerDark.bringToBack();
  } else {
    map.removeLayer(baseLayerDark);
    baseLayerLight.addTo(map);
    baseLayerLight.bringToBack();
  }
  e.currentTarget.classList.toggle('on', darkBasemap);
});

document.getElementById('toggleHeat').addEventListener('change', e => {
  if (e.target.checked) { refreshHeatLayer(); heatLayer.addTo(map); }
  else { map.removeLayer(heatLayer); }
});
document.getElementById('toggleBuffer').addEventListener('change', e => {
  document.getElementById('bufferRadiusRow').classList.toggle('show', e.target.checked);
  document.getElementById('bufferSourcesRow').classList.toggle('show', e.target.checked);
  if (e.target.checked) { refreshBufferLayer(); bufferLayer.addTo(map); }
  else { map.removeLayer(bufferLayer); }
});
document.getElementById('bufferRadius').addEventListener('change', e => {
  bufferRadius = parseInt(e.target.value, 10);
  if (document.getElementById('toggleBuffer').checked) { refreshBufferLayer(); }
});
document.getElementById('bufferSrcSchools').addEventListener('change', e => {
  bufferIncludeSchools = e.target.checked;
  if (document.getElementById('toggleBuffer').checked) { refreshBufferLayer(); }
});
document.getElementById('bufferSrcFacilities').addEventListener('change', e => {
  bufferIncludeFacilities = e.target.checked;
  if (document.getElementById('toggleBuffer').checked) { refreshBufferLayer(); }
});

document.getElementById('resetView').addEventListener('click', () => {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.chip-all').classList.add('active');
  activeCity = 'all';
  activeJenjang = new Set(JENJANG_ORDER);
  jenjangFiltersEl.querySelectorAll('input').forEach(i => i.checked = true);
  activeFacilityJenis = new Set(FACILITY_JENIS_ORDER);
  facilityFiltersEl.querySelectorAll('input').forEach(i => i.checked = true);
  facilitiesVisible = false;
  document.getElementById('toggleFacilities').checked = false;
  document.getElementById('legendCard3').classList.add('hidden');
  if (map.hasLayer(facilityClusterGroup)) map.removeLayer(facilityClusterGroup);
  bufferIncludeSchools = true;
  bufferIncludeFacilities = false;
  document.getElementById('bufferSrcSchools').checked = true;
  document.getElementById('bufferSrcFacilities').checked = false;
  if (document.getElementById('toggleBuffer').checked) {
    document.getElementById('toggleBuffer').checked = false;
    document.getElementById('bufferRadiusRow').classList.remove('show');
    document.getElementById('bufferSourcesRow').classList.remove('show');
    map.removeLayer(bufferLayer);
  }
  map.flyTo([-2.5,108], 5, { duration: 0.9 });
  update();
});

/* ---------- FITUR: SEKOLAH TERDEKAT ---------- */
let originMarker = null;
const originIcon = L.divIcon({
  className: '',
  html: `<div class="origin-pin"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

function formatDistance(m){
  return m >= 1000 ? (m/1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m) + ' m';
}

function showNearestSchools(latlng){
  if (originMarker) map.removeLayer(originMarker);
  originMarker = L.marker(latlng, { icon: originIcon, zIndexOffset: 1000 }).addTo(map);

  const pool = getVisibleFeatures();
  const ranked = pool
    .map(({ marker, feature }) => ({ marker, feature, dist: latlng.distanceTo(marker.getLatLng()) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 6);

  renderNearestList(ranked);

  if (window.innerWidth <= 880) document.getElementById('sidebar').classList.add('open');
}

function renderNearestList(ranked){
  const el = document.getElementById('nearestList');
  el.innerHTML = '';
  if (ranked.length === 0) {
    el.innerHTML = `<div class="nearest-empty">Tidak ada sekolah pada filter saat ini di sekitar titik tersebut.</div>`;
    return;
  }
  ranked.forEach(({ marker, feature, dist }, i) => {
    const p = feature.properties;
    const color = JENJANG_COLORS[p.jenjang] || JENJANG_COLORS['Lainnya'];
    const row = document.createElement('div');
    row.className = 'nearest-item';
    row.innerHTML = `
      <span class="nearest-rank">${i + 1}</span>
      <span class="nearest-info">
        <span class="nearest-name">${p.name}</span>
        <span class="nearest-meta"><span class="swatch" style="background:${color}"></span>${p.jenjang} &middot; ${p.kota}</span>
      </span>
      <span class="nearest-dist">${formatDistance(dist)}</span>
    `;
    row.addEventListener('click', () => {
      map.flyTo(marker.getLatLng(), 16, { duration: 0.8 });
      setTimeout(() => marker.openPopup(), 850);
    });
    el.appendChild(row);
  });
}

map.on('click', (e) => {
  if (originMarker && e.latlng.distanceTo(originMarker.getLatLng()) < 1) return;
  showNearestSchools(e.latlng);
});

/* ---------- SEARCH ---------- */
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (q.length < 2) { searchResults.classList.add('hidden'); return; }

  const schoolMatches = allMarkers
    .filter(({feature}) => (feature.properties.name || '').toLowerCase().includes(q))
    .slice(0, 20)
    .map(({feature, marker}) => ({ type: 'sekolah', feature, marker }));

  const facilityMatches = allFacilityMarkers
    .filter(({feature}) => (feature.properties.name || '').toLowerCase().includes(q))
    .slice(0, 15)
    .map(({feature, marker}) => ({ type: 'fasilitas', feature, marker }));

  const kecMatches = boundariesLayer.getLayers()
    .filter(layer => (layer.feature.properties.kecamatan || '').toLowerCase().includes(q))
    .slice(0, 10)
    .map(layer => ({ type: 'kecamatan', feature: layer.feature, layer }));

  const matches = [...kecMatches, ...schoolMatches, ...facilityMatches].slice(0, 30);
  searchResults.innerHTML = '';
  if (matches.length === 0) {
    searchResults.innerHTML = `<div class="search-empty">Tidak ditemukan sekolah atau kecamatan dengan nama tersebut.</div>`;
  } else {
    matches.forEach(m => {
      const p = m.feature.properties;
      const item = document.createElement('div');
      item.className = 'search-item';
      if (m.type === 'sekolah') {
        const color = JENJANG_COLORS[p.jenjang] || JENJANG_COLORS['Lainnya'];
        item.innerHTML = `<span>${p.name}<br><small style="color:#8A86A0">${p.kota}</small></span>
          <span class="tag" style="background:${color}55">${p.jenjang}</span>`;
        item.addEventListener('click', () => {
          map.flyTo(m.marker.getLatLng(), 16, { duration: 0.8 });
          setTimeout(() => m.marker.openPopup(), 850);
          searchResults.classList.add('hidden');
          searchInput.value = p.name;
        });
      } else if (m.type === 'fasilitas') {
        const color = FACILITY_COLORS[p.jenis] || '#999';
        item.innerHTML = `<span>${p.name}<br><small style="color:#8A86A0">${p.subtype} &middot; ${p.kota}</small></span>
          <span class="tag" style="background:${color}55">${FACILITY_ICONS[p.jenis]}</span>`;
        item.addEventListener('click', () => {
          if (!facilitiesVisible) {
            facilitiesVisible = true;
            document.getElementById('toggleFacilities').checked = true;
            document.getElementById('legendCard3').classList.remove('hidden');
            refreshFacilityMarkers();
            facilityClusterGroup.addTo(map);
          }
          map.flyTo(m.marker.getLatLng(), 16, { duration: 0.8 });
          setTimeout(() => m.marker.openPopup(), 850);
          searchResults.classList.add('hidden');
          searchInput.value = p.name;
        });
      } else {
        item.innerHTML = `<span>${p.kecamatan}<br><small style="color:#8A86A0">${p.kab_kota || p.kota}</small></span>
          <span class="tag" style="background:${(CITY_COLORS[p.kota]||'#ccc')}55">Kecamatan</span>`;
        item.addEventListener('click', () => {
          const bounds = m.layer.getBounds();
          map.flyToBounds(bounds, { duration: 0.9, padding: [40,40] });
          setTimeout(() => m.layer.openPopup(), 850);
          searchResults.classList.add('hidden');
          searchInput.value = p.kecamatan;
        });
      }
      searchResults.appendChild(item);
    });
  }
  searchResults.classList.remove('hidden');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) searchResults.classList.add('hidden');
});

/* ---------- MOBILE MENU ---------- */
document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});


/* ---------- STATS + UPDATE LOOP ---------- */
function update(){
  const visibleCount = refreshMarkers();
  const visibleFacilityCount = refreshFacilityMarkers();
  if (document.getElementById('toggleHeat').checked) refreshHeatLayer();
  if (document.getElementById('toggleBuffer').checked) refreshBufferLayer();

  document.getElementById('statTotalFasilitas').textContent = visibleFacilityCount.toLocaleString('id-ID');

  // facility jenis counts in filter list
  const facCounts = {};
  FACILITY_JENIS_ORDER.forEach(j => facCounts[j] = 0);
  allFacilityMarkers.forEach(({feature}) => {
    const p = feature.properties;
    if (activeCity !== 'all' && p.kota !== activeCity) return;
    facCounts[p.jenis]++;
  });
  FACILITY_JENIS_ORDER.forEach(j => {
    const el = document.getElementById(`count-fac-${cssSafe(j)}`);
    if (el) el.textContent = facCounts[j].toLocaleString('id-ID');
  });

  // stat cards
  document.getElementById('statTotalSekolah').textContent = visibleCount.toLocaleString('id-ID');

  const kecCount = activeCity === 'all'
    ? BOUNDARIES_DATA.features.length
    : BOUNDARIES_DATA.features.filter(f => f.properties.kota === activeCity).length;
  document.getElementById('statKecamatan').textContent = kecCount.toLocaleString('id-ID');

  // jenjang counts in filter list
  const counts = {};
  JENJANG_ORDER.forEach(j => counts[j] = 0);
  allMarkers.forEach(({feature}) => {
    const p = feature.properties;
    if (activeCity !== 'all' && p.kota !== activeCity) return;
    counts[p.jenjang]++;
  });
  JENJANG_ORDER.forEach(j => {
    const el = document.getElementById(`count-${cssSafe(j)}`);
    if (el) el.textContent = counts[j] + (j==='Lainnya' ? counts['Kursus/Bahasa'] : 0);
  });
}

update();
