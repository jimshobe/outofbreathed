// Minimal JPEG metadata handling: read the capture date and GPS position from EXIF,
// and strip every metadata segment that could carry location before a file is shown to viewers.

export interface PhotoMeta {
  /** Camera-local wall-clock time, with offset when the camera recorded one: 2026-10-10T09:12:00+10:00 */
  takenAt?: string;
  lat?: number;
  lng?: number;
}

const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

/** Yields [marker, segmentStart, segmentEnd] for each segment before the image data. */
function* segments(b: Uint8Array): Generator<[number, number, number]> {
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    yield [marker, i, i + 2 + len];
    if (marker === 0xda) return; // start of scan: compressed data follows
    i += 2 + len;
  }
}

const ascii = (b: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...b.subarray(start, start + len)).replace(/\0+$/, '');

export function readJpegMeta(b: Uint8Array): PhotoMeta {
  if (!isJpeg(b)) return {};
  for (const [marker, start, end] of segments(b)) {
    if (marker !== 0xe1 || ascii(b, start + 4, 6) !== 'Exif') continue;
    try {
      return readTiff(b.subarray(start + 10, end));
    } catch {
      return {};
    }
  }
  return {};
}

function readTiff(t: Uint8Array): PhotoMeta {
  const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const le = t[0] === 0x49; // 'II' little-endian, 'MM' big-endian
  const u16 = (o: number) => dv.getUint16(o, le);
  const u32 = (o: number) => dv.getUint32(o, le);

  const readIfd = (offset: number) => {
    const tags = new Map<number, { type: number; count: number; valueOffset: number }>();
    const n = u16(offset);
    for (let k = 0; k < n; k++) {
      const e = offset + 2 + k * 12;
      const type = u16(e + 2), count = u32(e + 4);
      const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<number, number>)[type] ?? 1;
      // Values that fit in 4 bytes are stored inline; larger ones are at an offset.
      tags.set(u16(e), { type, count, valueOffset: size * count <= 4 ? e + 8 : u32(e + 8) });
    }
    return tags;
  };
  const str = (tag?: { count: number; valueOffset: number }) => (tag ? ascii(t, tag.valueOffset, tag.count) : undefined);
  const rationals = (tag?: { count: number; valueOffset: number }) =>
    tag ? Array.from({ length: tag.count }, (_, k) => u32(tag.valueOffset + k * 8) / u32(tag.valueOffset + k * 8 + 4)) : undefined;

  const ifd0 = readIfd(u32(4));
  const meta: PhotoMeta = {};

  const exifPtr = ifd0.get(0x8769);
  if (exifPtr) {
    const exif = readIfd(u32(exifPtr.valueOffset));
    const dt = str(exif.get(0x9003)) ?? str(ifd0.get(0x0132)); // DateTimeOriginal, else DateTime
    const offset = str(exif.get(0x9011)); // OffsetTimeOriginal, e.g. "+10:00"
    const m = dt?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (m) meta.takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : ''}`;
  }

  const gpsPtr = ifd0.get(0x8825);
  if (gpsPtr) {
    const gps = readIfd(u32(gpsPtr.valueOffset));
    const lat = rationals(gps.get(2)), lng = rationals(gps.get(4));
    const toDeg = (d: number[]) => d[0] + (d[1] ?? 0) / 60 + (d[2] ?? 0) / 3600;
    if (lat?.length && lng?.length && lat.every(Number.isFinite) && lng.every(Number.isFinite)) {
      meta.lat = toDeg(lat) * (str(gps.get(1)) === 'S' ? -1 : 1);
      meta.lng = toDeg(lng) * (str(gps.get(3)) === 'W' ? -1 : 1);
    }
  }
  return meta;
}

/**
 * Removes EXIF/XMP (APP1), IPTC (APP13), other app-specific segments and comments.
 * Keeps JFIF (APP0), the ICC colour profile (APP2) and Adobe colour info (APP14).
 */
export function stripJpegMeta(b: Uint8Array): Uint8Array {
  if (!isJpeg(b)) throw new Error('not a JPEG');
  const keep: Uint8Array[] = [b.subarray(0, 2)];
  for (const [marker, start, end] of segments(b)) {
    if (marker === 0xda) { keep.push(b.subarray(start)); break; }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keepApp = marker === 0xe0 || marker === 0xee || (marker === 0xe2 && ascii(b, start + 4, 11) === 'ICC_PROFILE');
    if ((isApp && !keepApp) || marker === 0xfe) continue;
    keep.push(b.subarray(start, end));
  }
  const out = new Uint8Array(keep.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of keep) { out.set(p, o); o += p.length; }
  return out;
}
