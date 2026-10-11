// Mock data + helpers for the site prototype.
// Real photos live in content/web (gitignored); placeholders come from picsum.

const R = (f) => `content/web/${f}`;
const P = (id, w = 1200, h = 1500) => `https://picsum.photos/id/${id}/${w}/${h}`;

const PLACES = {
  vashon: { name: 'Vashon Island', region: 'Washington, USA', lat: 47.447, lng: -122.46, wiki: 'Vashon Island' },
  seattle: { name: 'Seattle', region: 'Washington, USA', lat: 47.606, lng: -122.332, wiki: 'Seattle' },
  palm: { name: 'Palm Beach', region: 'Gold Coast, QLD', lat: -28.115, lng: 153.465, zone: true, wiki: 'Palm Beach, Queensland' },
  burleigh: { name: 'Burleigh Heads', region: 'Gold Coast, QLD', lat: -28.088, lng: 153.452, wiki: 'Burleigh Heads, Queensland' },
  surfers: { name: 'Surfers Paradise', region: 'Gold Coast, QLD', lat: -28.002, lng: 153.43, wiki: 'Surfers Paradise' },
  currumbin: { name: 'Currumbin', region: 'Gold Coast, QLD', lat: -28.137, lng: 153.486, wiki: 'Currumbin, Queensland' },
  springbrook: { name: 'Springbrook', region: 'Gold Coast Hinterland', lat: -28.23, lng: 153.27, wiki: 'Springbrook National Park' },
  tamborine: { name: 'Tamborine Mountain', region: 'Scenic Rim, QLD', lat: -27.97, lng: 153.19, wiki: 'Tamborine Mountain' },
  lamington: { name: "O'Reilly's, Lamington", region: 'Scenic Rim, QLD', lat: -28.23, lng: 153.135, wiki: 'Lamington National Park' },
  byron: { name: 'Byron Bay', region: 'New South Wales', lat: -28.643, lng: 153.612, wiki: 'Byron Bay' },
  brisbane: { name: 'Brisbane', region: 'Queensland', lat: -27.47, lng: 153.025, wiki: 'Brisbane' },
  noosa: { name: 'Noosa Heads', region: 'Sunshine Coast, QLD', lat: -26.394, lng: 153.09, wiki: 'Noosa Heads, Queensland' },
  woombye: { name: 'Woombye', region: 'Sunshine Coast, QLD', lat: -26.671, lng: 152.962, wiki: 'Woombye, Queensland' },
};

