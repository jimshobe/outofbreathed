import { describe, it, expect } from 'vitest';
import { joinSameName, type Spot } from '../map-places';

const spot = (lat: number, lng: number, name: string | null, n = 1): Spot =>
  ({ spot_lat: Math.round(lat * 1000) / 1000, spot_lng: Math.round(lng * 1000) / 1000, lat, lng, n, name, latest: '2026-10-31', zoned: 0 });

describe('joinSameName', () => {
  it('joins one shop split across cells by GPS drift (the first haircut set)', () => {
    const out = joinSameName([
      spot(-27.96909, 153.41368, 'Speed Cut, Southport', 2),
      spot(-27.96898, 153.41348, 'Speed Cut, Southport'),
      spot(-27.96834, 153.41287, 'Speed Cut, Southport'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].n).toBe(4);
    expect(out[0].spots).toHaveLength(3);
  });
  it('keeps different names, unnamed spots and far-apart namesakes apart', () => {
    expect(joinSameName([spot(-27.969, 153.413, 'Speed Cut, Southport'), spot(-27.9691, 153.4131, 'Other Cafe, Southport')])).toHaveLength(2);
    expect(joinSameName([spot(-27.969, 153.413, null), spot(-27.9691, 153.4131, null)])).toHaveLength(2);
    expect(joinSameName([spot(-27.969, 153.413, 'Southport'), spot(-27.99, 153.413, 'Southport')])).toHaveLength(2);
  });
  it('joins groups linked by a spot between them', () => {
    const out = joinSameName([spot(0, 0, 'Park'), spot(0, 0.005, 'Park'), spot(0, 0.0025, 'Park')]);
    expect(out).toHaveLength(1);
    expect(out[0].spots).toHaveLength(3);
  });
});
