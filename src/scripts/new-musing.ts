// Starts a musing draft dated now (this device's local time with its offset) and opens its editor.
// Used by /manage → musings and the post page.

/** Shows progress or an error in `status`; on success the page moves to the editor. */
export async function startMusing(status: HTMLElement | null) {
  const d = new Date(), off = -d.getTimezoneOffset();
  const p2 = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = new Date(d.getTime() + off * 60_000).toISOString().slice(0, 19) + (off >= 0 ? '+' : '-') + p2(off / 60) + ':' + p2(off % 60);
  if (status) status.textContent = '…';
  const res = await fetch('/api/musings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ written_at: local }) });
  const r = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (res.ok && r.id) location.href = `/manage/musings/${r.id}`;
  else if (status) status.textContent = r.error ?? 'error';
}
