import { describe, it, expect } from 'vitest';
import { zoneFor, displayFor, distanceM } from '../zone-math';

// Home in Palm Beach, shown as Palm Beach's centre; school 1.2 km away with a smaller radius.
const home = { id: 1, lat: -28.1149, lng: 153.4686, radius_m: 400, area_lat: -28.1171, area_lng: 153.4661 };
const school = { id: 2, lat: -28.1060, lng: 153.4640, radius_m: 200, area_lat: -28.1171, area_lng: 153.4661 };

describe('zones', () => {
  it('puts a photo taken at home in the home zone and shows the suburb centre instead', () => {
    const d = displayFor(-28.1151, 153.4688, [home, school]);
    expect(d).toEqual({ display_lat: -28.1171, display_lng: 153.4661, zone_id: 1 });
  });

  it('leaves photos just outside a zone exact', () => {
    const outside = { lat: -28.1149, lng: 153.4686 + 0.005 }; // ~490 m east of home
    expect(distanceM(home.lat, home.lng, outside.lat, outside.lng)).toBeGreaterThan(400);
    expect(displayFor(outside.lat, outside.lng, [home, school])).toEqual({ display_lat: -28.1149, display_lng: 153.4736, zone_id: null });
  });

  it('picks the nearest zone when zones overlap', () => {
    const big = { ...school, id: 3, radius_m: 2000 };
    expect(zoneFor(-28.1150, 153.4687, [big, home])?.id).toBe(1);
  });

  it('never returns the zone address itself as a display position', () => {
    for (const [lat, lng] of [[-28.1149, 153.4686], [-28.1160, 153.4670], [-28.1061, 153.4641]]) {
      const d = displayFor(lat, lng, [home, school]);
      expect([d.display_lat, d.display_lng]).not.toEqual([home.lat, home.lng]);
      expect(d.zone_id).not.toBeNull();
    }
  });
});
