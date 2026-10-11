import { describe, it, expect } from 'vitest';
import { readJpegMeta, stripJpegMeta } from '../exif';
import { readVideoMeta, blankVideoLocation } from '../quicktime';
import { displayLocation, distanceM } from '../geo';
import { jpegWithGps, movWithGps } from './fixtures';

const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('JPEG metadata', () => {
  const jpeg = jpegWithGps({ date: '2026:10:10 09:12:34', offset: '+10:00', lat: [28.115, 'S'], lng: [153.465, 'E'] });

  it('reads capture time with offset and signed GPS position', () => {
    const m = readJpegMeta(jpeg);
    expect(m.takenAt).toBe('2026-10-10T09:12:34+10:00');
    expect(m.lat).toBeCloseTo(-28.115, 4);
    expect(m.lng).toBeCloseTo(153.465, 4);
  });

  it('reads western/northern hemispheres and a missing offset', () => {
    const m = readJpegMeta(jpegWithGps({ date: '2025:06:14 15:00:00', lat: [47.447, 'N'], lng: [122.46, 'W'] }));
    expect(m.takenAt).toBe('2025-06-14T15:00:00');
    expect(m.lat).toBeCloseTo(47.447, 4);
    expect(m.lng).toBeCloseTo(-122.46, 4);
  });

  it('strips EXIF, XMP and comments but keeps JFIF, ICC and image data', () => {
    const out = stripJpegMeta(jpeg);
    expect(readJpegMeta(out)).toEqual({});
    expect(text(out)).not.toMatch(/Exif|xmpmeta|GPSLatitude|a comment/);
    expect(text(out)).toMatch(/JFIF/);
    expect(text(out)).toMatch(/ICC_PROFILE/);
    expect(Array.from(out.slice(-5))).toEqual([0x12, 0x34, 0x56, 0xff, 0xd9]);
  });

  it('ignores non-JPEG input and garbage EXIF', () => {
    expect(readJpegMeta(new Uint8Array([1, 2, 3]))).toEqual({});
    const broken = jpegWithGps({ date: '2026:01:01 00:00:00', lat: [1, 'N'], lng: [1, 'E'] });
    broken.fill(0xee, 30, 60); // corrupt the TIFF header
    expect(() => readJpegMeta(broken)).not.toThrow();
  });
});

describe('video metadata', () => {
  const iso = '-28.0880+153.4520+012.345/';
  const mov = () => movWithGps({ iso6709: iso, created: '2026-10-10T09:12:00+1000', w: 1920, h: 1080, rotated: true });

  it('reads location, creation time and rotated display size', () => {
    const m = readVideoMeta(mov());
    expect(m.lat).toBeCloseTo(-28.088, 4);
    expect(m.lng).toBeCloseTo(153.452, 4);
    expect(m.takenAt).toBe('2026-10-10T09:12:00+10:00');
    expect([m.width, m.height]).toEqual([1080, 1920]);
  });

  it('blanks every location string in place without changing size', () => {
    const b = mov();
    const before = b.length;
    expect(blankVideoLocation(b)).toBe(2);
    expect(b.length).toBe(before);
    expect(text(b)).not.toContain(iso);
    const m = readVideoMeta(b);
    expect(m.lat).toBeUndefined();
    expect(m.lng).toBeUndefined();
    expect(text(b)).toContain('com.apple.quicktime.creationdate'); // other metadata untouched
  });
});

describe('display location', () => {
  const zones = [{ lat: -28.115, lng: 153.465, radius_m: 1500 }];

  it('keeps public moments outside zones exact', () => {
    expect(displayLocation(-28.088, 153.452, false, zones)).toEqual({ display_lat: -28.088, display_lng: 153.452, rounded: false });
  });

  it('rounds private moments and anything inside a zone to ~2 km', () => {
    for (const [lat, lng, priv] of [[-28.088, 153.452, true], [-28.116, 153.466, false]] as const) {
      const d = displayLocation(lat, lng, priv, zones);
      expect(d.rounded).toBe(true);
      const moved = distanceM(lat, lng, d.display_lat, d.display_lng);
      expect(moved).toBeGreaterThan(0);
      expect(moved).toBeLessThan(2000);
    }
  });

  it('rounds nearby points to the same cell, so home cannot be triangulated', () => {
    const a = displayLocation(-28.1151, 153.4651, true, []);
    const b = displayLocation(-28.1189, 153.4629, true, []);
    expect([a.display_lat, a.display_lng]).toEqual([b.display_lat, b.display_lng]);
  });
});
