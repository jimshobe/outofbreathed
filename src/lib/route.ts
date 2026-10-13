// Pure ride-route logic (no Worker imports, so it's unit-testable): parse a GPX file, work out ride
// stats, cut out everything inside privacy zones, and simplify the line for the map.

import { distanceM, type ZoneArea } from './zone-math';

export interface TrackPoint { lat: number; lng: number; ele: number | null; time: number | null }
export interface RouteStats { km: number; secs: number | null; climb_m: number | null }
/** What viewers get: line segments as [lng, lat] pairs (GeoJSON order), with zone sections removed. */
export type PublicRoute = [number, number][][];

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`))?.[1];

/** Track points (or route points) from GPX text, in order. Workers have no DOMParser, hence regexes. */
export function parseGpx(gpx: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  const re = /<(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  for (let m; (m = re.exec(gpx)); ) {
    const lat = Number(attr(m[2], 'lat')), lng = Number(attr(m[2], 'lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const body = m[3] ?? '';
    const ele = Number(body.match(/<ele>\s*([-\d.]+)\s*<\/ele>/)?.[1]);
    const time = Date.parse(body.match(/<time>\s*([^<]+?)\s*<\/time>/)?.[1] ?? '');
    points.push({ lat, lng, ele: Number.isFinite(ele) ? ele : null, time: Number.isFinite(time) ? time : null });
  }
  return points;
}

// GPS altitude jitters by several metres. Smooth it, then only count a climb once it rises this far
// above the last confirmed level (and only lower that level after a real descent).
const CLIMB_THRESHOLD_M = 5;
const SMOOTH_WINDOW = 5;

/** Distance, elapsed time and total climb for the whole ride (before any zone trimming). */
export function routeStats(points: TrackPoint[]): RouteStats {
  let metres = 0;
  for (let i = 1; i < points.length; i++) metres += distanceM(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  const times = points.map((p) => p.time).filter((t): t is number => t != null);
  const secs = times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 1000) : null;
  const eles = points.map((p) => p.ele).filter((e): e is number => e != null);
  let climb: number | null = null;
  if (eles.length > 1) {
    const half = Math.floor(SMOOTH_WINDOW / 2);
    const smooth = eles.map((_, i) => {
      const w = eles.slice(Math.max(0, i - half), i + half + 1);
      return w.reduce((a, e) => a + e, 0) / w.length;
    });
    climb = 0;
    let level = smooth[0];
    for (const e of smooth) {
      if (e - level >= CLIMB_THRESHOLD_M) { climb += e - level; level = e; }
      else if (level - e >= CLIMB_THRESHOLD_M) level = e;
    }
  }
  return { km: Math.round(metres / 100) / 10, secs, climb_m: climb == null ? null : Math.round(climb) };
}

/** Splits the track into runs of points outside every zone; points inside a zone are dropped. */
export function trimZones(points: TrackPoint[], zones: Pick<ZoneArea, 'lat' | 'lng' | 'radius_m'>[]): TrackPoint[][] {
  const runs: TrackPoint[][] = [];
  let run: TrackPoint[] = [];
  for (const p of points) {
    const inside = zones.some((z) => distanceM(p.lat, p.lng, z.lat, z.lng) <= z.radius_m);
    if (inside) { if (run.length > 1) runs.push(run); run = []; }
    else run.push(p);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** Douglas–Peucker on [lng, lat] pairs (planar; fine at ride scale). */
function simplifyLine(line: [number, number][], tol: number): [number, number][] {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = line[a], [bx, by] = line[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let worst = -1, worstD = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = line[i];
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst > 0 && worstD > tol) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return line.filter((_, i) => keep[i]);
}

/** Simplifies every segment until the whole route has at most `maxPoints` points; coords to ~1 m. */
export function simplifyRoute(segments: TrackPoint[][], maxPoints = 600): PublicRoute {
  const lines = segments.map((s) => s.map((p) => [p.lng, p.lat] as [number, number]));
  let tol = 0.00002; // ~2 m
  let out = lines;
  while ((out = lines.map((l) => simplifyLine(l, tol))).reduce((n, l) => n + l.length, 0) > maxPoints) tol *= 1.6;
  const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  return out.filter((l) => l.length > 1).map((l) => l.map(([x, y]) => [r5(x), r5(y)] as [number, number]));
}

/** The public route for a GPX file and the current zones. */
export function publicRoute(points: TrackPoint[], zones: Pick<ZoneArea, 'lat' | 'lng' | 'radius_m'>[]): PublicRoute {
  return simplifyRoute(trimZones(points, zones));
}

/** "412 km · 6 h 40 m · ↑ 3,200 m" (parts without data are left out). */
export function fmtStats(s: { km: number | null; secs: number | null; climb_m: number | null }): string {
  const parts: string[] = [];
  if (s.km != null) parts.push(`${s.km >= 100 ? Math.round(s.km) : s.km} km`);
  if (s.secs != null && s.secs > 0) {
    const h = Math.floor(s.secs / 3600), m = Math.round((s.secs % 3600) / 60);
    parts.push(h ? `${h} h ${m} m` : `${m} m`);
  }
  if (s.climb_m != null && s.climb_m > 0) parts.push(`↑ ${s.climb_m.toLocaleString('en-AU')} m`);
  return parts.join(' · ');
}
