// The owner's posting form (src/components/PostForm.astro).
//
// Photos and YouTube links go into a queue. Each row has its own caption and only asks for a date or a
// place when the item lacks one. On post, photos are shrunk on the device (date and location are read
// from the original first and sent as fields), uploaded three at a time, and retried on network errors.
// Failed rows stay queued for [retry failed]. Tags and set are remembered for next time.
//
// Photos with GPS are grouped into spots (~100 m). Each spot looks up nearby place names once
// (/api/places/nearby) and offers them in a dropdown on its rows, starting with the suggestion; picking
// one (or typing "other…") sets the place for every photo at that spot.
import { readJpegMeta } from '../lib/exif';
import { shrink } from './shrink';
import { fmtDay as day } from '../lib/timeline';

interface Spot {
  lat: number;
  lng: number;
  state: 'loading' | 'ready';
  choices: string[];
  chosen: string;        // '' = let the server decide
  typing: boolean;       // "other…" picked: use `typed`
  typed: string;
}

interface Item {
  id: number;
  kind: 'photo' | 'youtube';
  file?: File;
  url?: string;          // YouTube link
  preview?: string;      // object URL for the thumbnail
  takenAt?: string;      // from the photo's EXIF
  lat?: number;
  lng?: number;
  caption: string;
  place: string;         // typed, only used when the item has no location
  spot?: Spot;           // photos with GPS: where its place name comes from
  date: string;          // typed (yyyy-mm-dd), only used when the item has no date
  status: 'ready' | 'uploading' | 'done' | 'failed' | 'error';
  posted?: string;       // the new moment's id, once uploaded
  message: string;
}

// Worker types in the shared tsconfig redefine DOM `Element`, so DOM lookups are cast through these.
type El = HTMLElement;
const $ = <T = El>(sel: string, root: { querySelector(s: string): unknown } = document) => root.querySelector(sel) as T;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const form = $<HTMLFormElement>('#up');
const queueEl = $('.queue', form), batchEl = $('.batch', form), hintEl = $('.hint', form);
const fileInput = $<HTMLInputElement>('input[type=file]', form);
const setInput = $<HTMLInputElement>('[name=set_title]', form);
const captionInput = $<HTMLInputElement>('[name=batch_caption]', form);
const captionLabel = $('.caplabel', form);
const goBtn = $<HTMLButtonElement>('.go', form), retryBtn = $<HTMLButtonElement>('.retry', form);
const summary = $('.summary', form);
const catBoxes = () => Array.from(form.querySelectorAll('[name=category]') as unknown as HTMLInputElement[]);

let items: Item[] = [];
let nextId = 1;
const spots: Spot[] = [];

// ---- remembered choices (per device; harmless if storage is unavailable) ----
const remember = (k: string, v: string) => { try { localStorage.setItem(`post.${k}`, v); } catch { /* private mode */ } };
const recall = (k: string) => { try { return localStorage.getItem(`post.${k}`) ?? ''; } catch { return ''; } };
const savedCats = recall('categories').split(',').filter(Boolean);
catBoxes().forEach((b) => { b.checked = savedCats.includes(b.value); });
setInput.value = recall('set');

// ---- helpers ----


