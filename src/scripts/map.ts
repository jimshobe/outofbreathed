// The globe map (approved prototype: mocks/index.html), on real places.
//
// Places are ~100 m spots with photos (see listPlaces), embedded in the page as JSON. Markers are an
// HTML overlay positioned each frame and grouped by on-screen distance: small white squares, "[n]" for
// groups, names with [i] when zoomed in. A place opens a panel with its photos (lightbox) or "about"
// (Wikipedia, via /map/about.json). #@lat,lng (optionally /about) in the URL opens a place directly.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { openLightbox, initLightbox, type LbItem } from './lightbox';

interface Place { spot_lat: number; spot_lng: number; lat: number; lng: number; n: number; name: string | null; latest: string }
interface PlaceMoment extends LbItem { thumb: string | null; date: string; set: { id: string; title: string } | null }
interface About {
  title: string; description: string | null; extract: string; url: string;
  photos: { src: string; thumb: string; page: string; caption: string; credit: string }[];
  error?: string;
}

// Worker types in the shared tsconfig redefine DOM `Element`, so DOM lookups are cast through these.
type El = HTMLElement;
const $ = (sel: string, root: { querySelector(s: string): unknown } = document) => root.querySelector(sel) as El;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const key = (p: Place) => `${p.spot_lat},${p.spot_lng}`;
const label = (p: Place) => (p.name ?? 'unnamed').toLowerCase();

const places: Place[] = JSON.parse($('#places').textContent ?? '[]');
const byKey = new Map(places.map((p) => [key(p), p]));
const newest = [...places].sort((a, b) => b.latest.localeCompare(a.latest))[0];

// Globe zooms are tuned for a ~900px tall window; scale so the globe fits any screen.
const fit = Math.log2(Math.min(innerWidth * 1.15, innerHeight) / 900);
const VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
  start: { center: [138, -24], zoom: 2.25 + fit },
  w: { center: [-168, 10], zoom: 1.6 + fit },
  ...(newest ? { n: { center: [newest.lng, newest.lat] as [number, number], zoom: 9 } } : {}),
};

function graticule(step = 30) {
  const lines: [number, number][][] = [];
  for (let lng = -180; lng < 180; lng += step) lines.push(Array.from({ length: 33 }, (_, i) => [lng, -80 + i * 5]));
  for (let lat = -60; lat <= 60; lat += step) lines.push(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]));
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'MultiLineString' as const, coordinates: lines } };
}

const fade = (from: number, to: number, a = 1, b = 0) => ['interpolate', ['linear'], ['zoom'], from, a, to, b] as maplibregl.ExpressionSpecification;

