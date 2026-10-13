// Ride routes on sets (owner uploads a GPX; viewers see the zone-trimmed line). Logic: route.ts.
import { env } from 'cloudflare:workers';
import { UploadError } from './ingest';
import { zoneAreas } from './zones';
import { parseGpx, routeStats, publicRoute, type PublicRoute } from './route';

const MAX_GPX_BYTES = 20 * 1024 * 1024;
/** Never served by /media (see src/pages/media/[...key].ts). */
export const PRIVATE_PREFIX = 'private/';

export async function saveRoute(setId: string, file: File): Promise<{ km: number; secs: number | null; climb_m: number | null; segments: number }> {
  const set = await env.DB.prepare('SELECT route_gpx_key FROM sets WHERE id = ?').bind(setId).first<{ route_gpx_key: string | null }>();
  if (!set) throw new UploadError('that set no longer exists', 404);
  if (file.size > MAX_GPX_BYTES) throw new UploadError('GPX file is over 20 MB', 413);
  const text = await file.text();
  if (!/<gpx\b/i.test(text)) throw new UploadError('that is not a GPX file (export the ride from your app as GPX)', 415);
  const points = parseGpx(text);
  if (points.length < 2) throw new UploadError('no track points found in that GPX file');

  const stats = routeStats(points);
  const route = publicRoute(points, await zoneAreas());
  const key = `${PRIVATE_PREFIX}routes/${setId}-${Date.now().toString(36)}.gpx`;
  await env.MEDIA.put(key, text, { httpMetadata: { contentType: 'application/gpx+xml' } });
  await env.DB.prepare('UPDATE sets SET route = ?, route_gpx_key = ?, route_km = ?, route_secs = ?, route_climb_m = ? WHERE id = ?')
    .bind(JSON.stringify(route), key, stats.km, stats.secs, stats.climb_m, setId).run();
  if (set.route_gpx_key) await env.MEDIA.delete(set.route_gpx_key);
  return { ...stats, segments: route.length };
}

export async function removeRoute(setId: string): Promise<boolean> {
  const set = await env.DB.prepare('SELECT route_gpx_key FROM sets WHERE id = ?').bind(setId).first<{ route_gpx_key: string | null }>();
  if (!set) return false;
  await env.DB.prepare('UPDATE sets SET route = NULL, route_gpx_key = NULL, route_km = NULL, route_secs = NULL, route_climb_m = NULL WHERE id = ?').bind(setId).run();
  if (set.route_gpx_key) await env.MEDIA.delete(set.route_gpx_key);
  return true;
}

/** Re-trims every route against the current zones (run after any zone change). */
export async function recomputeRoutes(): Promise<void> {
  const zones = await zoneAreas();
  const { results } = await env.DB.prepare('SELECT id, route_gpx_key FROM sets WHERE route_gpx_key IS NOT NULL').all<{ id: string; route_gpx_key: string }>();
  for (const s of results) {
    const obj = await env.MEDIA.get(s.route_gpx_key);
    // If the original is somehow gone, drop the public line rather than leave an untrimmed one.
    const route = obj ? publicRoute(parseGpx(await obj.text()), zones) : null;
    await env.DB.prepare('UPDATE sets SET route = ? WHERE id = ?').bind(route ? JSON.stringify(route) : null, s.id).run();
  }
}

export interface SetRoute { id: string; title: string; route: PublicRoute }

/** Public routes for the map. */
export async function listRoutes(): Promise<SetRoute[]> {
  const { results } = await env.DB.prepare('SELECT id, title, route FROM sets WHERE route IS NOT NULL').all<{ id: string; title: string; route: string }>();
  return results.map((r) => ({ id: r.id, title: r.title, route: JSON.parse(r.route) as PublicRoute })).filter((r) => r.route.length);
}
