/* =========================================================
   PETA SEBARAN TOKO & BATAS WILAYAH — Web GIS
   Diekspor dari proyek QGIS (.qmd) ke HTML + JS statis
   ========================================================= */

const CITIES = {
  jambi:     { label: "Kota Jambi",        code: "JMB", center: [-1.6204, 103.6031], zoom: 12 },
  padang:    { label: "Kota Padang",       code: "PDG", center: [-0.9364, 100.3315], zoom: 12 },
  yogyakarta:{ label: "Kota Yogyakarta",   code: "YGY", center: [-7.8033, 110.3749], zoom: 12 },
  surabaya:  { label: "Kota Surabaya",     code: "SBY", center: [-7.2746, 112.7192], zoom: 11 },
  makassar:  { label: "Kota Makassar",     code: "MKS", center: [-5.1196, 119.4026], zoom: 12 },
};

// Macro-category mapping so the ~90 raw OSM shop tags become a readable legend
const KATEGORI = [
  { id: "retail",   label: "Retail & Swalayan", color: "#c9922e", emoji: "🛒",
    tags: ["supermarket","convenience","mall","department_store","kiosk","variety_store","general","wholesale","yes"] },
  { id: "kuliner",  label: "Makanan & Minuman", color: "#b5573d", emoji: "🍽️",
    tags: ["bakery","coffee","greengrocer","butcher","deli","confectionery","seafood","alcohol","beverages","chocolate","farm","food"] },
  { id: "fashion",  label: "Pakaian & Fashion", color: "#7a6fd1", emoji: "👗",
    tags: ["clothes","shoes","boutique","fashion","fabric","tailor","bag","jewelry","watches"] },
  { id: "otomotif", label: "Otomotif", color: "#3f8f82", emoji: "🚗",
    tags: ["car","motorcycle","motorcycle_repair","car_repair","car_parts","tyres","fuel"] },
  { id: "kecantikan", label: "Kecantikan & Kesehatan", color: "#d488a8", emoji: "💇",
    tags: ["beauty","hairdresser","massage","cosmetics","chemist","medical_supply","optician"] },
  { id: "elektronik", label: "Elektronik & Komputer", color: "#5b8ac9", emoji: "💻",
    tags: ["electronics","computer","mobile_phone","hifi","appliance"] },
  { id: "jasa",     label: "Jasa & Lainnya", color: "#8aa06d", emoji: "🧰",
    tags: ["laundry","copyshop","travel_agency","books","furniture","hardware","florist","outdoor","stationery","gift","toys","sports","pet","bicycle","doityourself","houseware","interior_decoration"] },
];
const KATEGORI_LAIN = { id: "lain", label: "Lainnya", color: "#9fb0a3", emoji: "📍" };
function kategoriOf(jenis){
  return KATEGORI.find(k => k.tags.includes(jenis)) || KATEGORI_LAIN;
}