const map = new maplibregl.Map({
  container: 'map',
  center: VIEWS.start.center,
  zoom: VIEWS.start.zoom,
  attributionControl: false,
  style: {
    version: 8,
    projection: { type: 'globe' },
    sources: {
      // GeoJSON is parsed in a worker, which can't resolve relative URLs.
      land: { type: 'geojson', data: new URL('/map/land-50m.geojson', location.href).href, attribution: 'Natural Earth' },
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      grat: { type: 'geojson', data: graticule() },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#080808' } },
      { id: 'grat', type: 'line', source: 'grat', paint: { 'line-color': '#1c1c1c', 'line-width': 1 } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#161616', 'fill-opacity': fade(4, 6) } },
      { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': '#777', 'line-width': 0.7, 'line-opacity': fade(4, 6) } },
      // Up close, switch to detailed vector tiles: land as dark fill, water cut out of it.
      { id: 'd-land', type: 'background', minzoom: 4, paint: { 'background-color': '#161616', 'background-opacity': fade(4, 6, 0, 1) } },
      { id: 'd-water', type: 'fill', source: 'omt', 'source-layer': 'water', minzoom: 4, paint: { 'fill-color': '#080808', 'fill-opacity': fade(4, 6, 0, 1) } },
      { id: 'd-water-edge', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 5, filter: ['!=', ['get', 'class'], 'ocean'], paint: { 'line-color': '#333', 'line-width': 0.5 } },
      { id: 'd-park', type: 'fill', source: 'omt', 'source-layer': 'park', minzoom: 7, paint: { 'fill-color': '#111', 'fill-outline-color': '#1c1c1c' } },
      {
        id: 'd-roads', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 7,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
        paint: { 'line-color': '#262626', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 12, 1.4] },
      },
      {
        id: 'd-coast', type: 'line', source: 'omt', 'source-layer': 'water', minzoom: 5, filter: ['==', ['get', 'class'], 'ocean'],
        paint: { 'line-color': '#5a5a5a', 'line-width': 0.7, 'line-opacity': fade(5, 6, 0, 1) },
      },
    ],
  },
});
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
map.on('load', () => {
  $('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  // Faint atmosphere at globe zoom, gone when close.
  map.setSky({ 'atmosphere-blend': fade(0, 4, 0.35, 0) });
});

// ---- marker overlay: places grouped by on-screen distance ----
const marks = $('#marks');
const DEG = Math.PI / 180;
function visible(p: Place) {
  // Hide places on the far side of the globe.
  const c = map.getCenter();
  const cos = Math.sin(p.lat * DEG) * Math.sin(c.lat * DEG) + Math.cos(p.lat * DEG) * Math.cos(c.lat * DEG) * Math.cos((p.lng - c.lng) * DEG);
  return map.getZoom() > 5 || cos > 0.12;
}

function drawMarks() {
  const pts = places.filter(visible).map((p) => ({ p, xy: map.project([p.lng, p.lat]) })).sort((a, b) => b.p.n - a.p.n);
  const clusters: { xy: maplibregl.Point; members: typeof pts; nolabel?: boolean }[] = [];
  for (const o of pts) {
    const c = clusters.find((c) => Math.hypot(c.xy.x - o.xy.x, c.xy.y - o.xy.y) < 34);
    if (c) c.members.push(o); else clusters.push({ xy: o.xy, members: [o] });
  }
  // Show a label only if it doesn't collide with one already placed (biggest places win).
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const c of clusters) {
    if (c.members.length > 1) { placed.push({ x0: c.xy.x - 16, x1: c.xy.x + 16, y0: c.xy.y - 12, y1: c.xy.y + 12 }); continue; }
    const p = c.members[0].p, w = (label(p).length + String(p.n).length + 6) * 7.8 + 24;
    const box = { x0: c.xy.x - 6, x1: c.xy.x + w, y0: c.xy.y - 10, y1: c.xy.y + 10 };
    c.nolabel = placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
    placed.push(c.nolabel ? { x0: c.xy.x - 6, x1: c.xy.x + 6, y0: c.xy.y - 6, y1: c.xy.y + 6 } : box);
  }
  marks.classList.toggle('labels', map.getZoom() > 7.5);
  marks.innerHTML = clusters.map((c) => {
    const style = `left:${c.xy.x}px;top:${c.xy.y}px`;
    if (c.members.length > 1) {
      const n = c.members.reduce((s, o) => s + o.p.n, 0);
      return `<div class="mk group" style="${style}" data-keys="${c.members.map((o) => key(o.p)).join(';')}"><span class="n">${n}</span></div>`;
    }
    const p = c.members[0].p, k = key(p);
    return `<div class="mk${p === newest ? ' here' : ''}${c.nolabel ? ' nolabel' : ''}" style="${style}" data-keys="${k}">
      <span class="sq"></span><span class="lbl"><span class="nm">${esc(label(p))} ${p.n}</span><button class="i" data-info="${k}" aria-label="About ${esc(label(p))}">[i]</button></span></div>`;
  }).join('');
}
map.on('render', drawMarks);

marks.addEventListener('click', (e) => {
  const target = e.target as unknown as El;
  const mk = target.closest('.mk') as unknown as El | null;
  if (!mk) return;
  stopSpin();
  const info = target.closest('[data-info]') as unknown as El | null;
  if (info) return openPanel(byKey.get(info.dataset.info!)!, 'about');
  const keys = mk.dataset.keys!.split(';');
  if (keys.length > 1) {
    const b = new maplibregl.LngLatBounds();
    keys.forEach((k) => { const p = byKey.get(k)!; b.extend([p.lng, p.lat]); });
    map.fitBounds(b, { padding: 120, maxZoom: 11, duration: 1800 });
  } else {
    openPanel(byKey.get(keys[0])!, 'photos');
  }
});

// ---- place panel: my photos, or "about" from Wikipedia ----
const panel = $('#panel');
let current: { place: Place; mode: 'photos' | 'about' } | null = null;
const photoCache = new Map<string, PlaceMoment[]>();
const aboutCache = new Map<string, About>();

function flyTo(p: Place) {
  const offset: [number, number] = innerWidth > 700 ? [-200, 0] : [0, -innerHeight * 0.25];
  map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 9), offset, duration: map.getZoom() < 5 ? 3000 : 1200 });
}

function head(p: Place, mode: string) {
  const tab = (m: string, text: string) => `<button data-mode="${m}" class="${mode === m ? 'on' : ''}">${text}</button>`;
  return `<button class="x" aria-label="Close">[esc]</button>
    <div class="cmd">&gt; <b>${esc(label(p))}</b></div>
    <div class="sub">${p.n} ${p.n === 1 ? 'item' : 'items'}</div>
    <div class="tabs">${tab('photos', 'photos')}${tab('about', '[i] about')}</div>`;
}

const loading = (text: string) => `<div class="loading">${text}<i></i></div>`;

async function openPanel(p: Place, mode: 'photos' | 'about', fly = true) {
  current = { place: p, mode };
  panel.innerHTML = head(p, mode) + loading(mode === 'about' ? 'fetching wikipedia' : 'loading');
  panel.classList.add('open');
  history.replaceState(null, '', `#@${key(p)}${mode === 'about' ? '/about' : ''}`);
  if (fly) flyTo(p);
  const stillHere = () => current?.place === p && current.mode === mode;
  if (mode === 'photos') {
    let items = photoCache.get(key(p));
    if (!items) {
      const res = await fetch(`/map/place.json?lat=${p.spot_lat}&lng=${p.spot_lng}`);
      items = res.ok ? ((await res.json()) as { moments: PlaceMoment[] }).moments : [];
      photoCache.set(key(p), items);
    }
    if (stillHere()) renderPhotos(p, items);
  } else {
    let about = aboutCache.get(key(p));
    if (!about) {
      const res = await fetch(`/map/about.json?lat=${p.spot_lat}&lng=${p.spot_lng}&name=${encodeURIComponent(p.name ?? '')}`);
      about = (await res.json().catch(() => ({ error: 'no response' }))) as About;
      if (!about.error) aboutCache.set(key(p), about);
    }
    if (stillHere()) renderAbout(p, about);
  }
}