function nowLocal() {
  const now = new Date(), off = -now.getTimezoneOffset();
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  return `${new Date(now.getTime() + off * 60000).toISOString().slice(0, 19)}${off >= 0 ? '+' : '-'}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

const isJpeg = (f: File) => f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name);
const needsPlace = (it: Item) => it.lat == null;
const needsDate = (it: Item) => !it.takenAt;

// ---- spots: nearby place names, looked up one at a time (Nominatim allows 1 request a second) ----
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const k = Math.PI / 180;
  return Math.hypot((b.lat - a.lat) * k, (b.lng - a.lng) * k * Math.cos(a.lat * k)) * 6_371_000;
};
let lookups = Promise.resolve();
function spotFor(lat: number, lng: number): Spot {
  const near = spots.find((s) => metres(s, { lat, lng }) < 100);
  if (near) return near;
  const spot: Spot = { lat, lng, state: 'loading', choices: [], chosen: '', typing: false, typed: '' };
  spots.push(spot);
  lookups = lookups.then(async () => {
    try {
      const res = await fetch(`/api/places/nearby?lat=${lat}&lng=${lng}`);
      const r = (await res.json()) as { suggested?: string | null; choices?: string[] };
      spot.choices = r.choices ?? [];
      if (!spot.chosen && !spot.typing) spot.chosen = r.suggested ?? '';
    } catch { /* the server names it on upload instead */ }
    spot.state = 'ready';
    renderSpot(spot);
  });
  return spot;
}

function placeField(s: Spot) {
  if (s.state === 'loading') return `<span class="f placing">place: finding nearby places…</span>`;
  const opts = s.choices.map((c) => `<option value="${esc(c)}"${!s.typing && c === s.chosen ? ' selected' : ''}>${esc(c.toLowerCase())}</option>`).join('');
  return `<label class="f placepick">place <select data-spot>${opts || '<option value="">(automatic)</option>'}<option value="__other"${s.typing ? ' selected' : ''}>other… (type it)</option></select></label>
    ${s.typing ? `<input class="f" type="text" data-spot-typed value="${esc(s.typed)}" maxlength="120" placeholder="name, suburb, e.g. Seoul Kitchen, Southport">` : ''}`;
}

/** Re-render just the rows at one spot (keeps focus elsewhere). */
function renderSpot(s: Spot) {
  for (const it of items) {
    if (it.spot !== s) continue;
    const li = queueEl.querySelector(`li[data-id="${it.id}"]`) as unknown as El | null;
    if (li) li.outerHTML = rowHtml(it);
  }
}

// ---- rendering ----
function rowHtml(it: Item) {
  const thumb = it.kind === 'youtube' ? '<span>▶</span>' : it.preview ? `<img src="${it.preview}" alt="">` : '<span>…</span>';
  const info = it.kind === 'youtube'
    ? `<input type="url" data-f="url" value="${esc(it.url ?? '')}" placeholder="youtube link (upload as Unlisted)">`
    : it.status === 'error'
      ? `<span class="warn">${esc(it.message)}</span>`
      : `${it.takenAt ? day(it.takenAt) : '<span class="warn">no date</span>'} · ${it.lat != null ? 'location ✓' : '<span class="warn">no location</span>'}`;
  const st = { ready: '', uploading: '…', done: '✓', failed: esc(it.message || '✗'), error: '' }[it.status];
  const fields = it.status === 'error' ? '' : `
    <input class="f" type="text" data-f="caption" value="${esc(it.caption)}" maxlength="300" placeholder="caption">
    ${needsPlace(it) ? `<input class="f" type="text" data-f="place" value="${esc(it.place)}" maxlength="120" placeholder="where? e.g. Springbrook, QLD">` : ''}
    ${needsDate(it) ? `<input class="f" type="date" data-f="date" value="${esc(it.date)}" aria-label="date taken">` : ''}
    ${it.spot ? placeField(it.spot) : ''}`;
  return `<li data-id="${it.id}" class="${it.status}">
    <span class="th">${thumb}</span>
    <span class="info">${info}</span>
    <span><span class="st ${it.status === 'done' ? 'ok' : it.status === 'failed' ? 'bad' : ''}">${st}</span>
      ${it.status === 'done' || it.status === 'uploading' ? '' : '<button type="button" class="rm" aria-label="Remove">[×]</button>'}</span>
    ${fields}
  </li>`;
}

function render() {
  queueEl.innerHTML = items.map(rowHtml).join('');
  batchEl.hidden = !items.length;
  hintEl.hidden = !items.some((it) => it.kind === 'photo' && it.status !== 'error' && needsPlace(it));
  const left = items.filter((it) => it.status === 'ready' || it.status === 'failed').length;
  goBtn.textContent = left ? `[ post ${left} ]` : '[ post ]';
  goBtn.disabled = !left;
  retryBtn.hidden = !items.some((it) => it.status === 'failed');
  updateCaptionLabel();
}

function updateRow(it: Item) {
  const li = queueEl.querySelector(`li[data-id="${it.id}"]`) as unknown as El | null;
  if (!li) return;
  // Keep any focused field: replace only the status bits.
  li.className = it.status;
  const st = $('.st', li);
  st.className = `st ${it.status === 'done' ? 'ok' : it.status === 'failed' ? 'bad' : ''}`;
  st.textContent = { ready: '', uploading: '…', done: '✓', failed: it.message || '✗', error: '' }[it.status];
  if (it.status === 'uploading' || it.status === 'done') $('.rm', li)?.remove();
}

function updateCaptionLabel() {
  const making = setInput.value.trim() !== '';
  captionLabel.textContent = making ? 'set caption' : 'caption';
  captionInput.placeholder = making ? 'about the whole set' : 'for any photo without its own';
}

// ---- adding items ----
fileInput.addEventListener('change', async () => {
  const files = Array.from(fileInput.files ?? []);
  fileInput.value = ''; // so picking the same files again still fires
  const added: Item[] = files.map((file) => {
    const video = file.type.startsWith('video/');
    return {
      id: nextId++, kind: 'photo', file, preview: video ? undefined : URL.createObjectURL(file),
      caption: '', place: '', date: '', status: video ? 'error' : 'ready',
      message: video ? `${file.name}: videos go on youtube, add a link instead` : '',
    };
  });
  items.push(...added);
  render();
  // Date and location come from the original file (EXIF sits in its first few hundred KB).
  for (const it of added) {
    if (it.status === 'error' || !isJpeg(it.file!)) continue;
    const meta = readJpegMeta(new Uint8Array(await it.file!.slice(0, 512 * 1024).arrayBuffer()));
    Object.assign(it, { takenAt: meta.takenAt, lat: meta.lat, lng: meta.lng });
    if (meta.lat != null && meta.lng != null) it.spot = spotFor(meta.lat, meta.lng);
  }
  render();
});

$('.addyt', form).addEventListener('click', () => {
  items.push({ id: nextId++, kind: 'youtube', url: '', caption: '', place: '', date: '', status: 'ready', message: '' });
  render();
  ($<HTMLInputElement>(`li[data-id="${nextId - 1}"] [data-f=url]`, queueEl))?.focus();
});

// Typing updates the item in place (no re-render, so focus and cursor stay put).
queueEl.addEventListener('input', (e) => {
  const input = e.target as unknown as HTMLInputElement;
  const li = input.closest('li') as unknown as El | null;
  const it = items.find((x) => String(x.id) === li?.dataset.id);
  if (it?.spot && input.dataset.spotTyped !== undefined) {
    it.spot.typed = input.value;
    // Mirror into the spot's other rows without re-rendering this one.
    queueEl.querySelectorAll('[data-spot-typed]').forEach((other) => {
      const o = other as unknown as HTMLInputElement, oit = items.find((x) => String(x.id) === (o.closest('li') as unknown as El).dataset.id);
      if (o !== input && oit?.spot === it.spot) o.value = input.value;
    });
    return;
  }
  if (!it || !input.dataset.f) return;
  (it as unknown as Record<string, string>)[input.dataset.f] = input.value;
  if (it.status === 'failed') { it.status = 'ready'; it.message = ''; updateRow(it); }
});

// Picking a place applies to every photo at that spot.
queueEl.addEventListener('change', (e) => {
  const sel = e.target as unknown as HTMLSelectElement;
  if (sel.dataset.spot === undefined) return;
  const it = items.find((x) => String(x.id) === (sel.closest('li') as unknown as El).dataset.id);
  const s = it?.spot;
  if (!s) return;
  s.typing = sel.value === '__other';
  if (!s.typing) s.chosen = sel.value;
  renderSpot(s);
  if (s.typing) ($<HTMLInputElement>(`li[data-id="${it.id}"] [data-spot-typed]`, queueEl))?.focus();
});

queueEl.addEventListener('click', (e) => {
  const btn = (e.target as unknown as El).closest('.rm') as unknown as El | null;
  if (!btn) return;
  const id = (btn.closest('li') as unknown as El).dataset.id;
  const it = items.find((x) => String(x.id) === id);
  if (it?.preview) URL.revokeObjectURL(it.preview);
  items = items.filter((x) => x !== it);
  render();
});

setInput.addEventListener('input', updateCaptionLabel);

$('.clear', form).addEventListener('click', () => {
  items.forEach((it) => it.preview && URL.revokeObjectURL(it.preview));
  items = [];
  spots.length = 0;
  summary.textContent = '';
  render();
});

// ---- posting ----
type ApiResult = { id?: string; created?: boolean; error?: string };
const json = async (res: Response) => (await res.json().catch(() => ({}))) as ApiResult;

async function buildForm(it: Item, shared: { categories: string[]; setId: string | null; defaultCaption: string }): Promise<FormData> {
  const fd = new FormData();
  shared.categories.forEach((c) => fd.append('category', c));
  if (shared.setId) fd.append('set_id', shared.setId);
  const caption = it.caption.trim() || shared.defaultCaption;
  if (caption) fd.append('caption', caption);
  // Values read from the photo go as fields, so shrinking (which drops all metadata) loses nothing.
  if (it.takenAt) fd.append('taken_at', it.takenAt);
  else fd.append('fallback_taken_at', it.date ? `${it.date}T12:00:00` : nowLocal());
  if (it.lat != null && it.lng != null) {
    fd.append('lat', String(it.lat)); fd.append('lng', String(it.lng));
    const place = it.spot ? (it.spot.typing ? it.spot.typed.trim() : it.spot.chosen) : '';
    if (place) fd.append('place_name', place);
  }
  else if (it.place.trim()) fd.append('fallback_place', it.place.trim());
  if (it.kind === 'youtube') {
    fd.append('youtube', (it.url ?? '').trim());
    fd.append('source_ref', `yt:${(it.url ?? '').trim()}`);
  } else {
    const f = it.file!;
    const small = await shrink(f);
    fd.append('file', small ?? f, small ? f.name.replace(/\.\w+$/, '') + '.jpg' : f.name);
    // Picking the same photo again gives the same ref, so the server returns it instead of duplicating it.
    fd.append('source_ref', `web:${f.name}:${f.size}:${f.lastModified}`);
  }
  return fd;
}

async function upload(it: Item, shared: Parameters<typeof buildForm>[1]) {
  it.status = 'uploading'; it.message = '';
  updateRow(it);
  let fd: FormData;
  try { fd = await buildForm(it, shared); } catch { it.status = 'failed'; it.message = "couldn't read this photo"; updateRow(it); return; }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('/api/moments', { method: 'POST', body: fd });
      const r = await json(res);
      if (res.ok) { it.status = 'done'; it.posted = r.id; updateRow(it); return; }
      if (res.status < 500) { it.status = 'failed'; it.message = r.error ?? `error ${res.status}`; updateRow(it); return; }
    } catch { /* network: retry */ }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  it.status = 'failed'; it.message = 'no connection; retry'; updateRow(it);
}

async function postAll() {
  const todo = items.filter((it) => it.status === 'ready' || it.status === 'failed');
  if (!todo.length) return;
  const youtubeMissing = todo.find((it) => it.kind === 'youtube' && !(it.url ?? '').trim());
  if (youtubeMissing) { summary.textContent = 'paste the youtube link first'; return; }

  const categories = catBoxes().filter((b) => b.checked).map((b) => b.value);
  const setTitle = setInput.value.trim();
  const batchCaption = captionInput.value.trim();
  remember('categories', categories.join(','));
  remember('set', setTitle);
  goBtn.disabled = true; retryBtn.hidden = true;

  let setId: string | null = null;
  if (setTitle) {
    const res = await fetch('/api/sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: setTitle, caption: batchCaption }) });
    const r = await json(res);
    if (!res.ok || !r.id) { summary.textContent = `set: ${r.error ?? res.status}`; render(); return; }
    setId = r.id;
  }
  // With a set, the batch caption describes the set; without one, it fills in photos' empty captions.
  const shared = { categories, setId, defaultCaption: setTitle ? '' : batchCaption };

  summary.textContent = `posting ${todo.length}…`;
  const queue = [...todo];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (let it; (it = queue.shift()); ) await upload(it, shared);
  }));

  const done = items.filter((it) => it.status === 'done').length;
  const failed = items.filter((it) => it.status === 'failed').length;
  render();
  if (failed) {
    summary.textContent = `${done} posted, ${failed} failed (fix or retry them)`;
  } else {
    const ids = items.filter((it) => it.posted).map((it) => it.posted).join(',');
    summary.innerHTML = `${done} posted · <a href="${setId ? `/sets/${setId}` : '/'}">[view]</a> · <a href="${setId ? `/manage/sets/${setId}` : `/manage?ids=${ids}#photos`}">[edit these]</a>`;
  }
}

form.addEventListener('submit', (e) => { e.preventDefault(); postAll(); });
retryBtn.addEventListener('click', postAll);

render();