// [id, date, place, category, src, caption, opts]
const RAW = [
  ['m01', '2026-04-05', 'vashon', 'misc', R('masto-116349480205025616-0.jpg'), 'Days like today are a reminder of how much we will miss Vashon.', { w: 2499, h: 3319 }],
  ['m02', '2026-04-06', 'vashon', 'family', R('masto-116354921522540112-0.mp4'), 'A star is born?', { kind: 'video', w: 1080, h: 1920, private: true }],
  ['m03', '2026-04-11', 'vashon', 'food', R('bsky-vthi5eh4-0.jpg'), 'This is not normal, right?', { food: 'home', w: 1505, h: 2000 }],
  ['m04', '2026-04-11', 'vashon', 'food', P(292), 'Vegan ramen, the old way.', { food: 'home' }],
  ['m05', '2026-04-08', 'seattle', 'family', R('bsky-df2igay4-0.jpg'), 'Pop-pop days are the best.', { w: 1505, h: 2000, private: true }],
  ['m06', '2026-05-03', 'vashon', 'travel', R('bsky-cbary7j4-0.jpg'), 'All of our stuff is officially on the way to Australia.', { w: 1280, h: 2856 }],
  ['m07', '2026-05-10', 'burleigh', 'travel', P(653), 'Scouting trip. Found a house.', {}],
  ['m08', '2026-05-11', 'burleigh', 'food', P(431), 'First flat white as a future local.', { food: 'out' }],
  ['m09', '2026-06-14', 'vashon', 'misc', R('bsky-muolfqmi-0.jpg'), 'Low Tide festival brass band.', { w: 4000, h: 3011 }],
  ['m10', '2026-06-14', 'vashon', 'misc', R('bsky-muolfqmi-1.jpg'), 'Rainier showing off for the festival.', { w: 3011, h: 4000 }],
  ['m11', '2026-07-02', 'vashon', 'travel', R('bsky-2oufhx2q-0.jpg'), 'The first leg of the journey has begun.', { w: 3000, h: 4000 }],
  ['m12', '2026-07-05', 'palm', 'misc', P(625), 'Empty house, full of echoes.', {}],
  ['m13', '2026-07-06', 'palm', 'family', P(146), 'Bike is the first thing unpacked.', { private: true }],
  ['m14', '2026-07-09', 'currumbin', 'travel', P(640, 1500, 1000), 'Winter, apparently.', { w: 1500, h: 1000 }],
  ['m15', '2026-07-12', 'surfers', 'food', P(1060), 'Coffee here is a competitive sport.', { food: 'out' }],
  ['m16', '2026-07-19', 'tamborine', 'moto', P(767), 'First ride up the mountain.', { trip: 'hinterland' }],
  ['m17', '2026-07-19', 'lamington', 'moto', P(1018, 1500, 1000), '100 bends to O’Reilly’s.', { trip: 'hinterland', w: 1500, h: 1000 }],
  ['m18', '2026-07-26', 'palm', 'food', P(488), 'Home-made poke, finally a kitchen.', { food: 'home' }],
  ['m19', '2026-08-02', 'springbrook', 'travel', P(1039), 'Natural Bridge at dusk.', {}],
  ['m20', '2026-08-03', 'palm', 'family', P(660), 'Sparklers for no reason.', { private: true }],
  ['m21', '2026-08-09', 'brisbane', 'misc', P(211, 1500, 1000), 'Ferry rides still feel like home.', { w: 1500, h: 1000 }],
  ['m22', '2026-08-16', 'byron', 'travel', P(1050, 1500, 1000), 'Whales off the cape.', { w: 1500, h: 1000 }],
  ['m23', '2026-08-16', 'byron', 'food', P(42), 'Long lunch.', { food: 'out' }],
  ['m24', '2026-08-23', 'palm', 'food', P(835), 'Lemon biscuits, round two.', { food: 'home' }],
  ['m25', '2026-08-30', 'woombye', 'travel', P(824), 'It is, in fact, big.', {}],
  ['m26', '2026-09-06', 'noosa', 'moto', P(1016, 1500, 1000), 'Long way home via the range.', { w: 1500, h: 1000 }],
  ['m27', '2026-09-13', 'noosa', 'food', P(493), 'Brekkie with a view.', { food: 'out' }],
  ['m28', '2026-09-20', 'burleigh', 'misc', P(1053, 1500, 1000), 'Swell’s up.', { w: 1500, h: 1000 }],
  ['m29', '2026-09-27', 'currumbin', 'family', P(1069), 'Jellyfish are terrifying and amazing.', { private: true }],
  ['m30', '2026-10-04', 'burleigh', 'misc', P(77), 'Spring evenings.', {}],
  ['m31', '2026-10-10', 'palm', 'food', P(429), 'Raspberries already. Spring is wild.', { food: 'home' }],
  ['m32', '2026-10-10', 'springbrook', 'moto', P(1043), 'Back up to the rainforest.', {}],
];

const MOMENTS = RAW.map(([id, date, placeKey, category, src, caption, o]) => {
  const place = PLACES[placeKey];
  const isPrivate = !!o.private;
  // Private or zoned moments only get the suburb centroid, never an exact pin.
  const jitter = isPrivate || place.zone ? 0 : (parseInt(id.slice(1), 10) % 7 - 3) * 0.004;
  return {
    id, placeKey, place, category, src, caption,
    date: new Date(date + 'T10:00:00'),
    kind: o.kind || 'photo',
    w: o.w || 1200, h: o.h || 1500,
    food: o.food || null,
    visibility: isPrivate ? 'private' : 'everyone',
    approx: isPrivate || !!place.zone,
    trip: o.trip || null,
    lat: place.lat + jitter, lng: place.lng - jitter,
  };
}).sort((a, b) => b.date - a.date);

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'misc', label: 'Misc' },
  { key: 'family', label: 'Family' },
  { key: 'travel', label: 'Travel' },
  { key: 'moto', label: 'Moto' },
  { key: 'food', label: 'Food' },
];

