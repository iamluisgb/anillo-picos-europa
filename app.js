'use strict';

/* ---------- Datos ---------- */
const markers = [
  { name: 'Pandébano (inicio)', lat: 43.23259, lng: -4.77934, alt: 1124, type: 'start' },
  { name: 'Refugio de Jou de Cabrones', lat: 43.21453, lng: -4.85814, alt: 2025, type: 'refuge' },
  { name: 'Refugio de Urriellu', lat: 43.20289, lng: -4.82169, alt: 1960, type: 'refuge' },
  { name: 'Caín de Valdeón', lat: 43.21368, lng: -4.90335, alt: 470, type: 'village' },
  { name: 'Refugio Collado Jermoso', lat: 43.17302, lng: -4.86913, alt: 1995, type: 'refuge' },
  { name: 'Refugio de Áliva', lat: 43.16800, lng: -4.78665, alt: 1638, type: 'refuge' },
  { name: 'Torre Cerredo', lat: 43.19775, lng: -4.85283, alt: 2648, type: 'peak' },
];
const typeLabel = { start: 'Inicio', refuge: 'Refugio', village: 'Pueblo', peak: 'Cumbre' };
const markerColors = { start: '#4fc3f7', refuge: '#66bb6a', village: '#ffa726', pass: '#ab47bc', peak: '#ef5350', waypoint: '#78909c' };
const markerIcons = { start: '🏁', refuge: '🏠', village: '🏘️', pass: '⛰️', peak: '🔺', waypoint: '📍' };

/* ---------- Estado ---------- */
const trackById = {};
const trackLayerIds = [];
const fullBounds = new maplibregl.LngLatBounds();
let currentProfile = null;   // id de track o null = ruta completa
let activeTrackId = null;
let realTracksVisible = true;
let hoverMarker = null;

