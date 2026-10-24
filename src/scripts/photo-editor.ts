// The owner's photo editor: a full-screen sheet over /manage and the set editor (markup and styles in
// src/components/EditorSheet.astro). Every field saves when you leave it, through the same APIs as
// before (PATCH /api/moments/:id, PATCH /api/sets/:id for the cover, DELETE to remove).
import { fmtDay } from '../lib/timeline';
import { CATEGORIES } from '../lib/categories';

export interface EditorSet { id: string; title: string; cover_id: string | null }
interface Moment {
  id: string; kind: string; source: string; taken_at: string; place_name: string | null; caption: string | null;
  media_key: string | null; thumb_key: string | null; youtube_id: string | null; set_id: string | null;
  lat: number | null; lng: number | null; zoned: number; categories: string[];
}
export interface EditorOptions {
  /** Ids to step through with ‹ prev / next ›, in order (the grid the editor was opened from). */
  list: string[];
  sets: EditorSet[];
  /** After any saved change, with the photo as it now is. */
  onChange?: (m: Moment) => void;
  onDelete?: (id: string) => void;
  onClose?: () => void;
}

type El = HTMLElement;
const $ = <T = El>(sel: string, root: { querySelector(s: string): unknown } = document) => root.querySelector(sel) as T;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const media = (key: string) => `/media/${key.split('/').map(encodeURIComponent).join('/')}`;

const sheet = $('#sheet');
let opts: EditorOptions;
let current: Moment | null = null;
let confirmingDelete = false;

export async function openPhotoEditor(id: string, o: EditorOptions) {
  opts = o;
  document.body.classList.add('sheet-open');
  sheet.hidden = false;
  await load(id);
}

async function load(id: string) {
  confirmingDelete = false;
  sheet.innerHTML = `<div class="in"><div class="sheethead"><button type="button" data-act="close">&lt; back</button></div><p class="note">loading…</p></div>`;
  const res = await fetch(`/api/moments/${encodeURIComponent(id)}`);
  if (!res.ok) { sheet.innerHTML = `<div class="in"><div class="sheethead"><button type="button" data-act="close">&lt; back</button></div><p class="note">// that photo is gone</p></div>`; return; }
  current = (await res.json()) as Moment;
  render();
  suggest();
}

function close() {
  sheet.hidden = true;
  sheet.innerHTML = '';
  document.body.classList.remove('sheet-open');
  current = null;
  opts.onClose?.();
}

function render() {
  const m = current!;
  const i = opts.list.indexOf(m.id);
  const set = opts.sets.find((s) => s.id === m.set_id);
  const img = m.media_key ? media(m.media_key) : m.youtube_id ? `https://i.ytimg.com/vi/${m.youtube_id}/hqdefault.jpg` : null;
  const view = m.set_id ? `/sets/${m.set_id}#p-${m.id}` : `/#m-${m.id}`;
  sheet.innerHTML = `<div class="in">
    <div class="sheethead"><button type="button" data-act="close">&lt; back</button>
      <span class="pager"><button type="button" data-act="prev"${i <= 0 ? ' disabled' : ''}>‹ prev</button><button type="button" data-act="next"${i < 0 || i >= opts.list.length - 1 ? ' disabled' : ''}>next ›</button></span></div>
    <div class="preview">${img ? `<img src="${img}" alt="">` : ''}${m.youtube_id ? '<span class="play">▶ youtube</span>' : ''}</div>
    <div class="efields">
      <label class="erow"><span>caption</span><input id="e-caption" type="text" value="${esc(m.caption ?? '')}" placeholder="caption" maxlength="300"></label>
      <label class="erow"><span>taken</span><input id="e-taken" type="datetime-local" step="1" value="${m.taken_at.slice(0, 19)}"></label>
      <div class="erow"><label for="e-place">place</label><input id="e-place" type="text" value="${esc(m.place_name ?? '')}" placeholder="name, suburb, e.g. Seoul Kitchen, Southport" maxlength="120">
        <span class="chips" id="e-chips">${m.lat != null ? '<span class="note">finding nearby places…</span>' : ''}</span></div>
      ${m.zoned ? '<p class="note">// inside a privacy zone: visitors see only the suburb.</p>' : ''}
      <div class="erow"><span>tags</span><span class="etags">${CATEGORIES.map((c) => `<label><input type="checkbox" data-tag="${c}"${m.categories.includes(c) ? ' checked' : ''}> ${c}</label>`).join('')}</span></div>
      <label class="erow"><span>set</span><select id="e-set"><option value="">no set</option>${opts.sets.map((s) => `<option value="${s.id}"${s.id === m.set_id ? ' selected' : ''}>${esc(s.title.toLowerCase())}</option>`).join('')}</select></label>
      <div class="eactions">
        ${set && m.media_key ? `<button type="button" data-act="cover">${set.cover_id === m.id ? '★ set cover' : '☆ make set cover'}</button>` : ''}
        <a href="${view}" target="_blank" rel="noopener">[view on site ↗]</a>
        ${confirmingDelete
          ? `<span class="confirm">delete this photo and its file? <button type="button" data-act="del-yes">[yes, delete]</button> <button type="button" data-act="del-no">[keep]</button></span>`
          : '<button type="button" class="danger" data-act="del">[delete]</button>'}
        <span class="status" id="e-status"></span>
      </div>
    </div></div>`;
}

