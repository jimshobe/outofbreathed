// Comment threads under timeline entries and sets. Markup: src/components/Comments.astro.
// Threads load when opened (or immediately with data-open). Signed-in people can comment; their own
// pending comments show as "waiting for approval"; the owner sees everyone's pending comments.

interface C { id: string; body: string; status: string; created_at: string; first_name: string; avatar_url: string | null; mine: boolean }

// Worker types in the shared tsconfig redefine DOM `Element`, so DOM lookups are cast through these.
type El = HTMLElement;
const $ = (sel: string, root: { querySelector(s: string): unknown }) => root.querySelector(sel) as El;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const signedIn = document.body.dataset.signedIn === '1';
const isOwner = document.body.dataset.owner === '1';
// dd-mm-yy in the viewer's own time zone (comment times are UTC instants).
const day = (iso: string) => { const d = new Date(iso); return [d.getDate(), d.getMonth() + 1, d.getFullYear() % 100].map((n) => String(n).padStart(2, '0')).join('-'); };

function render(thread: El, on: string, list: C[]) {
  const loginHref = `/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`;
  thread.innerHTML = `
    <ol>${list.map((c) => `
      <li data-id="${c.id}">
        ${c.avatar_url ? `<img src="${esc(c.avatar_url)}" alt="" referrerpolicy="no-referrer">` : '<span class="ph"></span>'}
        <div><span class="who">${esc(c.first_name.toLowerCase())}</span><span class="when">${day(c.created_at)}</span>
          ${c.status === 'pending' ? `<span class="pend">${c.mine ? 'waiting for approval' : 'pending'}</span>` : ''}
          ${c.mine || isOwner ? '<button class="del" aria-label="Delete comment">[×]</button>' : ''}
          <p>${esc(c.body).replace(/\n/g, '<br>')}</p></div>
      </li>`).join('')}</ol>
    ${signedIn
      ? `<form><textarea name="body" rows="2" maxlength="1000" placeholder="add a comment" required></textarea><button type="submit">[ post ]</button><span class="st"></span></form>`
      : `<a class="signin" href="${loginHref}">sign in with google to comment</a>`}`;

  thread.querySelectorAll('.del').forEach((b) => b.addEventListener('click', async (e) => {
    const li = (e.target as unknown as El).closest('li') as unknown as El;
    if (!confirm('Delete this comment?')) return;
    const res = await fetch(`/comments/${li.dataset.id}.json`, { method: 'DELETE' });
    if (res.ok) li.remove();
  }));

  const form = thread.querySelector('form') as unknown as HTMLFormElement | null;
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('.st', form), text = (form.elements.namedItem('body') as HTMLTextAreaElement).value;
    st.textContent = '…';
    const res = await fetch('/comments.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on, body: text }) });
    const r = (await res.json().catch(() => ({}))) as C & { error?: string };
    if (!res.ok) { st.textContent = r.error ?? 'error'; return; }
    list.push(r);
    render(thread, on, list);
    if (r.status === 'pending') $('.st', thread.querySelector('form')!).textContent = 'thanks! your first comment will appear once approved';
  });
}

async function open(box: El) {
  const on = box.dataset.on!, thread = $('.cm-thread', box);
  thread.hidden = !thread.hidden;
  if (thread.hidden || thread.dataset.loaded) return;
  thread.innerHTML = '<p class="loading">loading…</p>';
  const res = await fetch(`/comments.json?on=${encodeURIComponent(on)}`);
  render(thread, on, res.ok ? ((await res.json()) as C[]) : []);
  thread.dataset.loaded = '1';
}

for (const box of Array.from(document.querySelectorAll('.cm') as unknown as El[])) {
  $('.cm-toggle', box).addEventListener('click', () => open(box));
  if (box.dataset.open) open(box);
}