/* ---------- Mapa ---------- */
const DEM = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
// Satélite de alta resolución vía MapTiler si hay clave (config.js); si no, Esri.
const MT = (typeof MAPTILER_KEY !== 'undefined' && MAPTILER_KEY) ? MAPTILER_KEY : null;
const satelliteSource = MT
  ? { type: 'raster', tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MT}`], tileSize: 512, maxzoom: 20, attribution: '© MapTiler © Maxar' }
  : { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: '© Esri' };
const style = {
  version: 8,
  sources: {
    topo: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: '© Esri' },
    satellite: satelliteSource,
    dem: { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: 'Terreno: AWS / Mapzen' },
    'dem-hs': { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 15 },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0f1923' } },
    { id: 'topo', type: 'raster', source: 'topo', layout: { visibility: 'none' } },
    { id: 'satellite', type: 'raster', source: 'satellite' },
    { id: 'hillshade', type: 'hillshade', source: 'dem-hs', paint: { 'hillshade-exaggeration': 0.12, 'hillshade-shadow-color': '#1a2530' } },
  ],
  terrain: { source: 'dem', exaggeration: 1.5 },
};

const map = new maplibregl.Map({
  container: 'map', style,
  center: [-4.845, 43.195], zoom: 11.3, pitch: 0, bearing: 0, maxPitch: 80,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

map.on('load', () => {
  if (typeof realTracks !== 'undefined') {
    realTracks.forEach(t => {
      trackById[t.id] = t;
      const coords = t.coords.map(c => [c[1], c[0]]);
      coords.forEach(c => fullBounds.extend(c));
      const isPeak = t.kind === 'peak';
      map.addSource('src-' + t.id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
      map.addLayer({
        id: 'lyr-' + t.id, type: 'line', source: 'src-' + t.id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': t.color,
          'line-width': isPeak ? 3 : 4.5,
          'line-opacity': isPeak ? 0.85 : 0.95,
          ...(isPeak ? { 'line-dasharray': [2, 1.5] } : {}),
        },
      });
      trackLayerIds.push('lyr-' + t.id);
      map.on('click', 'lyr-' + t.id, e => {
        new maplibregl.Popup({ offset: 12 }).setLngLat(e.lngLat)
          .setHTML(`<div class="popup-title">${t.name}</div><div class="popup-detail">${isPeak ? 'Cumbre opcional' : 'Ruta'} · ${t.km} km · +${t.gain}/-${t.loss} m · Wikiloc</div>`)
          .addTo(map);
      });
      map.on('mouseenter', 'lyr-' + t.id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'lyr-' + t.id, () => { map.getCanvas().style.cursor = ''; });
    });
  }

  markers.forEach(wp => {
    const el = document.createElement('div');
    el.className = 'map-marker';
    el.style.background = markerColors[wp.type] || '#78909c';
    el.textContent = markerIcons[wp.type] || '📍';
    el.setAttribute('aria-label', `${wp.name} (${typeLabel[wp.type] || ''}, ${wp.alt} m)`);
    const popup = new maplibregl.Popup({ offset: 18 })
      .setHTML(`<div class="popup-title">${wp.name}</div><div class="popup-detail">${typeLabel[wp.type] || ''} · ${wp.alt} m</div>`);
    new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([wp.lng, wp.lat]).setPopup(popup).addTo(map);
  });

  buildSidebar();
  if (!fullBounds.isEmpty()) map.fitBounds(fullBounds, { padding: 70, pitch: 0, bearing: 0, duration: 0 });
});

map.once('idle', () => { document.getElementById('map-loader').classList.add('hidden'); });

/* ---------- Sidebar dinámico (altitud + sparkline + interacción) ---------- */
function buildSidebar() {
  document.querySelectorAll('.day-section').forEach(sec => {
    const id = sec.dataset.track;
    const t = trackById[id];
    const header = sec.querySelector('.day-header');
    const details = sec.querySelector('.day-details');
    if (!t) return;

    // color del número = color de la línea en el mapa
    const num = sec.querySelector('.day-number');
    num.style.background = t.color;

    // fila de altitud salida → llegada
    const e0 = t.coords[0][2], e1 = t.coords[t.coords.length - 1][2];
    const altRow = document.createElement('div');
    altRow.className = 'detail-row';
    altRow.innerHTML = `<span class="key">Altitud</span><span class="val">${e0} → ${e1} m</span>`;
    const notes = details.querySelector('.day-notes');
    details.insertBefore(altRow, notes || null);

    // sparkline
    const cv = document.createElement('canvas');
    cv.className = 'stage-spark';
    details.appendChild(cv);
    requestAnimationFrame(() => drawSparkline(cv, t));

    // interacción
    header.addEventListener('click', () => selectStage(sec, id));
  });

  document.getElementById('full-route-btn').addEventListener('click', showFullRoute);
}

function selectStage(sec, id) {
  const wasActive = sec.classList.contains('active') && sec.classList.contains('open');
  document.querySelectorAll('.day-section').forEach(s => { s.classList.remove('open', 'active'); s.querySelector('.day-details').classList.remove('open'); s.querySelector('.day-header').setAttribute('aria-expanded', 'false'); });
  if (wasActive) { showFullRoute(); return; }
  sec.classList.add('open', 'active');
  sec.querySelector('.day-details').classList.add('open');
  sec.querySelector('.day-header').setAttribute('aria-expanded', 'true');
  // En móvil: cerrar sidebar primero, luego volar tras la transición
  if (window.innerWidth <= 820) {
    setMobileSidebar(false);
    setTimeout(() => flyToTrack(id), 350);
  } else {
    flyToTrack(id);
  }
}

function flyToTrack(id) {
  const t = trackById[id];
  if (!t) return;
  activeTrackId = id;
  highlightTrack(id);
  const b = new maplibregl.LngLatBounds();
  t.coords.forEach(c => b.extend([c[1], c[0]]));

  // Calcular bearing óptimo según la dirección dominante de la ruta
  const bearing = calcTrackBearing(t.coords);

  map.fitBounds(b, {
    padding: { top: 60, bottom: 60, left: 440, right: 60 },
    pitch: map.getPitch(),
    bearing: map.getBearing() !== 0 ? map.getBearing() : bearing,
    duration: 1300,
  });

  currentProfile = id;
  document.getElementById('full-route-btn').classList.add('show');
  if (panelVisible()) drawElevationChart();
}

// Bearing entre dos puntos [lng, lat]
function calcBearing(lng1, lat1, lng2, lat2) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Calcula el bearing óptimo para visualizar una ruta completa
// Usa PCA simplificada sobre las coordenadas para encontrar el eje principal
function calcTrackBearing(coords) {
  if (coords.length < 2) return 0;

  // Centroide
  let sumLat = 0, sumLng = 0;
  coords.forEach(c => { sumLat += c[0]; sumLng += c[1]; });
  const cLat = sumLat / coords.length;
  const cLng = sumLng / coords.length;

  // Covarianza simplificada
  let xx = 0, xy = 0;
  coords.forEach(c => {
    const dx = c[1] - cLng;  // lng
    const dy = c[0] - cLat;  // lat
    xx += dx * dx;
    xy += dx * dy;
  });

  // Ángulo del eje principal
  const toDeg = r => r * 180 / Math.PI;
  const axisAngle = toDeg(Math.atan2(xy, xx));

  // El bearing para que la ruta se vea de abajo a arriba es perpendicular al eje principal
  // Si el eje va O-E (angle ~0), bearing = 90 (mirar desde el sur)
  // Si el eje va N-S (angle ~90), bearing = 0 (mirar desde el oeste)
  const bearing = ((axisAngle + 90) + 360) % 360;
  return bearing;
}

function highlightTrack(id) {
  trackLayerIds.forEach(lid => {
    const tid = lid.slice(4);
    const base = trackById[tid].kind === 'peak' ? 0.85 : 0.95;
    if (!realTracksVisible) return;
    if (id === null) {
      map.setPaintProperty(lid, 'line-opacity', base);
      map.setPaintProperty(lid, 'line-width', trackById[tid].kind === 'peak' ? 3 : 4.5);
    } else if (tid === id) {
      map.setPaintProperty(lid, 'line-opacity', 1);
      map.setPaintProperty(lid, 'line-width', 6.5);
    } else {
      map.setPaintProperty(lid, 'line-opacity', 0.22);
      map.setPaintProperty(lid, 'line-width', trackById[tid].kind === 'peak' ? 2.5 : 3.5);
    }
  });
}

function showFullRoute() {
  activeTrackId = null; currentProfile = null;
  highlightTrack(null);
  document.querySelectorAll('.day-section').forEach(s => s.classList.remove('active'));
  document.getElementById('full-route-btn').classList.remove('show');
  if (!fullBounds.isEmpty()) map.fitBounds(fullBounds, { padding: { top: 60, bottom: 60, left: 440, right: 60 }, pitch: map.getPitch(), bearing: map.getBearing(), duration: 1100 });
  if (panelVisible()) drawElevationChart();
}

/* ---------- Sparkline por etapa ---------- */
function drawSparkline(cv, t) {
  const w = cv.clientWidth || 360, h = cv.clientHeight || 54;
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const pad = 4;
  const eles = t.coords.map(c => c[2]);
  const mn = Math.min(...eles), mx = Math.max(...eles), rg = mx - mn || 1;
  const n = t.coords.length;
  const X = i => pad + (i / (n - 1)) * (w - 2 * pad);
  const Y = e => pad + (1 - (e - mn) / rg) * (h - 2 * pad);
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath(); ctx.moveTo(X(0), h - pad);
  t.coords.forEach((c, i) => ctx.lineTo(X(i), Y(c[2])));
  ctx.lineTo(X(n - 1), h - pad); ctx.closePath();
  ctx.fillStyle = hexToRgba(t.color, 0.18); ctx.fill();
  ctx.beginPath();
  t.coords.forEach((c, i) => { const x = X(i), y = Y(c[2]); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.strokeStyle = t.color; ctx.lineWidth = 1.5; ctx.stroke();
}

/* ---------- Perfil de elevación ---------- */
function panelVisible() { return document.getElementById('elevation-panel').classList.contains('visible'); }

function haversineKm(a, b) {
  const R = 6371, p = Math.PI / 180;
  const dLa = (b[0] - a[0]) * p, dLo = (b[1] - a[1]) * p;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * p) * Math.cos(b[0] * p) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Construye los puntos del perfil + rangos interpolados (en km del perfil).
function buildProfile() {
  let segments = [], label = '';
  if (currentProfile && trackById[currentProfile]) {
    segments = [trackById[currentProfile]]; label = trackById[currentProfile].name;
  } else {
    segments = realTracks.filter(t => t.kind === 'route'); label = 'Ruta completa';
  }
  const pts = []; let d = 0; const interpRanges = []; let gain = 0, loss = 0;
  segments.forEach(t => {
    // escala cada tramo a su km oficial (las coords están submuestreadas y miden de menos)
    let raw = 0;
    for (let i = 1; i < t.coords.length; i++) raw += haversineKm([t.coords[i - 1][0], t.coords[i - 1][1]], [t.coords[i][0], t.coords[i][1]]);
    const scale = raw > 0 ? t.km / raw : 1;
    const segStart = d;
    t.coords.forEach((c, i) => {
      if (i > 0) d += haversineKm([t.coords[i - 1][0], t.coords[i - 1][1]], [c[0], c[1]]) * scale;
      pts.push({ d, e: c[2], lat: c[0], lng: c[1] });
    });
    if (t.interp) interpRanges.push([segStart + t.interp[0], segStart + t.interp[1]]);
    gain += t.gain; loss += t.loss;
  });
  // downsample para dibujar (mantener <= 600 puntos)
  const step = Math.max(1, Math.ceil(pts.length / 600));
  const draw = pts.filter((_, i) => i % step === 0);
  if (draw[draw.length - 1] !== pts[pts.length - 1]) draw.push(pts[pts.length - 1]);
  return { pts, draw, label, totalKm: d, interpRanges, gain, loss };
}

let profileCache = null;
function slopeColor(pct) {
  const a = Math.abs(pct);
  if (a < 10) return '#66bb6a';
  if (a < 20) return '#ffd54f';
  if (a < 35) return '#ffa726';
  return '#ef5350';
}

function drawElevationChart() {
  const panel = document.getElementById('elevation-chart');
  const canvas = document.getElementById('elev-canvas');
  const w = panel.offsetWidth, h = panel.offsetHeight;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const pad = { top: 24, right: 20, bottom: 30, left: 54 };
  profileCache = buildProfile();
  const { draw, label, totalKm, interpRanges, gain, loss } = profileCache;
  if (!draw.length) return;
  const eles = draw.map(p => p.e);
  const minA = Math.min(...eles) - 50, maxA = Math.max(...eles) + 50, range = maxA - minA || 1;
  const X = d => pad.left + (d / (totalKm || 1)) * (w - pad.left - pad.right);
  const Y = e => pad.top + ((maxA - e) / range) * (h - pad.top - pad.bottom);

  ctx.fillStyle = '#0f1923'; ctx.fillRect(0, 0, w, h);

  // bandas de altitud interpolada
  interpRanges.forEach(([a, b]) => {
    ctx.fillStyle = 'rgba(255,167,38,0.12)';
    ctx.fillRect(X(a), pad.top, X(b) - X(a), h - pad.top - pad.bottom);
  });

  // rejilla + eje Y
  ctx.strokeStyle = '#1a2a3a'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * (h - pad.top - pad.bottom);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = '#8899aa'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(maxA - (i / 4) * range)}m`, pad.left - 5, y + 4);
  }
  // eje X (km)
  ctx.textAlign = 'center';
  const kmStep = Math.max(1, Math.round(totalKm / 8));
  for (let k = 0; k <= Math.floor(totalKm); k += kmStep) ctx.fillText(`${k}`, X(k), h - pad.bottom + 16);

  // relleno bajo la curva
  const grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
  grad.addColorStop(0, 'rgba(79,195,247,0.25)'); grad.addColorStop(1, 'rgba(79,195,247,0.03)');
  ctx.beginPath(); ctx.moveTo(X(draw[0].d), h - pad.bottom);
  draw.forEach(p => ctx.lineTo(X(p.d), Y(p.e)));
  ctx.lineTo(X(draw[draw.length - 1].d), h - pad.bottom); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // línea coloreada por pendiente
  ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  for (let i = 1; i < draw.length; i++) {
    const a = draw[i - 1], b = draw[i];
    const dd = (b.d - a.d) * 1000 || 1;
    ctx.beginPath();
    ctx.strokeStyle = slopeColor(((b.e - a.e) / dd) * 100);
    ctx.moveTo(X(a.d), Y(a.e)); ctx.lineTo(X(b.d), Y(b.e)); ctx.stroke();
  }

  // cabecera
  ctx.fillStyle = '#90caf9'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`${label} · ${totalKm.toFixed(1)} km · +${gain}/-${loss} m`, pad.left, 15);
  if (interpRanges.length) { ctx.fillStyle = '#ffb74d'; ctx.textAlign = 'right'; ctx.fillText('▨ altitud estimada', w - pad.right, 15); }

  profileGeom = { pad, w, h, minA, maxA, range, X, Y };
}

