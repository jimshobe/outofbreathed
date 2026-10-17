// The globe map (approved prototype: mocks/index.html), on real places.
//
// Places are ~100 m spots with photos (see listPlaces), embedded in the page as JSON. Markers are an
// HTML overlay positioned each frame and grouped by on-screen distance: small white squares, "+" for
// groups, names when zoomed in. A place opens a panel with its photos (lightbox); the ↗s by its name link
// out to Google Maps / Wikipedia, as everywhere (src/lib/maps-link.ts). #@lat,lng in the URL opens a place.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { openLightbox, initLightbox, type LbItem } from './lightbox';
import { darkStyle, addRouteLayers, fade } from './map-style';
import { placeParts, type LinkOverride } from '../lib/maps-link';

interface Place { spot_lat: number; spot_lng: number; lat: number; lng: number; n: number; name: string | null; latest: string; zoned: number; link: LinkOverride | null; spots?: Place[] }
interface PlaceMoment extends LbItem { thumb: string | null; date: string; taken_at: string; set: { id: string; title: string } | null }

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

const map = new maplibregl.Map({
  container: 'map',
  center: VIEWS.start.center,
  zoom: VIEWS.start.zoom,
  attributionControl: false,
  style: darkStyle({ globe: true }),
});
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
map.on('load', () => {
  $('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  // Faint atmosphere at globe zoom, gone when close.
  map.setSky({ 'atmosphere-blend': fade(0, 4, 0.35, 0) });
  // Ride routes (already trimmed out of privacy zones on the server). Tapping one opens its set.
  const routes = JSON.parse($('#routes').textContent ?? '[]');
  addRouteLayers(map, routes);
  map.on('click', 'routes-hit', (e) => { const id = e.features?.[0]?.properties?.id; if (id) location.href = `/sets/${id}`; });
  map.on('mouseenter', 'routes-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'routes-hit', () => { map.getCanvas().style.cursor = ''; });
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
    const p = c.members[0].p, w = (label(p).length + 1) * 7.8 + 24;
    const box = { x0: c.xy.x - 6, x1: c.xy.x + w, y0: c.xy.y - 10, y1: c.xy.y + 10 };
    c.nolabel = placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
    placed.push(c.nolabel ? { x0: c.xy.x - 6, x1: c.xy.x + 6, y0: c.xy.y - 6, y1: c.xy.y + 6 } : box);
  }
  marks.classList.toggle('labels', map.getZoom() > 7.5);
  marks.innerHTML = clusters.map((c) => {
    const style = `left:${c.xy.x}px;top:${c.xy.y}px`;
    if (c.members.length > 1) {
      return `<div class="mk group" style="${style}" data-keys="${c.members.map((o) => key(o.p)).join(';')}" aria-label="${c.members.length} places"><span class="n">+</span></div>`;
    }
    const p = c.members[0].p, k = key(p);
    return `<div class="mk${p === newest ? ' here' : ''}${p.zoned ? ' approx' : ''}${c.nolabel ? ' nolabel' : ''}" style="${style}" data-keys="${k}">
      <span class="sq"></span><span class="lbl"><span class="nm">${esc(label(p))}</span></span></div>`;
  }).join('');
}
map.on('render', drawMarks);

marks.addEventListener('click', (e) => {
  const target = e.target as unknown as El;
  const mk = target.closest('.mk') as unknown as El | null;
  if (!mk) return;
  stopSpin();
  const members = mk.dataset.keys!.split(';').map((k) => byKey.get(k)!);
  if (members.length === 1) return openPanel(members[0]);
  // Spots this close would still overlap after zooming in, so open them together; otherwise zoom in to
  // pull them apart (at zoom 15 pins ~150 m apart separate, so the next tap either splits or merges).
  if (spread(members) < 400) return openPanel(merge(members));
  const b = new maplibregl.LngLatBounds();
  members.forEach((p) => b.extend([p.lng, p.lat]));
  map.fitBounds(b, { padding: 120, maxZoom: 15, duration: 1800 });
});

/** Largest distance in metres between any two of the places. */
function spread(ps: Place[]) {
  let max = 0;
  for (const a of ps) for (const b of ps) {
    const x = (b.lng - a.lng) * DEG * Math.cos(((a.lat + b.lat) / 2) * DEG), y = (b.lat - a.lat) * DEG;
    max = Math.max(max, Math.hypot(x, y) * 6_371_000);
  }
  return max;
}

/** Several neighbouring spots as one place: named after the biggest, photos from all of them. */
function merge(ps: Place[]): Place {
  const n = ps.reduce((s, p) => s + p.n, 0);
  const top = [...ps].sort((a, b) => b.n - a.n)[0];
  return {
    ...top, n, spots: ps,
    lat: ps.reduce((s, p) => s + p.lat * p.n, 0) / n,
    lng: ps.reduce((s, p) => s + p.lng * p.n, 0) / n,
    latest: ps.map((p) => p.latest).sort().at(-1)!,
    zoned: Math.max(...ps.map((p) => p.zoned)),
  };
}

// ---- place panel: my photos ----
const panel = $('#panel');
let current: Place | null = null;
const photoCache = new Map<string, PlaceMoment[]>();

function flyTo(p: Place) {
  const offset: [number, number] = innerWidth > 700 ? [-200, 0] : [0, -innerHeight * 0.25];
  map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 9), offset, duration: map.getZoom() < 5 ? 3000 : 1200 });
}

