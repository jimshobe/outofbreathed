// The place fields shared by the photo editor and the set editor: business and suburb, each saved on its
// own (Enter, [save], or picking a suggestion), so fixing one keeps the other. Typing suggests names
// already used on the site and OpenStreetMap matches near the photo (/api/places/search); the business
// field also lists nearby venues (/api/places/nearby). Styles are in src/components/EditorSheet.astro.
import { placeFields } from '../lib/maps-link';

type El = HTMLElement;
type Part = 'venue' | 'area';
interface Hit { value: string; area: string | null; note: string }
export type PlaceEdit = { venue?: string; area?: string };

export interface PlaceInputOptions {
  /** The place name now; for a set, every photo's name (they may differ). */
  names: (string | null)[];
  lat: number | null;
  lng: number | null;
  /** Save the changed part ('' clears it); resolve true once saved. */
  save: (edit: PlaceEdit) => Promise<boolean>;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const LABEL: Record<Part, string> = { venue: 'business', area: 'suburb' };
const HINT: Record<Part, string> = { venue: 'type to search, e.g. Seoul Kitchen', area: 'type to search, e.g. Southport' };

/** The fields' markup; put it in the page, then call attachPlaceFields on its .pf element. */
export const placeFieldsHtml = (prefix: string) => `<div class="pf">${(['venue', 'area'] as Part[]).map((p) => `
  <div class="pfrow" data-part="${p}">
    <label for="${prefix}-${p}">${LABEL[p]}</label>
    <span class="pfbox"><input id="${prefix}-${p}" type="text" maxlength="120" autocomplete="off" spellcheck="false" placeholder="${HINT[p]}"><ul class="pfsug" hidden></ul></span>
    <button type="button" class="pfsave">[save]</button>
    <span class="chips pfchips"></span>
  </div>`).join('')}
  <p class="pfhint">// type your own, or pick a suggestion. enter or [save] keeps it; esc undoes.</p></div>`;

const nearbyCache = new Map<string, Promise<string[]>>();
const searchCache = new Map<string, Hit[]>();

export function attachPlaceFields(root: El, o: PlaceInputOptions) {
  const row = (p: Part) => root.querySelector(`[data-part=${p}]`) as unknown as El;
  const input = (p: Part) => row(p).querySelector('input') as unknown as HTMLInputElement;
  const saved: Record<Part, string> = { venue: '', area: '' };

  for (const p of ['venue', 'area'] as Part[]) {
    const values = [...new Set(o.names.map((n) => placeFields(n)[p] ?? ''))];
    const i = input(p);
    if (values.length === 1) i.value = saved[p] = values[0];
    else i.placeholder = `mixed: ${values.map((v) => v || '(none)').join(' / ').toLowerCase()}`;
    wire(p);
  }
  nearby();

  function markDirty(p: Part) { row(p).classList.toggle('dirty', input(p).value.trim() !== saved[p]); }

  async function commit(p: Part, extra: PlaceEdit = {}) {
    const v = input(p).value.trim();
    if (v === saved[p] && !Object.keys(extra).length) return;
    if (!(await o.save({ [p]: v, ...extra }))) return;
    saved[p] = v;
    input(p).value = v;
    for (const [k, x] of Object.entries(extra) as [Part, string][]) { saved[k] = x; input(k).value = x; markDirty(k); }
    markDirty(p);
    nearby();
  }

  // Picking a business also fills an empty suburb; a different suburb is offered as a chip instead.
  function pick(p: Part, h: Hit) {
    input(p).value = h.value;
    const other = p === 'venue' && h.area && h.area !== saved.area ? h.area : null;
    if (other && !saved.area && !input('area').value.trim()) return commit(p, { area: other });
    commit(p);
    const chips = row('area').querySelector('.pfchips') as unknown as El;
    chips.innerHTML = other ? `<span class="note">that business is in:</span><button type="button" data-area="${esc(other)}">${esc(other.toLowerCase())}</button>` : '';
  }

  function wire(p: Part) {
    const r = row(p), i = input(p), list = r.querySelector('.pfsug') as unknown as El;
    let hits: Hit[] = [], active = -1, timer = 0, ctl: AbortController | null = null;
    const close = () => { list.hidden = true; active = -1; };
    const show = (q: string) => {
      list.innerHTML = hits.length
        ? hits.map((h, k) => `<li><button type="button" data-k="${k}"${k === active ? ' class="on"' : ''}>${esc(h.value.toLowerCase())}<span>${esc(h.note.toLowerCase())}</span></button></li>`).join('')
        : `<li class="none">// nothing found for “${esc(q.toLowerCase())}”. enter keeps it as typed.</li>`;
      list.hidden = false;
    };
    async function search() {
      const q = i.value.trim();
      if (q.length < 2 || q === saved[p]) return close();
      const key = `${p}|${q.toLowerCase()}|${o.lat ?? ''},${o.lng ?? ''}`;
      if (!searchCache.has(key)) {
        ctl?.abort(); ctl = new AbortController();
        const qs = new URLSearchParams({ kind: p, q, lat: String(o.lat ?? ''), lng: String(o.lng ?? '') });
        const res = await fetch(`/api/places/search?${qs}`, { signal: ctl.signal }).catch(() => null);
        if (!res?.ok) return;
        searchCache.set(key, ((await res.json()) as { results: Hit[] }).results);
      }
      if (i.value.trim() !== q || document.activeElement !== (i as unknown)) return;
      hits = searchCache.get(key)!; active = -1; show(q);
    }

    i.addEventListener('input', () => { markDirty(p); clearTimeout(timer); timer = window.setTimeout(search, 250); });
    i.addEventListener('blur', () => setTimeout(close, 150));
    i.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if ((k === 'ArrowDown' || k === 'ArrowUp') && !list.hidden && hits.length) {
        e.preventDefault();
        active = k === 'ArrowDown' ? (active + 1) % hits.length : active <= 0 ? hits.length - 1 : active - 1;
        show(i.value.trim());
      } else if (k === 'Enter') {
        e.preventDefault();
        const h = active >= 0 && !list.hidden ? hits[active] : null;
        close();
        if (h) pick(p, h); else commit(p);
      } else if (k === 'Escape') {
        e.stopPropagation();
        if (!list.hidden) close(); else { i.value = saved[p]; markDirty(p); }
      }
    });
    // pointerdown would blur the input first and close the list before the click lands.
    list.addEventListener('pointerdown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const b = (e.target as unknown as El).closest('[data-k]') as unknown as El | null;
      if (!b) return;
      const h = hits[Number(b.dataset.k)];
      close();
      pick(p, h);
    });
    (r.querySelector('.pfsave') as unknown as El).addEventListener('click', () => { close(); commit(p); });
    (r.querySelector('.pfchips') as unknown as El).addEventListener('click', (e) => {
      const b = (e.target as unknown as El).closest('button') as unknown as El | null;
      if (!b) return;
      if (b.dataset.area) { input('area').value = b.dataset.area; commit('area'); b.remove(); }
      if (b.dataset.venue) pick('venue', { value: b.dataset.venue, area: b.dataset.va || null, note: '' });
    });
  }

  // Nearby venues for the photo's position, as chips under the business field.
  function nearby() {
    if (o.lat == null || o.lng == null) return;
    const key = `${o.lat},${o.lng}`, chips = row('venue').querySelector('.pfchips') as unknown as El;
    if (!nearbyCache.has(key)) {
      chips.innerHTML = '<span class="note">finding nearby places…</span>';
      nearbyCache.set(key, fetch(`/api/places/nearby?lat=${o.lat}&lng=${o.lng}`).then((r) => (r.ok ? r.json() : {}))
        .then((r: { choices?: string[] }) => r.choices ?? []).catch(() => []));
    }
    nearbyCache.get(key)!.then((choices) => {
      if (!root.isConnected) return;
      const venues = choices.map(placeFields).filter((f) => f.venue && f.venue !== saved.venue);
      chips.innerHTML = venues.length
        ? `<span class="note">nearby:</span>${venues.map((f) => `<button type="button" data-venue="${esc(f.venue!)}" data-va="${esc(f.area ?? '')}">${esc(f.venue!.toLowerCase())}</button>`).join('')}`
        : '';
    });
  }
}