let profileGeom = null;

/* hover en el perfil -> tooltip + punto en el mapa */
function setupProfileHover() {
  const chart = document.getElementById('elevation-chart');
  const tip = document.getElementById('elevation-tooltip');
  chart.addEventListener('mousemove', e => {
    if (!profileCache || !profileGeom) return;
    const rect = chart.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const { pad, w, totalKm } = profileGeom;
    const km = ((x - pad.left) / (w - pad.left - pad.right)) * totalKm;
    if (km < 0 || km > totalKm) { hideHover(); return; }
    // punto más cercano en km
    const pts = profileCache.pts;
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; pts[m].d < km ? lo = m + 1 : hi = m; }
    const p = pts[lo];
    tip.style.display = 'block';
    tip.style.left = profileGeom.X(p.d) + 'px';
    tip.style.top = profileGeom.Y(p.e) + 'px';
    tip.textContent = `${p.d.toFixed(1)} km · ${Math.round(p.e)} m`;
    if (!hoverMarker) {
      const el = document.createElement('div'); el.className = 'hover-dot';
      hoverMarker = new maplibregl.Marker({ element: el, anchor: 'center' });
    }
    hoverMarker.setLngLat([p.lng, p.lat]).addTo(map);
  });
  chart.addEventListener('mouseleave', hideHover);
}
function hideHover() {
  document.getElementById('elevation-tooltip').style.display = 'none';
  if (hoverMarker) hoverMarker.remove();
}

