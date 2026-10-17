// Owner overrides for where a place's ↗ links go (place_links table), keyed by the place name viewers
// see. Read once per request (memoised on Astro.locals) and handed to placeParts.
import { env } from 'cloudflare:workers';
import { UploadError } from './ingest';
import type { LinkOverride } from './maps-link';

export async function listPlaceLinks(): Promise<Map<string, LinkOverride>> {
  const { results } = await env.DB.prepare('SELECT name, gmaps_url, wiki_url FROM place_links').all<{ name: string } & LinkOverride>();
  return new Map(results.map((r) => [r.name, { gmaps_url: r.gmaps_url, wiki_url: r.wiki_url }]));
}

/** The overrides for this request, loaded on first use. */
export function placeLinksFor(locals: App.Locals): Promise<Map<string, LinkOverride>> {
  return (locals.placeLinks ??= listPlaceLinks());
}

const cleanUrl = (v: unknown, what: string) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') throw new UploadError(`${what} must be a link`);
  let u: URL;
  try { u = new URL(v.trim()); } catch { throw new UploadError(`${what} isn't a valid link`); }
  if (u.protocol !== 'https:') throw new UploadError(`${what} must start with https://`);
  return u.href;
};

/** Sets (or, with both links empty, clears) a place's overrides. */
export async function setPlaceLink(name: unknown, gmaps: unknown, wiki: unknown) {
  if (typeof name !== 'string' || !name.trim()) throw new UploadError('name required');
  const g = cleanUrl(gmaps, 'google maps link'), w = cleanUrl(wiki, 'wikipedia link');
  if (!g && !w) {
    await env.DB.prepare('DELETE FROM place_links WHERE name = ?').bind(name).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO place_links (name, gmaps_url, wiki_url) VALUES (?, ?, ?)
       ON CONFLICT (name) DO UPDATE SET gmaps_url = excluded.gmaps_url, wiki_url = excluded.wiki_url,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).bind(name, g, w).run();
  }
  return { name, gmaps_url: g, wiki_url: w };
}

/** Every place name viewers can see (zoned photos show their suburb), newest first, for the places tab. */
export async function listPlaceNames(): Promise<{ name: string; latest: string; zoned: number }[]> {
  const { results } = await env.DB.prepare(
    `SELECT place_name AS name, max(taken_at) AS latest, max(zoned) AS zoned FROM moments_public
      WHERE place_name IS NOT NULL GROUP BY place_name ORDER BY latest DESC`,
  ).all<{ name: string; latest: string; zoned: number }>();
  return results;
}