function renderPhotos(p: Place, items: PlaceMoment[]) {
  const sets = [...new Map(items.filter((m) => m.set).map((m) => [m.set!.id, m.set!])).values()];
  const viewable = items.filter((m) => m.src || m.youtube);
  panel.innerHTML = head(p, 'photos') + `
    <div class="grid">${items.map((m) => (m.thumb
      ? `<button data-id="${m.id}">${`<img src="${m.thumb}" alt="" loading="lazy">`}${m.youtube ? '<span class="p">▶</span>' : ''}</button>` : '')).join('')}</div>
    ${sets.length ? `<div class="sets">${sets.map((s) => `<a href="/sets/${s.id}">▸ ${esc(s.title.toLowerCase())}</a>`).join('')}</div>` : ''}
    <ol>${items.map((m) => `<li data-id="${m.id}"><span>${esc(m.date)}</span><span>${esc(m.caption ?? '')}</span></li>`).join('')}</ol>`;
  wire(p);
  const open = (id?: string) => {
    const i = viewable.findIndex((m) => m.id === id);
    if (i >= 0) openLightbox(viewable.map((m) => (m.youtube ? { ...m, src: null, meta: m.meta ?? m.date } : m)), i);
  };
  panel.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => open((el as unknown as El).dataset.id)));
}

function renderAbout(p: Place, a: About) {
  panel.innerHTML = head(p, 'about') + (a.error
    ? `<div class="note">// ${esc(a.error)}</div>`
    : `${a.description ? `<div class="desc">${esc(a.description.toLowerCase())}</div>` : ''}
      <p class="blurb">${esc(a.extract)}</p>
      <a class="src" href="${a.url}" target="_blank" rel="noopener">-- read more on wikipedia ↗</a>
      ${a.photos.length ? `<div class="grid">${a.photos.map((ph, i) => `<button data-ext="${i}"><img src="${ph.thumb}" alt="" loading="lazy"></button>`).join('')}</div>
      <div class="note">// photos from wikimedia commons, credited when opened</div>` : ''}`);
  wire(p);
  panel.querySelectorAll('[data-ext]').forEach((el) => el.addEventListener('click', () => {
    openLightbox(a.photos.map((ph, i) => ({ id: `wm${i}`, src: ph.src, caption: ph.caption, meta: ph.credit })), Number((el as unknown as El).dataset.ext));
  }));
}

function wire(p: Place) {
  $('.x', panel).onclick = closePanel;
  $('.tabs', panel).onclick = (e) => {
    const b = (e.target as unknown as El).closest('[data-mode]') as unknown as El | null;
    if (b) openPanel(p, b.dataset.mode as 'photos' | 'about', false);
  };
}

function closePanel() {
  panel.classList.remove('open');
  current = null;
  history.replaceState(null, '', location.pathname);
}

// ---- views, keys, spin ----
let spinning = false, raf = 0;
function spin() {
  if (!spinning) return;
  const c = map.getCenter();
  map.setCenter([c.lng + 0.08, c.lat]);
  raf = requestAnimationFrame(spin);
}
function stopSpin() { spinning = false; cancelAnimationFrame(raf); $('[data-k="r"]').classList.remove('on'); }
function go(k: string) {
  if (k === 'r') {
    if (spinning) return stopSpin();
    closePanel();
    map.easeTo({ zoom: 1.6 + fit, duration: 800 });
    spinning = true;
    $('[data-k="r"]').classList.add('on');
    setTimeout(spin, 850);
    return;
  }
  if (!VIEWS[k]) return;
  stopSpin();
  closePanel();
  map.flyTo({ ...VIEWS[k], duration: 3200, curve: 1.6 });
}
$('.keys').onclick = (e) => { const b = (e.target as unknown as El).closest('[data-k]') as unknown as El | null; if (b) go(b.dataset.k!); };
document.addEventListener('keydown', (e) => {
  if (document.querySelector('.lb.open') || (e.target as unknown as El).tagName === 'INPUT') return;
  if (e.key === 'Escape') closePanel();
  else go(e.key);
});
map.on('mousedown', stopSpin);
map.on('touchstart', stopSpin);

initLightbox();

// Deep link: #@lat,lng or #@lat,lng/about opens that place.
const deep = location.hash.match(/^#@(-?[\d.]+),(-?[\d.]+)(\/about)?$/);
if (deep) {
  const p = byKey.get(`${Number(deep[1])},${Number(deep[2])}`);
  if (p) map.once('idle', () => openPanel(p, deep[3] ? 'about' : 'photos'));
}