/* ---------- Controles ---------- */
function setTexture(name) {
  const sat = name === 'satellite';
  map.setLayoutProperty('topo', 'visibility', sat ? 'none' : 'visible');
  map.setLayoutProperty('satellite', 'visibility', sat ? 'visible' : 'none');
  // el satélite ya trae sombras propias: suavizamos el hillshade para no apagar la foto
  map.setPaintProperty('hillshade', 'hillshade-exaggeration', sat ? 0.12 : 0.45);
  setPressed('btn-topo', !sat); setPressed('btn-sat', sat);
}
function setView(v) {
  if (v === '2d') map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  else map.easeTo({ pitch: 65, bearing: 12, duration: 800 });
  setPressed('btn-2d', v === '2d'); setPressed('btn-3d', v === '3d');
}
function toggleRealTrack() {
  realTracksVisible = !realTracksVisible;
  const vis = realTracksVisible ? 'visible' : 'none';
  trackLayerIds.forEach(id => map.setLayoutProperty(id, 'visibility', vis));
  if (realTracksVisible) highlightTrack(activeTrackId);
  setPressed('real-track-btn', realTracksVisible);
}
function setPressed(id, on) {
  const b = document.getElementById(id);
  b.classList.toggle('active', on);
  b.setAttribute('aria-pressed', String(on));
}
function toggleElevation() {
  const p = document.getElementById('elevation-panel');
  const open = p.classList.toggle('visible');
  const btn = document.getElementById('elevation-toggle');
  btn.classList.toggle('active', open);
  btn.textContent = open ? '📈 Ocultar perfil' : '📈 Perfil de altitud';
  if (open) setTimeout(drawElevationChart, 60);
}

