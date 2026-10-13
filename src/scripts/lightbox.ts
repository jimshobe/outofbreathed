// Full-screen photo viewer.
//
// Pages embed their photo lists as <script type="application/json" data-lb-group="NAME">[items]</script>
// and mark tappable elements with data-lb-open="NAME" data-lb-id="MOMENT_ID". Tapping opens the viewer
// at that photo; swipe or arrow keys move through the group; swipe down, Esc, or the phone's back
// gesture closes it. The open photo is in the URL (#p-ID), so a link opens straight to it.

export interface LbItem { id: string; src?: string | null; caption?: string | null; meta?: string | null; /** YouTube video id: shown as an embedded player instead of a photo. */ youtube?: string | null }

// Worker types in the shared tsconfig redefine DOM `Element`, so DOM lookups are cast through this.
type El = HTMLElement;
const $ = (root: { querySelector(sel: string): unknown }, sel: string) => root.querySelector(sel) as El | null;
const $$ = (root: { querySelectorAll(sel: string): unknown }, sel: string) => Array.from(root.querySelectorAll(sel) as ArrayLike<El>);

const CSS = `
.lb { position: fixed; inset: 0; height: 100dvh; z-index: 100; background: #000; display: none; flex-direction: column; touch-action: none;
  padding: max(48px, env(safe-area-inset-top)) 56px 0; }
.lb.open { display: flex; }
/* The stage takes whatever height is left above the caption. Its content is positioned absolutely inside
   it, so the photo's size is capped by the stage, never the other way round (which let tall photos
   overflow the screen). */
.lb-stage { flex: 1; min-height: 0; position: relative; transition: transform .2s, opacity .2s; }
.lb-stage img, .lb-stage iframe { position: absolute; inset: 0; margin: auto; max-width: 100%; max-height: 100%; }
.lb-stage img { width: auto; height: auto; object-fit: contain; user-select: none; -webkit-user-drag: none; }
.lb-stage iframe { width: 100%; height: auto; aspect-ratio: 16 / 9; border: 0; }
.lb-meta { padding: 10px 0 max(18px, env(safe-area-inset-bottom)); display: flex; justify-content: space-between; gap: 16px; font: 13px/1.5 var(--mono); }
.lb-meta .m { color: var(--dim); white-space: nowrap; }
.lb button { position: absolute; color: var(--dim); font: 13px var(--mono); padding: 12px; }
.lb button:hover { color: var(--fg); }
.lb-close { top: max(4px, env(safe-area-inset-top)); right: 8px; }
.lb-prev, .lb-next { top: 50%; transform: translateY(-50%); font-size: 20px !important; }
.lb-prev { left: 4px; } .lb-next { right: 4px; }
@media (max-width: 700px) {
  .lb { padding: max(44px, env(safe-area-inset-top)) 0 0; }
  .lb-meta { padding-left: 16px; padding-right: 16px; }
  .lb-prev, .lb-next { display: none; }
  .lb-meta { flex-direction: column; gap: 2px; }
}`;

const groups = new Map<string, LbItem[]>();
let items: LbItem[] = [];
let index = 0;
let root: El | null = null;
let pushed = false;

function readGroups() {
  for (const s of $$(document, 'script[data-lb-group]')) {
    try { groups.set(s.dataset.lbGroup!, JSON.parse(s.textContent ?? '[]')); } catch { /* ignore a bad block */ }
  }
}

