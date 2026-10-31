import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { searchPlaces, type PlaceHit } from '../../../lib/geo';
import { placeFields } from '../../../lib/maps-link';

// Owner-only (middleware): suggestions while typing a business (?kind=venue) or suburb (?kind=area)
// in the photo and set editors. Names already used on the site come first, then OpenStreetMap
// matches near ?lat=&lng= when given.
export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const kind = url.searchParams.get('kind') === 'area' ? 'area' : 'venue';
  const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
  if (q.length < 2) return Response.json({ results: [] });
  const near = Number.isFinite(lat) && Number.isFinite(lng) && url.searchParams.get('lat') !== '';

  const [{ results: rows }, found] = await Promise.all([
    env.DB.prepare('SELECT DISTINCT place_name AS name FROM moments WHERE place_name LIKE ? LIMIT 100').bind(`%${q}%`).all<{ name: string }>(),
    searchPlaces(q, kind, near ? lat : undefined, near ? lng : undefined),
  ]);
  const lc = q.toLowerCase(), seen = new Set<string>();
  const used: PlaceHit[] = rows.flatMap(({ name }) => {
    const f = placeFields(name), value = kind === 'venue' ? f.venue : f.area;
    if (!value || !value.toLowerCase().includes(lc) || seen.has(value)) return [];
    seen.add(value);
    return [{ value, area: kind === 'venue' ? f.area : null, note: kind === 'venue' && f.area ? `used before · ${f.area}` : 'used before' }];
  }).slice(0, 4);
  return Response.json({ results: [...used, ...found.filter((h) => !used.some((u) => u.value === h.value && u.area === h.area))].slice(0, 10) });
};
