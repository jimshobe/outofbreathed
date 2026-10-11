// Privacy zones (owner-only): photos taken inside one are shown at the surrounding suburb's centre,
// named after the suburb. Exact positions stay stored, so changing a zone just recomputes.
import { env } from 'cloudflare:workers';
import { UploadError } from './ingest';
import { geocodePlace } from './geo';
import { displayFor, distanceM, type ZoneArea } from './zone-math';

export interface Zone extends ZoneArea { label: string; address: string; area_name: string | null; photos?: number }

const NOMINATIM_HEADERS = { 'User-Agent': 'outofbreathed.com family photo site' };

export async function zoneAreas(): Promise<ZoneArea[]> {
  return (await env.DB.prepare('SELECT id, lat, lng, radius_m, area_lat, area_lng FROM zones').all<ZoneArea>()).results;
}

export async function listZones(): Promise<Zone[]> {
  return (await env.DB.prepare(
    `SELECT z.*, (SELECT count(*) FROM moments m WHERE m.zone_id = z.id) AS photos FROM zones z ORDER BY z.created_at`,
  ).all<Zone>()).results;
}

/** The suburb around a point and that suburb's centre, from OpenStreetMap. */
async function areaAround(lat: number, lng: number): Promise<{ name: string | null; lat: number; lng: number } | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=${lat}&lon=${lng}`, { headers: NOMINATIM_HEADERS });
  if (!res.ok) return null;
  const r = (await res.json()) as { lat?: string; lon?: string; name?: string; address?: Record<string, string> };
  if (!r.lat || !r.lon) return null;
  const a = r.address ?? {};
  return { name: r.name || a.suburb || a.town || a.village || a.city || null, lat: Number(r.lat), lng: Number(r.lon) };
}

const RADII = [200, 300, 500, 1000, 2000];

export async function addZone(label: unknown, address: unknown, radius: unknown): Promise<Zone> {
  const l = typeof label === 'string' ? label.trim() : '';
  const addr = typeof address === 'string' ? address.trim() : '';
  const r = Number(radius);
  if (!l || !addr) throw new UploadError('a zone needs a label and an address');
  if (!RADII.includes(r)) throw new UploadError(`radius must be one of ${RADII.join(', ')} metres`);
  const at = await geocodePlace(addr);
  if (!at) throw new UploadError("couldn't find that address; try adding the suburb and state");
  const area = await areaAround(at.lat, at.lng);
  if (!area) throw new UploadError("couldn't look up the suburb around that address; try again");
  const row = await env.DB.prepare(
    `INSERT INTO zones (label, address, lat, lng, radius_m, area_name, area_lat, area_lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(l, addr, at.lat, at.lng, r, area.name, area.lat, area.lng).first<Zone>();
  await recomputeZones();
  return row!;
}

export async function updateZone(id: number, e: { label?: unknown; radius_m?: unknown }): Promise<boolean> {
  if (!(await env.DB.prepare('SELECT 1 FROM zones WHERE id = ?').bind(id).first())) return false;
  if (e.label !== undefined) {
    const l = typeof e.label === 'string' ? e.label.trim() : '';
    if (!l) throw new UploadError('a zone needs a label');
    await env.DB.prepare('UPDATE zones SET label = ? WHERE id = ?').bind(l, id).run();
  }
  if (e.radius_m !== undefined) {
    const r = Number(e.radius_m);
    if (!RADII.includes(r)) throw new UploadError(`radius must be one of ${RADII.join(', ')} metres`);
    await env.DB.prepare('UPDATE zones SET radius_m = ? WHERE id = ?').bind(r, id).run();
    await recomputeZones();
  }
  return true;
}

export async function deleteZone(id: number): Promise<boolean> {
  const r = await env.DB.prepare('DELETE FROM zones WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return false;
  await recomputeZones();
  return true;
}

/** Re-applies every zone to every located moment. Returns how many moments changed. */
export async function recomputeZones(): Promise<number> {
  const zones = await zoneAreas();
  const { results } = await env.DB.prepare('SELECT id, lat, lng, display_lat, display_lng, zone_id FROM moments WHERE lat IS NOT NULL AND lng IS NOT NULL')
    .all<{ id: string; lat: number; lng: number; display_lat: number | null; display_lng: number | null; zone_id: number | null }>();
  const updates = results.flatMap((m) => {
    const d = displayFor(m.lat, m.lng, zones);
    const same = d.display_lat === m.display_lat && d.display_lng === m.display_lng && d.zone_id === m.zone_id;
    return same ? [] : [env.DB.prepare('UPDATE moments SET display_lat = ?, display_lng = ?, zone_id = ? WHERE id = ?').bind(d.display_lat, d.display_lng, d.zone_id, m.id)];
  });
  for (let i = 0; i < updates.length; i += 50) await env.DB.batch(updates.slice(i, i + 50));
  return updates.length;
}

/** How far a zone's shown point (the suburb centre) is from its address, for the post page. */
export const shownDistanceM = (z: Zone) => Math.round(distanceM(z.lat, z.lng, z.area_lat, z.area_lng));