function build(): El {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div') as unknown as El;
  el.className = 'lb';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="lb-stage"></div>
    <div class="lb-meta"><span class="c"></span><span class="m"></span></div>
    <button class="lb-close" aria-label="Close">[esc]</button>
    <button class="lb-prev" aria-label="Previous">‹</button>
    <button class="lb-next" aria-label="Next">›</button>`;
  document.body.appendChild(el as unknown as Node);
  $(el, '.lb-close')!.onclick = () => close();
  $(el, '.lb-prev')!.onclick = () => step(-1);
  $(el, '.lb-next')!.onclick = () => step(1);
  $(el, '.lb-stage')!.onclick = (e) => { if ((e.target as unknown as El).classList.contains('lb-stage')) close(); };

  // Swipe: sideways moves, downward closes. The stage follows the finger a little for feedback.
  let x0 = 0, y0 = 0, tracking = false;
  const stage = $(el, '.lb-stage')!;
  el.addEventListener('touchstart', (e) => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; tracking = e.touches.length === 1; }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const t = e.touches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    stage.style.transform = Math.abs(dy) > Math.abs(dx) && dy > 0 ? `translateY(${dy}px)` : `translateX(${dx}px)`;
    stage.style.opacity = Math.abs(dy) > Math.abs(dx) && dy > 0 ? String(Math.max(0.3, 1 - dy / 400)) : '1';
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    stage.style.transform = ''; stage.style.opacity = '';
    if (dy > 90 && dy > Math.abs(dx)) close();
    else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  });
  return el;
}

function render() {
  const it = items[index];
  const stage = $(root!, '.lb-stage')!;
  stage.innerHTML = it.youtube
    ? `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(it.youtube)}?playsinline=1&rel=0" allow="encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" title="video"></iframe>`
    : '<img alt="">';
  if (!it.youtube) ($(stage, 'img') as unknown as HTMLImageElement).src = it.src ?? '';
  $(root!, '.lb-meta .c')!.textContent = it.caption ?? '';
  $(root!, '.lb-meta .m')!.textContent = [it.meta, items.length > 1 ? `${index + 1}/${items.length}` : ''].filter(Boolean).join(' · ');
  const many = items.length > 1;
  $(root!, '.lb-prev')!.hidden = !many;
  $(root!, '.lb-next')!.hidden = !many;
  // Warm the cache for the neighbours so swiping feels instant.
  for (const d of [1, -1]) {
    const next = items[(index + d + items.length) % items.length];
    if (many && next.src) new Image().src = next.src;
  }
}

function step(d: number) {
  if (items.length < 2) return;
  index = (index + d + items.length) % items.length;
  render();
  history.replaceState(history.state, '', `#p-${items[index].id}`);
}

export function openLightbox(list: LbItem[], at: number, addHistory = true) {
  if (!list.length) return;
  root ??= build();
  items = list;
  index = Math.max(0, Math.min(at, list.length - 1));
  render();
  root.classList.add('open');
  document.documentElement.style.overflow = 'hidden';
  // An extra history entry lets the phone's back gesture close the viewer instead of leaving the page.
  if (addHistory && !pushed) { history.pushState({ lb: true }, '', `#p-${items[index].id}`); pushed = true; }
  else history.replaceState(history.state, '', `#p-${items[index].id}`);
}

function close(fromHistory = false) {
  if (!root?.classList.contains('open')) return;
  root.classList.remove('open');
  document.documentElement.style.overflow = '';
  $(root, '.lb-stage')!.innerHTML = ''; // stops a playing video
  if (pushed && !fromHistory) history.back();
  else history.replaceState(null, '', location.pathname + location.search);
  pushed = false;
}

function openById(id: string): boolean {
  for (const list of groups.values()) {
    const i = list.findIndex((it) => it.id === id);
    if (i >= 0) { openLightbox(list, i, false); return true; }
  }
  return false;
}

export function initLightbox() {
  readGroups();
  document.addEventListener('click', (e) => {
    const opener = (e.target as unknown as El).closest('[data-lb-open]') as unknown as El | null;
    if (!opener) return;
    const list = groups.get(opener.dataset.lbOpen!);
    if (!list) return;
    e.preventDefault();
    openLightbox(list, Math.max(0, list.findIndex((it) => it.id === opener.dataset.lbId)));
  });
  document.addEventListener('keydown', (e) => {
    if (!root?.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  window.addEventListener('popstate', () => close(true));
  // Opened from a link (#p-ID): no extra history entry, so closing just clears the hash.
  const m = location.hash.match(/^#p-([\w-]+)$/);
  if (m) openById(m[1]);
}
