import { describe, it, expect } from 'vitest';
import { readJpegMeta, stripJpegMeta } from '../exif';
import { readVideoMeta, blankVideoLocation } from '../quicktime';
import { generalLocation } from '../geo';
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

describe('general location', () => {
  const metres = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const r = Math.PI / 180;
    const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  };

  it('never returns the exact position, and stays within the same ~2 km area', () => {
    for (const [lat, lng] of [[-28.088, 153.452], [47.447, -122.46], [-31.95, 115.861]]) {
      const d = generalLocation(lat, lng);
      const moved = metres(lat, lng, d.display_lat, d.display_lng);
      expect(moved).toBeGreaterThan(0);
      expect(moved).toBeLessThan(2000);
    }
  });

  it('puts nearby points in the same cell, so a house cannot be triangulated from several photos', () => {
    expect(generalLocation(-28.1151, 153.4651)).toEqual(generalLocation(-28.1189, 153.4629));
  });
});