// The name with its ↗ links ("stable ↗, tugun ↗"), like PlaceLinks.astro on the other pages.
function head(p: Place) {
  const parts = placeParts(p.name, p.zoned, p.spot_lat, p.spot_lng, p.link);
  const name = parts.length
    ? parts.map((x) => `${esc(x.text.toLowerCase())} <a class="gm" href="${esc(x.href)}" target="_blank" rel="noopener" aria-label="${esc(x.label)}">↗</a>`).join(', ')
    : esc(label(p));
  return `<button class="x" aria-label="Close">[esc]</button>
    <div class="cmd">&gt; <b>${name}</b></div>
    <div class="sub">${p.zoned ? 'general area' : '&nbsp;'}</div>`;
}

const loading = (text: string) => `<div class="loading">${text}<i></i></div>`;

async function openPanel(p: Place, fly = true) {
  current = p;
  panel.innerHTML = head(p) + loading('loading');
  panel.classList.add('open');
  history.replaceState(null, '', `#@${key(p)}`);
  if (fly) flyTo(p);
  const lists = await Promise.all((p.spots ?? [p]).map(async (s) => {
    let items = photoCache.get(key(s));
    if (!items) {
      const res = await fetch(`/map/place.json?lat=${s.spot_lat}&lng=${s.spot_lng}`);
      items = res.ok ? ((await res.json()) as { moments: PlaceMoment[] }).moments : [];
      photoCache.set(key(s), items);
    }
    return items;
  }));
  const items = lists.flat().sort((a, b) => b.taken_at.localeCompare(a.taken_at)); // newest first, like one spot
  if (current === p) renderPhotos(p, items);
}

function renderPhotos(p: Place, items: PlaceMoment[]) {
  const sets = [...new Map(items.filter((m) => m.set).map((m) => [m.set!.id, m.set!])).values()];
  const viewable = items.filter((m) => m.src || m.youtube);
  panel.innerHTML = head(p) + `
    <div class="grid">${items.map((m) => (m.thumb
      ? `<button data-id="${m.id}">${`<img src="${m.thumb}" alt="" loading="lazy">`}${m.youtube ? '<span class="p">▶</span>' : ''}</button>` : '')).join('')}</div>
    ${sets.length ? `<div class="sets">${sets.map((s) => `<a href="/sets/${s.id}">▸ ${esc(s.title.toLowerCase())}</a>`).join('')}</div>` : ''}
    <ol>${items.map((m) => `<li data-id="${m.id}"><span>${esc(m.date)}</span><span>${esc(m.caption ?? '')}</span></li>`).join('')}</ol>`;
  $('.x', panel).onclick = closePanel;
  const open = (id?: string) => {
    const i = viewable.findIndex((m) => m.id === id);
    if (i >= 0) openLightbox(viewable.map((m) => (m.youtube ? { ...m, src: null, meta: m.meta ?? m.date } : m)), i);
  };
  panel.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => open((el as unknown as El).dataset.id)));
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

// Deep link: #@lat,lng opens that place (an old /about suffix is ignored).
const deep = location.hash.match(/^#@(-?[\d.]+),(-?[\d.]+)(\/about)?$/);
if (deep) {
  const p = byKey.get(`${Number(deep[1])},${Number(deep[2])}`);
  if (p) map.once('idle', () => openPanel(p));
}