// Nearby venue names for the photo's position, as tap-to-use chips.
async function suggest() {
  const m = current;
  if (!m || m.lat == null || m.lng == null) return;
  const res = await fetch(`/api/places/nearby?lat=${m.lat}&lng=${m.lng}`).catch(() => null);
  const r = res?.ok ? ((await res.json()) as { choices?: string[] }) : {};
  const chips = sheet.querySelector('#e-chips') as unknown as El | null;
  if (!chips || current !== m) return;
  const choices = (r.choices ?? []).filter((c) => c !== m.place_name);
  chips.innerHTML = choices.map((c) => `<button type="button" data-pick="${esc(c)}">${esc(c.toLowerCase())}</button>`).join('');
}

function status(text: string) {
  const s = sheet.querySelector('#e-status') as unknown as El | null;
  if (!s) return;
  s.textContent = text;
  if (text === 'saved') setTimeout(() => { if (s.textContent === 'saved') s.textContent = ''; }, 1500);
}

async function save(edit: Record<string, unknown>) {
  const m = current!;
  status('…');
  const res = await fetch(`/api/moments/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit) });
  if (!res.ok) { status(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'error'); return false; }
  Object.assign(m, edit.categories ? { categories: edit.categories } : edit);
  status('saved');
  opts.onChange?.(m);
  return true;
}

sheet.addEventListener('click', async (e) => {
  const b = (e.target as unknown as El).closest('button') as unknown as El | null;
  if (!b || !current) {
    if (b?.dataset.act === 'close') close();
    return;
  }
  const m = current;
  if (b.dataset.pick) {
    ($<HTMLInputElement>('#e-place', sheet)).value = b.dataset.pick;
    if (await save({ place_name: b.dataset.pick })) b.remove();
    return;
  }
  const i = opts.list.indexOf(m.id);
  switch (b.dataset.act) {
    case 'close': close(); break;
    case 'prev': if (i > 0) load(opts.list[i - 1]); break;
    case 'next': if (i >= 0 && i < opts.list.length - 1) load(opts.list[i + 1]); break;
    case 'cover': {
      const res = await fetch(`/api/sets/${m.set_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cover_id: m.id }) });
      if (!res.ok) { status('error'); break; }
      const set = opts.sets.find((s) => s.id === m.set_id);
      if (set) set.cover_id = m.id;
      render(); suggest(); status('saved');
      opts.onChange?.(m);
      break;
    }
    case 'del': confirmingDelete = true; render(); suggest(); break;
    case 'del-no': confirmingDelete = false; render(); suggest(); break;
    case 'del-yes': {
      const res = await fetch(`/api/moments/${m.id}`, { method: 'DELETE' });
      if (!res.ok) { status('delete failed'); break; }
      opts.list = opts.list.filter((x) => x !== m.id);
      opts.onDelete?.(m.id);
      const next = opts.list[Math.min(i, opts.list.length - 1)];
      if (next && i >= 0) load(next); else close();
      break;
    }
  }
});

sheet.addEventListener('change', (e) => {
  const t = e.target as unknown as HTMLInputElement;
  const m = current;
  if (!m) return;
  if (t.id === 'e-caption') save({ caption: t.value });
  if (t.id === 'e-place') save({ place_name: t.value });
  if (t.id === 'e-taken' && t.value) {
    // Keep the photo's own time-zone offset; a value without seconds gets :00.
    const v = t.value.length === 16 ? `${t.value}:00` : t.value;
    save({ taken_at: v + m.taken_at.slice(19).replace(/^\.\d+/, '') });
  }
  if (t.dataset.tag) {
    const cats = Array.from(sheet.querySelectorAll('[data-tag]') as unknown as HTMLInputElement[]).filter((x) => x.checked).map((x) => x.dataset.tag!);
    save({ categories: cats });
  }
  if (t.id === 'e-set') save({ set_id: t.value || null }).then((ok) => { if (ok) { render(); suggest(); } });
});

document.addEventListener('keydown', (e) => {
  if (sheet.hidden || !current) return;
  const tag = (e.target as unknown as El).tagName;
  if (e.key === 'Escape') close();
  if (tag === 'INPUT' || tag === 'SELECT') return;
  if (e.key === 'ArrowLeft') ($('[data-act=prev]', sheet) as unknown as HTMLButtonElement | null)?.click();
  if (e.key === 'ArrowRight') ($('[data-act=next]', sheet) as unknown as HTMLButtonElement | null)?.click();
});

/** For tiles and labels: "17-10-26 · stable, tugun". */
export const tileLabel = (m: { taken_at: string; place_name: string | null }) =>
  [fmtDay(m.taken_at), m.place_name?.toLowerCase()].filter(Boolean).join(' · ');
