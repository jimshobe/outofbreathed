// The small Markdown that musings are written in (pure; shared by the musing page and the editor's
// preview). Everything is escaped first, so the output can only contain the tags made here.
//
//   paragraphs (blank line between; a single newline is a line break)   # heading   > quote
//   - list   1. list   **bold**   *italic*   [text](https://…)
//   ![caption](photo:<moment id>)   a photo from the library; lines of photos side by side form a row

/** A library photo or YouTube video placed in a musing. */
export interface PhotoRef { id: string; src: string; thumb: string; youtube: boolean }

const PHOTO = /^!\[([^\]]*)\]\(photo:([\w-]{1,64})\)$/;
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Links may go to the web or within the site; anything else (javascript:, data:) stays text. */
const safeHref = (url: string) => /^(https?:\/\/|\/(?!\/)|#)/i.test(url);

function inline(raw: string): string {
  // Links first, on the raw text, so their URLs aren't mangled by the emphasis rules.
  const parts: string[] = [];
  let last = 0;
  for (const m of raw.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)) {
    parts.push(emphasis(esc(raw.slice(last, m.index))));
    const [, text, url] = m;
    parts.push(safeHref(url)
      ? `<a href="${esc(url)}"${/^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : ''}>${emphasis(esc(text))}</a>`
      : emphasis(esc(m[0])));
    last = m.index! + m[0].length;
  }
  parts.push(emphasis(esc(raw.slice(last))));
  return parts.join('');
}

const emphasis = (t: string) => t
  .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, '$1<em>$2</em>')
  .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<em>$2</em>');

function photos(lines: string[], photo: (id: string) => PhotoRef | null, group: string): string {
  const refs = lines.map((l) => l.match(PHOTO)!).map(([, caption, id]) => ({ caption, p: photo(id) })).filter((x) => x.p);
  if (!refs.length) return '';
  const fig = ({ caption, p }: (typeof refs)[number]) =>
    `<a class="ph" href="#p-${esc(p!.id)}" data-lb-open="${esc(group)}" data-lb-id="${esc(p!.id)}"><img src="${esc(refs.length > 1 ? p!.thumb : p!.src)}" alt="${esc(caption)}" loading="lazy">${p!.youtube ? '<span class="play">▶</span>' : ''}</a>`;
  if (refs.length === 1) {
    return `<figure class="photo">${fig(refs[0])}${refs[0].caption ? `<figcaption>${inline(refs[0].caption)}</figcaption>` : ''}</figure>`;
  }
  return `<figure class="photos n${Math.min(refs.length, 4)}">${refs.map(fig).join('')}</figure>`;
}

/** Musing Markdown → HTML. `photo` looks up a placed photo; missing ones (deleted since) are left out. */
export function renderMarkdown(src: string, photo: (id: string) => PhotoRef | null, group = 'musing'): string {
  const blocks = src.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()));
  const out: string[] = [];
  for (const lines of blocks) {
    if (!lines.length) continue;
    // A block can mix photo lines and text; split it into runs.
    let run: string[] = [];
    const flush = () => { if (run.length) out.push(textBlock(run)); run = []; };
    let pics: string[] = [];
    for (const l of lines) {
      if (PHOTO.test(l.trim())) { flush(); pics.push(l.trim()); continue; }
      if (pics.length) { out.push(photos(pics, photo, group)); pics = []; }
      run.push(l);
    }
    flush();
    if (pics.length) out.push(photos(pics, photo, group));
  }
  return out.filter(Boolean).join('\n');
}

function textBlock(lines: string[]): string {
  const first = lines[0].trimStart();
  const h = first.match(/^#{1,6}\s+(.*)$/);
  if (h && lines.length === 1) return `<h3>${inline(h[1])}</h3>`;
  if (lines.every((l) => /^\s*>/.test(l))) return `<blockquote>${lines.map((l) => inline(l.replace(/^\s*>\s?/, ''))).join('<br>')}</blockquote>`;
  if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
  if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
  return `<p>${lines.map((l) => inline(l.trim())).join('<br>')}</p>`;
}

/** Ids of the photos placed in a musing, in order. */
export const photoIds = (src: string) => [...src.matchAll(/^\s*!\[[^\]]*\]\(photo:([\w-]{1,64})\)\s*$/gm)].map((m) => m[1]);

/** The opening text as plain words (for the timeline), cut at a word near `max` characters. */
export function excerpt(src: string, max = 240): string {
  const text = src.replace(/\r\n?/g, '\n').split('\n')
    .filter((l) => l.trim() && !PHOTO.test(l.trim()) && !/^\s*#/.test(l))
    .map((l) => l.replace(/^\s*(>|[-*]|\d+[.)])\s*/, ''))
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|[*_]/g, '')
    .replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[\s,.;:–-]+$/, '')}…`;
}
