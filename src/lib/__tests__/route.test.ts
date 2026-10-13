import { describe, it, expect } from 'vitest';
import { parseGpx, routeStats, trimZones, simplifyRoute, publicRoute, fmtStats } from '../route';
import { distanceM } from '../zone-math';

// A ride heading due north from "home": 101 points, ~111 m apart, climbing 1 m per point, 1 minute apart.
const home = { lat: -28.1149, lng: 153.4686, radius_m: 500 };
const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><name>test</name><trkseg>
${Array.from({ length: 101 }, (_, i) => `<trkpt lat="${(home.lat + i * 0.001).toFixed(6)}" lon="${home.lng}"><ele>${10 + i}</ele><time>2026-10-04T08:${String(i % 60).padStart(2, '0')}:00Z</time></trkpt>`)
  .map((s, i) => (i >= 60 ? s.replace('T08:', 'T09:') : s)).join('\n')}
</trkseg></trk></gpx>`;

describe('parseGpx', () => {
  it('reads track points with elevation and time, and route points / self-closing tags', () => {
    const pts = parseGpx(gpx);
    expect(pts).toHaveLength(101);
    expect(pts[0]).toMatchObject({ lat: -28.1149, lng: 153.4686, ele: 10 });
    expect(parseGpx('<rte><rtept lat="1" lon="2"/><rtept lon="4" lat="3"></rtept><rtept lat="x" lon="5"/></rte>'))
      .toEqual([{ lat: 1, lng: 2, ele: null, time: null }, { lat: 3, lng: 4, ele: null, time: null }]);
  });
});

describe('routeStats', () => {
  it('measures distance, elapsed time and climb', () => {
    const s = routeStats(parseGpx(gpx));
    expect(s.km).toBeCloseTo(11.1, 1);
    expect(s.secs).toBe(100 * 60);
    expect(s.climb_m).toBeGreaterThanOrEqual(95); // a steady 100 m climb (smoothing trims the very ends)
    expect(s.climb_m).toBeLessThanOrEqual(100);
  });

  it('ignores GPS altitude jitter on flat ground', () => {
    for (const amp of [2, 5, 8]) {
      const jitter = Array.from({ length: 200 }, (_, i) => ({ lat: 0, lng: i * 0.0001, ele: 100 + (i % 2 ? amp : -amp), time: null }));
      expect(routeStats(jitter).climb_m).toBeLessThan(10);
    }
  });
});

describe('zone trimming', () => {
  it('drops every point inside a zone, so the public route starts at the zone edge', () => {
    const segments = trimZones(parseGpx(gpx), [home]);
    expect(segments).toHaveLength(1);
    const first = segments[0][0];
    expect(distanceM(first.lat, first.lng, home.lat, home.lng)).toBeGreaterThan(home.radius_m);
    const route = publicRoute(parseGpx(gpx), [home]);
    for (const line of route) for (const [lng, lat] of line) expect(distanceM(lat, lng, home.lat, home.lng)).toBeGreaterThan(home.radius_m);
  });

  it('splits the route where it passes through a zone mid-ride', () => {
    const middle = { lat: home.lat + 0.05, lng: home.lng, radius_m: 300 };
    expect(trimZones(parseGpx(gpx), [middle])).toHaveLength(2);
  });
});

describe('simplifyRoute', () => {
  it('keeps a straight line to its end points and caps the point count', () => {
    expect(simplifyRoute([parseGpx(gpx)])[0]).toHaveLength(2);
    const wiggly = Array.from({ length: 5000 }, (_, i) => ({ lat: Math.sin(i / 7) * 0.01, lng: i * 0.0002, ele: null, time: null }));
    const out = simplifyRoute([wiggly], 600);
    expect(out[0].length).toBeLessThanOrEqual(600);
    expect(out[0].length).toBeGreaterThan(50);
  });
});

describe('fmtStats', () => {
  it('formats what is known', () => {
    expect(fmtStats({ km: 412.4, secs: 24000, climb_m: 3200 })).toBe('412 km · 6 h 40 m · ↑ 3,200 m');
    expect(fmtStats({ km: 11.1, secs: null, climb_m: null })).toBe('11.1 km');
  });
});