// Sample GPX-ish route for the hinterland ride (later-phase feature).
const RIDE_ROUTE = [
  [153.452, -28.088], [153.40, -28.06], [153.33, -28.02], [153.25, -27.99], [153.19, -27.97],
  [153.12, -27.98], [153.08, -28.01], [153.05, -28.07], [153.09, -28.14], [153.135, -28.23],
  [153.17, -28.17], [153.25, -28.14], [153.33, -28.12], [153.40, -28.10], [153.452, -28.088],
];

function filterMoments(cat) {
  return cat === 'all' ? MOMENTS : MOMENTS.filter((m) => m.category === cat);
}

function groupByMonth(list) {
  const groups = [];
  for (const m of list) {
    const key = m.date.getFullYear() + '-' + m.date.getMonth();
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) groups.push((g = { key, date: m.date, items: [] }));
    g.items.push(m);
  }
  return groups;
}

const fmtMonth = (d) => d.toLocaleDateString('en-AU', { month: 'long' });
const fmtDay = (d) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
function mediaHTML(m, cls = '') {
  return m.kind === 'video'
    ? `<video class="${cls}" src="${m.src}" muted loop playsinline autoplay preload="metadata"></video>`
    : `<img class="${cls}" src="${m.src}" alt="" loading="lazy">`;
}

// Places that have moments in the given list, for postcards.
function placeGroups(list) {
  const by = {};
  for (const m of list) (by[m.placeKey] ||= { key: m.placeKey, place: m.place, items: [] }).items.push(m);
  return by;
}

// ---- Lightbox (pages style .lb, .lb-media, .lb-meta, .lb-prev/.lb-next/.lb-close) ----
let lbList = [], lbIndex = 0, lbEl;
function openLightbox(list, index, renderMeta) {
  lbList = list; lbIndex = index;
  if (!lbEl) {
    lbEl = document.createElement('div');
    lbEl.className = 'lb';
    lbEl.innerHTML = `<button class="lb-close" aria-label="Close">×</button>
      <button class="lb-prev" aria-label="Previous">‹</button>
      <div class="lb-stage"></div>
      <button class="lb-next" aria-label="Next">›</button>
      <div class="lb-meta"></div>`;
    document.body.appendChild(lbEl);
    lbEl.querySelector('.lb-close').onclick = closeLightbox;
    lbEl.querySelector('.lb-prev').onclick = () => stepLightbox(-1);
    lbEl.querySelector('.lb-next').onclick = () => stepLightbox(1);
    lbEl.addEventListener('click', (e) => { if (e.target === lbEl || e.target.classList.contains('lb-stage')) closeLightbox(); });
    document.addEventListener('keydown', (e) => {
      if (!lbEl.classList.contains('open')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
    });
    let x0 = null;
    lbEl.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
    lbEl.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
      x0 = null;
    });
  }
  lbEl._renderMeta = renderMeta;
  renderLightbox();
  lbEl.classList.add('open');
  document.documentElement.style.overflow = 'hidden';
}
function stepLightbox(d) { lbIndex = (lbIndex + d + lbList.length) % lbList.length; renderLightbox(); }
function closeLightbox() {
  lbEl.classList.remove('open');
  lbEl.querySelector('.lb-stage').innerHTML = '';
  document.documentElement.style.overflow = '';
}
function renderLightbox() {
  const m = lbList[lbIndex];
  const media = m.kind === 'video'
    ? `<video class="lb-media" src="${m.src}" controls autoplay playsinline></video>`
    : `<img class="lb-media" src="${m.src.replace(/\/\d+\/\d+$/, '/2000/2500')}" alt="">`;
  lbEl.querySelector('.lb-stage').innerHTML = media;
  lbEl.querySelector('.lb-meta').innerHTML = lbEl._renderMeta(m, lbIndex, lbList.length);
}