/* ---------- Util ---------- */
function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function debounce(fn, ms) { let h; return () => { clearTimeout(h); h = setTimeout(fn, ms); }; }

/* ---------- Wiring ---------- */
document.getElementById('btn-topo').addEventListener('click', () => setTexture('topo'));
document.getElementById('btn-sat').addEventListener('click', () => setTexture('satellite'));
document.getElementById('btn-2d').addEventListener('click', () => setView('2d'));
document.getElementById('btn-3d').addEventListener('click', () => setView('3d'));
document.getElementById('real-track-btn').addEventListener('click', toggleRealTrack);
document.getElementById('elevation-toggle').addEventListener('click', toggleElevation);
function setMobileSidebar(open) {
  sidebar.classList.toggle('open', open);
  document.getElementById('sidebar-overlay').classList.toggle('visible', open);
  document.getElementById('sidebar-toggle').style.display = (window.innerWidth <= 820 && !open) ? 'flex' : 'none';
}

document.getElementById('sidebar-toggle').addEventListener('click', () => setMobileSidebar(true));
document.getElementById('sidebar-close').addEventListener('click', () => setMobileSidebar(false));
document.getElementById('sidebar-overlay').addEventListener('click', () => setMobileSidebar(false));
document.getElementById('layer-fab').addEventListener('click', () => document.getElementById('layer-control').classList.toggle('open'));

// Sidebar collapse (desktop)
const sidebarCollapse = document.getElementById('sidebar-collapse');
const sidebar = document.getElementById('sidebar');
sidebarCollapse.addEventListener('click', () => {
  const isCollapsed = sidebar.classList.toggle('collapsed');
  sidebarCollapse.classList.toggle('collapsed');
  sidebarCollapse.textContent = isCollapsed ? '▷' : '◁';
  sidebarCollapse.setAttribute('aria-label', isCollapsed ? 'Expandir panel' : 'Colapsar panel');
  sidebarCollapse.setAttribute('title', isCollapsed ? 'Expandir panel' : 'Colapsar panel');
  // Actualizar mapa después de la transición
  setTimeout(() => map.resize(), 320);
});

// ESC para cerrar sidebar en móvil
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebar.classList.contains('open')) {
    setMobileSidebar(false);
  }
});

window.addEventListener('resize', debounce(() => {
  if (panelVisible()) drawElevationChart();
  // En desktop, ocultar botón toggle y overlay
  if (window.innerWidth > 820) {
    document.getElementById('sidebar-toggle').style.display = 'none';
    document.getElementById('sidebar-overlay').classList.remove('visible');
    sidebar.classList.remove('open');
  }
}, 150));
setupProfileHover();
