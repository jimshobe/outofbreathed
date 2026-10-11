import { describe, it, expect } from 'vitest';
import { readJpegMeta, stripJpegMeta } from '../exif';
import { displayFor } from '../zone-math';
import { jpegWithGps } from './fixtures';

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

describe('map position', () => {
  it('is the real position, to about a metre, outside any zone', () => {
    expect(displayFor(-28.0884312, 153.4521987, [])).toEqual({ display_lat: -28.08843, display_lng: 153.4522, zone_id: null });
  });
});