// -------- shop icon per kategori (divIcon, bukan bulatan polos) --------
const shopIconCache = {};
function shopIcon(kat){
  if (shopIconCache[kat.id]) return shopIconCache[kat.id];
  const icon = L.divIcon({
    className: "shop-pin-wrap",
    html: `<div class="shop-pin" style="background:${kat.color}"><span>${kat.emoji}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
  shopIconCache[kat.id] = icon;
  return icon;
}

// -------- choropleth kepadatan toko per wilayah --------
const DENSITY_COLORS = ["#233b2e", "#3f8f82", "#c9922e", "#d4823f", "#b5573d"];

// Ray-casting point-in-polygon, mendukung Polygon & MultiPolygon (dengan lubang/hole)
function pointInRing(pt, ring){
  let inside = false;
  for (let i=0, j=ring.length-1; i<ring.length; j=i++){
    const xi=ring[i][0], yi=ring[i][1];
    const xj=ring[j][0], yj=ring[j][1];
    const intersect = ((yi>pt[1]) !== (yj>pt[1])) &&
      (pt[0] < (xj-xi)*(pt[1]-yi)/(yj-yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointInPolygonCoords(pt, polygonCoords){
  if (!pointInRing(pt, polygonCoords[0])) return false;
  for (let k=1; k<polygonCoords.length; k++){
    if (pointInRing(pt, polygonCoords[k])) return false; // jatuh di lubang polygon
  }
  return true;
}
function geometryBBox(geometry){
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  polys.forEach(poly => poly.forEach(ring => ring.forEach(([x,y])=>{
    if (x<minX) minX=x; if (x>maxX) maxX=x;
    if (y<minY) minY=y; if (y>maxY) maxY=y;
  })));
  return [minX, minY, maxX, maxY];
}
function pointInGeometry(pt, geometry, bbox){
  if (pt[0]<bbox[0] || pt[0]>bbox[2] || pt[1]<bbox[1] || pt[1]>bbox[3]) return false;
  if (geometry.type === "Polygon") return pointInPolygonCoords(pt, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(poly => pointInPolygonCoords(pt, poly));
  return false;
}

// Hitung otomatis berapa titik toko yang jatuh di dalam tiap poligon wilayah
function computeShopDensity(boundaryGeojson, shopFeatures){
  const points = shopFeatures.map(f => f.geometry.coordinates); // [lng,lat]
  boundaryGeojson.features.forEach(feature=>{
    const bbox = geometryBBox(feature.geometry);
    let count = 0;
    for (const pt of points){
      if (pointInGeometry(pt, feature.geometry, bbox)) count++;
    }
    feature.properties._tokoCount = count;
  });
}

// Breakpoint kuantil (5 kelas) dari kumpulan angka
function computeBreaks(values){
  const sorted = [...values].sort((a,b)=>a-b);
  const q = p=>{
    const pos = (sorted.length-1) * p;
    const base = Math.floor(pos), rest = pos - base;
    return sorted[base+1] !== undefined ? sorted[base] + rest*(sorted[base+1]-sorted[base]) : sorted[base];
  };
  return [0, 0.2, 0.4, 0.6, 0.8, 1].map(q);
}
function densityColor(count, breaks){
  for (let i=0; i<4; i++){
    if (count <= breaks[i+1]) return DENSITY_COLORS[i];
  }
  return DENSITY_COLORS[4];
}
function buildDensityLegend(breaks){
  const el = document.getElementById("density-legend");
  if (!el) return;
  const items = DENSITY_COLORS.map((color, i)=>{
    const lo = Math.round(breaks[i]);
    const hi = Math.round(breaks[i+1]);
    const range = i===4 ? `${lo}+` : (lo===hi ? `${lo}` : `${lo}–${hi}`);
    return `<div class="density-legend-item"><span class="sw" style="background:${color}"></span><span>${range} toko</span></div>`;
  }).join("");
  el.innerHTML = `<div class="density-legend-title">Kepadatan Toko / Wilayah</div><div class="density-legend-scale">${items}</div>`;
}

// -------- state --------
let map, boundaryLayer, clusterLayer, heatLayer, bufferLayer, currentCity = null;
let baseLayerDark, baseLayerSat, baseLabelsLayer, densityLegendControl;
let currentShopFeatures = [];
let activeKategori = new Set(KATEGORI.map(k=>k.id).concat(["lain"]));
let showBoundary = true, showShops = true, showHeat = false, showBuffer = false;
let bufferRadius = 250;
let kategoriChart = null;

let measureActive = false, measurePoints = [], measureLayerGroup = null;
let userLocMarker = null;

// -------- init map --------
function initMap(){
  map = L.map("map", { zoomControl:false, minZoom:3, maxZoom:19 })
    .setView([-2.5, 108], 5);

  L.control.zoom({ position:"bottomright" }).addTo(map);

  baseLayerDark = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd", maxZoom: 19
  });

  baseLayerSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxZoom: 19
  });

  baseLabelsLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, zIndex: 5
  });

  baseLayerDark.addTo(map);

  map.on("mousemove", e=>{
    document.getElementById("st-coords").innerHTML =
      `lon <b>${e.latlng.lng.toFixed(5)}</b> &nbsp; lat <b>${e.latlng.lat.toFixed(5)}</b>`;
  });
  map.on("zoomend", ()=>{
    document.getElementById("st-zoom").innerHTML = `zoom <b>${map.getZoom()}</b>`;
  });

  measureLayerGroup = L.layerGroup().addTo(map);
  map.on("click", onMapClickForMeasure);

  densityLegendControl = L.control({ position: "bottomleft" });
  densityLegendControl.onAdd = function(){
    const div = L.DomUtil.create("div", "density-legend");
    div.id = "density-legend";
    return div;
  };
  densityLegendControl.addTo(map);
}

// -------- data loading (embedded JS vars, no fetch) --------
function loadCity(key){
  if (key === currentCity) return;
  currentCity = key;

  document.querySelectorAll(".city-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.city === key);
  });

  const start = performance.now();
  toggleLoading(true, `memuat wilayah ${CITIES[key].label}…`);

  const boundary = window[`DATA_${key.toUpperCase()}_BOUNDARY`];
  const shops = window[`DATA_${key.toUpperCase()}_SHOP`];

  if (!boundary || !shops){
    finishLoading(start);
    alert(`Data untuk "${key}" tidak ditemukan. Pastikan file data_js/data.js ikut ter-load.`);
    return;
  }

  clearMeasure();
  clearNearest();

  try {
    currentShopFeatures = shops.features;
    computeShopDensity(boundary, currentShopFeatures);
    renderBoundary(boundary, key);
    buildKategoriList();
    buildChart();
    refreshShopLayers();
    updateInfoPanel(null, key);

    const c = CITIES[key];
    map.flyTo(c.center, c.zoom, { duration: 1.1 });

    document.getElementById("st-count").innerHTML =
      `<b>${boundary.features.length}</b> wilayah &nbsp;/&nbsp; <b>${shops.features.length}</b> toko`;
  } catch (err){
    console.error("Gagal memuat kota:", err);
  } finally {
    finishLoading(start);
  }
}

function toggleLoading(state, text){
  const el = document.getElementById("loading-overlay");
  if (state){
    if (text) document.getElementById("loading-text").textContent = text;
    el.classList.remove("hidden","fade-out");
  }
}
function finishLoading(startTime){
  const MIN_MS = 380;
  const elapsed = performance.now() - startTime;
  const wait = Math.max(0, MIN_MS - elapsed);
  setTimeout(()=>{
    const el = document.getElementById("loading-overlay");
    el.classList.add("fade-out");
    setTimeout(()=> el.classList.add("hidden"), 260);
  }, wait);
}

// -------- boundary layer (choropleth kepadatan toko) --------
const BOUNDARY_BASE_FILL_OPACITY = .38;
function renderBoundary(geojson, cityKey){
  if (boundaryLayer) map.removeLayer(boundaryLayer);

  const counts = geojson.features.map(f => f.properties._tokoCount || 0);
  const breaks = computeBreaks(counts);

  boundaryLayer = L.geoJSON(geojson, {
    style: (feature)=>{
      const col = densityColor(feature.properties._tokoCount || 0, breaks);
      return {
        color: col, weight: 1.3, opacity: .9,
        fillColor: col, fillOpacity: BOUNDARY_BASE_FILL_OPACITY
      };
    },
    onEachFeature: (feature, layer)=>{
      layer.on({
        mouseover: ()=> layer.setStyle({ fillOpacity: .6, weight: 2 }),
        mouseout:  ()=> layer.setStyle({ fillOpacity: BOUNDARY_BASE_FILL_OPACITY, weight: 1.3 }),
        click: ()=> updateInfoPanel(feature.properties, cityKey),
      });
    }
  });

  if (showBoundary) boundaryLayer.addTo(map);
  buildDensityLegend(breaks);
  document.getElementById("density-legend")?.classList.toggle("hidden", !showBoundary);
}

// -------- filtered feature helper (shared by markers / heatmap / nearest / csv) --------
function getFilteredFeatures(){
  const searchTerm = document.getElementById("search-box").value.trim().toLowerCase();
  const out = [];
  currentShopFeatures.forEach(f=>{
    const p = f.properties;
    const kat = kategoriOf(p.jenis);
    if (!activeKategori.has(kat.id)) return;
    if (searchTerm && !p.name.toLowerCase().includes(searchTerm)) return;
    const [lng, lat] = f.geometry.coordinates;
    out.push({ f, p, kat, lat, lng });
  });
  return out;
}

// -------- shop layer (cluster) + heatmap + buffer --------
function refreshShopLayers(){
  if (clusterLayer) map.removeLayer(clusterLayer);
  if (heatLayer) map.removeLayer(heatLayer);
  if (bufferLayer) map.removeLayer(bufferLayer);

  clusterLayer = L.markerClusterGroup({
    iconCreateFunction: cluster=>{
      const count = cluster.getChildCount();
      return L.divIcon({ html: `<div>${count}</div>`, className: "marker-cluster-custom", iconSize: [34,34] });
    },
    maxClusterRadius: 45,
    spiderfyOnMaxZoom: true,
  });

  const items = getFilteredFeatures();

  const markers = items.map(({p, kat, lat, lng})=>{
    const marker = L.marker([lat, lng], { icon: shopIcon(kat) });
    marker.bindPopup(popupHTML(p, kat));
    return marker;
  });
  clusterLayer.addLayers(markers);
  if (showShops) clusterLayer.addTo(map);

  const heatPoints = items.map(({lat,lng})=> [lat, lng, 0.6]);
  heatLayer = L.heatLayer(heatPoints, {
    radius: 26, blur: 20, maxZoom: 17, minOpacity: .25,
    gradient: { 0.2: "#233b2e", 0.45: "#3f8f82", 0.7: "#c9922e", 1: "#b5573d" }
  });
  if (showHeat) heatLayer.addTo(map);

  bufferLayer = L.layerGroup(items.map(({p, kat, lat, lng})=>
    L.circle([lat, lng], {
      radius: bufferRadius, weight: 1, color: kat.color, opacity: .6,
      fillColor: kat.color, fillOpacity: .1, interactive: false
    })
  ));
  if (showBuffer) bufferLayer.addTo(map);

  document.getElementById("st-visible").innerHTML = `<b>${markers.length}</b> tampil`;
}

function popupHTML(p, kat){
  const row = (label, val)=> val ? `<div class="popup-row"><b>${label}</b><span>${val}</span></div>` : "";
  return `
    <div class="popup-title">${kat.emoji} ${escapeHTML(p.name)}</div>
    <div class="popup-row"><b>Jenis</b><span>${kat.label} &middot; ${escapeHTML(p.jenis)}</span></div>
    ${row("Alamat", p.alamat ? escapeHTML(p.alamat) : "")}
    ${row("Telepon", p.telepon ? escapeHTML(p.telepon) : "")}
    ${row("Jam buka", p.jam_buka ? escapeHTML(p.jam_buka) : "")}
    ${p.website ? `<div class="popup-row"><b>Web</b><span><a href="${escapeAttr(p.website)}" target="_blank" style="color:#e0b46a">tautan</a></span></div>` : ""}
  `;
}
function escapeHTML(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function escapeAttr(s){ return String(s).replace(/"/g,"&quot;"); }

// -------- kategori legend / filter --------
function buildKategoriList(){
  const counts = {};
  currentShopFeatures.forEach(f=>{
    const kat = kategoriOf(f.properties.jenis);
    counts[kat.id] = (counts[kat.id]||0) + 1;
  });

  const wrap = document.getElementById("kategori-list");
  wrap.innerHTML = "";
  KATEGORI.concat([KATEGORI_LAIN]).forEach(kat=>{
    if (!counts[kat.id]) return;
    const el = document.createElement("label");
    el.className = "kategori-item";
    el.innerHTML = `
      <input type="checkbox" ${activeKategori.has(kat.id) ? "checked":""} data-kat="${kat.id}">
      <span class="dot-swatch" style="background:${kat.color}"></span>
      <span>${kat.emoji} ${kat.label}</span>
      <span class="kategori-count">${counts[kat.id]}</span>
    `;
    el.querySelector("input").addEventListener("change", e=>{
      if (e.target.checked) activeKategori.add(kat.id); else activeKategori.delete(kat.id);
      refreshShopLayers();
    });
    wrap.appendChild(el);
  });
}

// -------- statistik kategori (Chart.js) --------
function buildChart(){
  const counts = {};
  currentShopFeatures.forEach(f=>{
    const kat = kategoriOf(f.properties.jenis);
    counts[kat.id] = (counts[kat.id]||0) + 1;
  });
  const all = KATEGORI.concat([KATEGORI_LAIN]).filter(k=>counts[k.id]);

  const ctx = document.getElementById("kategori-chart").getContext("2d");
  if (kategoriChart) kategoriChart.destroy();

  const mutedText = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || "#9fb0a3";
  const lineColor = getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || "#3a4c40";

  kategoriChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: all.map(k=>k.emoji),
      datasets: [{
        data: all.map(k=>counts[k.id]),
        backgroundColor: all.map(k=>k.color),
        borderRadius: 3, maxBarThickness: 26,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display:false },
        tooltip: {
          callbacks: { title: (items)=> all[items[0].dataIndex].label }
        }
      },
      scales: {
        x: { ticks:{ color:mutedText, font:{ size:13 } }, grid:{ display:false } },
        y: { ticks:{ color:mutedText, font:{ family:"JetBrains Mono", size:9 } }, grid:{ color:lineColor } }
      }
    }
  });
}

// -------- info panel --------
function updateInfoPanel(props, cityKey){
  const panel = document.getElementById("info-panel-body");
  const cityLabel = CITIES[cityKey].label;

  if (!props){
    panel.innerHTML = `<p class="info-empty">Klik salah satu poligon wilayah pada peta ${cityLabel} untuk melihat detailnya di sini.</p>`;
    return;
  }

  let extra = "";
  if (props._tokoCount !== undefined){
    extra += `<div class="info-row"><span>Jumlah Toko</span><span class="v">${props._tokoCount}</span></div>`;
  }
  if (props.penduduk !== undefined){
    extra += `
      <div class="info-row"><span>Jumlah Penduduk</span><span class="v">${Number(props.penduduk).toLocaleString("id-ID")}</span></div>
      <div class="info-row"><span>Kasus DBD</span><span class="v">${props.kasus_dbd}</span></div>
      <div class="info-row"><span>Insidensi DBD (IR)</span><span class="v">${props.ir_dbd}</span></div>
    `;
  }

  panel.innerHTML = `
    <div class="info-row"><span>Wilayah</span><span class="v">${escapeHTML(props.name)}</span></div>
    <div class="info-row"><span>Kota</span><span class="v">${cityLabel}</span></div>
    ${extra}
  `;
}

// ============================================================
// ALAT: UKUR JARAK
// ============================================================
function haversine(lat1, lng1, lat2, lng2){
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1), dLng = toRad(lng2-lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function fmtDist(m){
  return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(2)} km`;
}

function toggleMeasure(){
  measureActive = !measureActive;
  document.getElementById("tool-measure").classList.toggle("active", measureActive);
  const hint = document.getElementById("tool-hint");
  if (measureActive){
    setActiveModeExclusive("measure");
    map.getContainer().style.cursor = "crosshair";
    hint.textContent = "Klik pada peta untuk menambah titik ukur. Klik tombol \"Ukur Jarak\" lagi untuk mengakhiri.";
    hint.classList.remove("hidden");
  } else {
    map.getContainer().style.cursor = "";
    hint.classList.add("hidden");
    clearMeasure();
  }
}
function clearMeasure(){
  measurePoints = [];
  measureLayerGroup.clearLayers();
}
function onMapClickForMeasure(e){
  if (!measureActive) return;
  measurePoints.push(e.latlng);

  measureLayerGroup.clearLayers();
  measurePoints.forEach(pt=>{
    L.circleMarker(pt, { radius:4, color:"#e0b46a", fillColor:"#e0b46a", fillOpacity:1, weight:1 }).addTo(measureLayerGroup);
  });

  if (measurePoints.length > 1){
    L.polyline(measurePoints, { color:"#e0b46a", weight:2, dashArray:"5,6" }).addTo(measureLayerGroup);

    let total = 0;
    for (let i=1; i<measurePoints.length; i++){
      total += haversine(measurePoints[i-1].lat, measurePoints[i-1].lng, measurePoints[i].lat, measurePoints[i].lng);
    }
    const last = measurePoints[measurePoints.length-1];
    L.tooltip({ permanent:true, direction:"top", className:"measure-tooltip", offset:[0,-6] })
      .setLatLng(last)
      .setContent(`total ${fmtDist(total)}`)
      .addTo(measureLayerGroup);
  }
}

// ============================================================
// ALAT: TOKO TERDEKAT (geolocation)
// ============================================================
function findNearest(){
  setActiveModeExclusive("nearest");
  const hint = document.getElementById("tool-hint");
  hint.classList.remove("hidden");
  hint.textContent = "Mencari lokasi kamu…";
  document.getElementById("tool-nearest").classList.add("active");

  if (!navigator.geolocation){
    hint.textContent = "Browser ini tidak mendukung geolokasi.";
    return;
  }

  navigator.geolocation.getCurrentPosition(pos=>{
    const { latitude, longitude } = pos.coords;

    if (userLocMarker) map.removeLayer(userLocMarker);
    userLocMarker = L.marker([latitude, longitude], {
      icon: L.divIcon({ className:"", html:'<div class="user-loc-dot"></div>', iconSize:[16,16] })
    }).addTo(map).bindPopup("Lokasi kamu");

    const items = getFilteredFeatures().map(it=>({
      ...it, dist: haversine(latitude, longitude, it.lat, it.lng)
    })).sort((a,b)=> a.dist - b.dist).slice(0, 8);

    renderNearestList(items);
    hint.textContent = items.length
      ? `Menampilkan ${items.length} toko terdekat dari lokasi kamu.`
      : "Tidak ada toko yang cocok dengan filter kategori/pencarian saat ini.";

    if (items.length) map.flyTo([latitude, longitude], 15, { duration: 1 });
  }, err=>{
    hint.textContent = "Tidak bisa mengambil lokasi. Pastikan izin lokasi diaktifkan di browser.";
  }, { enableHighAccuracy:true, timeout:8000 });
}
function renderNearestList(items){
  const list = document.getElementById("nearest-list");
  list.classList.remove("hidden");
  list.innerHTML = items.map((it, i)=> `
    <div class="nearest-item" data-idx="${i}">
      <span class="n-rank">${i+1}</span>
      <span class="n-name">${it.kat.emoji} ${escapeHTML(it.p.name)}</span>
      <span class="n-dist">${fmtDist(it.dist)}</span>
    </div>
  `).join("");
  list.querySelectorAll(".nearest-item").forEach(el=>{
    el.addEventListener("click", ()=>{
      const it = items[+el.dataset.idx];
      map.flyTo([it.lat, it.lng], 18, { duration: .9 });
      L.popup().setLatLng([it.lat, it.lng]).setContent(popupHTML(it.p, it.kat)).openOn(map);
    });
  });
}
function clearNearest(){
  document.getElementById("nearest-list").classList.add("hidden");
  document.getElementById("nearest-list").innerHTML = "";
  document.getElementById("tool-nearest").classList.remove("active");
  if (userLocMarker){ map.removeLayer(userLocMarker); userLocMarker = null; }
}

function setActiveModeExclusive(mode){
  if (mode !== "measure" && measureActive){
    measureActive = false;
    document.getElementById("tool-measure").classList.remove("active");
    map.getContainer().style.cursor = "";
    clearMeasure();
  }
  if (mode !== "nearest"){
    clearNearest();
  }
  if (mode !== null){
    document.getElementById("tool-hint").classList.add("hidden");
  }
}

// ============================================================
// ALAT: UNDUH CSV
// ============================================================
function exportCSV(){
  const items = getFilteredFeatures();
  if (!items.length){
    alert("Tidak ada toko untuk diunduh (cek filter kategori/pencarian).");
    return;
  }
  const header = ["Nama","Kategori","Jenis","Alamat","Telepon","Jam Buka","Website","Latitude","Longitude"];
  const esc = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const rows = items.map(({p, kat, lat, lng})=> [
    p.name, kat.label, p.jenis, p.alamat, p.telepon, p.jam_buka, p.website, lat, lng
  ].map(esc).join(","));

  const csv = "\uFEFF" + [header.map(esc).join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `toko_${currentCity}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const hint = document.getElementById("tool-hint");
  hint.classList.remove("hidden");
  hint.textContent = `${items.length} toko diunduh sebagai CSV.`;
  setTimeout(()=> hint.classList.add("hidden"), 3000);
}

// ============================================================
// PETA DASAR: GELAP / SATELIT
// ============================================================
function setBasemap(mode){
  document.querySelectorAll(".basemap-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.basemap === mode);
  });
  if (mode === "satellite"){
    if (map.hasLayer(baseLayerDark)) map.removeLayer(baseLayerDark);
    if (!map.hasLayer(baseLayerSat)) baseLayerSat.addTo(map);
    if (!map.hasLayer(baseLabelsLayer)) baseLabelsLayer.addTo(map);
  } else {
    if (map.hasLayer(baseLayerSat)) map.removeLayer(baseLayerSat);
    if (map.hasLayer(baseLabelsLayer)) map.removeLayer(baseLabelsLayer);
    if (!map.hasLayer(baseLayerDark)) baseLayerDark.addTo(map);
  }
}

// ============================================================
// TEMA TERANG / GELAP
// ============================================================
function toggleTheme(){
  const html = document.documentElement;
  const isLight = html.getAttribute("data-theme") === "light";
  html.setAttribute("data-theme", isLight ? "dark" : "light");
  document.getElementById("theme-icon").textContent = isLight ? "☀" : "☾";
  if (kategoriChart) setTimeout(buildChart, 60); // refresh chart colors for new theme
}

// -------- UI wiring --------
function wireUI(){
  document.querySelectorAll(".city-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> loadCity(btn.dataset.city));
  });

  const boundarySwitch = document.getElementById("switch-boundary");
  boundarySwitch.addEventListener("click", ()=>{
    showBoundary = !showBoundary;
    boundarySwitch.classList.toggle("on", showBoundary);
    document.getElementById("density-legend")?.classList.toggle("hidden", !showBoundary);
    if (!boundaryLayer) return;
    showBoundary ? boundaryLayer.addTo(map) : map.removeLayer(boundaryLayer);
  });

  const shopSwitch = document.getElementById("switch-shops");
  shopSwitch.addEventListener("click", ()=>{
    showShops = !showShops;
    shopSwitch.classList.toggle("on", showShops);
    if (!clusterLayer) return;
    showShops ? clusterLayer.addTo(map) : map.removeLayer(clusterLayer);
  });

  const heatSwitch = document.getElementById("switch-heatmap");
  heatSwitch.addEventListener("click", ()=>{
    showHeat = !showHeat;
    heatSwitch.classList.toggle("on", showHeat);
    if (!heatLayer) return;
    showHeat ? heatLayer.addTo(map) : map.removeLayer(heatLayer);
  });

  const bufferSwitch = document.getElementById("switch-buffer");
  const bufferField = document.getElementById("buffer-radius-field");
  bufferSwitch.addEventListener("click", ()=>{
    showBuffer = !showBuffer;
    bufferSwitch.classList.toggle("on", showBuffer);
    bufferField.classList.toggle("hidden", !showBuffer);
    if (!bufferLayer) return;
    showBuffer ? bufferLayer.addTo(map) : map.removeLayer(bufferLayer);
  });

  document.getElementById("buffer-radius").addEventListener("change", e=>{
    bufferRadius = Number(e.target.value);
    if (currentShopFeatures.length) refreshShopLayers();
  });

  document.getElementById("search-box").addEventListener("input", ()=>{
    if (currentShopFeatures.length) refreshShopLayers();
  });

  document.querySelectorAll(".basemap-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> setBasemap(btn.dataset.basemap));
  });

  document.getElementById("tool-measure").addEventListener("click", toggleMeasure);
  document.getElementById("tool-nearest").addEventListener("click", findNearest);
  document.getElementById("tool-export").addEventListener("click", exportCSV);
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

  // -------- menu mobile (drawer sidebar) --------
  const sidebarEl = document.getElementById("sidebar");
  const backdropEl = document.getElementById("sidebar-backdrop");
  const menuBtn = document.getElementById("menu-toggle");

  function openSidebar(){
    sidebarEl.classList.add("open");
    backdropEl.classList.add("show");
  }
  function closeSidebar(){
    sidebarEl.classList.remove("open");
    backdropEl.classList.remove("show");
    setTimeout(()=> map.invalidateSize(), 260);
  }
  menuBtn.addEventListener("click", ()=>{
    sidebarEl.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  backdropEl.addEventListener("click", closeSidebar);

  // tutup drawer otomatis setelah pilih kota di layar kecil
  document.querySelectorAll(".city-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if (window.innerWidth <= 820) closeSidebar();
    });
  });

  window.addEventListener("resize", ()=> map.invalidateSize());
}

// -------- boot --------
(function boot(){
  initMap();
  wireUI();
  loadCity("jambi");
})();
