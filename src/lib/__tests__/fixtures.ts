// Builds tiny but structurally valid JPEG and MP4 files with known metadata.

const enc = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const segment = (marker: number, payload: Uint8Array) => {
  const len = payload.length + 2;
  return concat(new Uint8Array([0xff, marker, len >> 8, len & 0xff]), payload);
};

/** Big-endian TIFF with IFD0 -> Exif IFD (DateTimeOriginal, OffsetTimeOriginal) and GPS IFD. */
function tiff(opts: { date: string; offset?: string; lat: [number, string]; lng: [number, string] }) {
  const buf = new Uint8Array(512);
  const dv = new DataView(buf.buffer);
  buf.set(enc('MM'), 0); dv.setUint16(2, 42); dv.setUint32(4, 8);
  let heap = 300; // where out-of-line values go
  const putStr = (s: string) => { const at = heap; buf.set(enc(s + '\0'), at); heap += s.length + 1; return at; };
  const putDms = (deg: number) => {
    const at = heap;
    const d = Math.floor(deg), mFloat = (deg - d) * 60, m = Math.floor(mFloat), s = Math.round((mFloat - m) * 60 * 10000);
    [[d, 1], [m, 1], [s, 10000]].forEach(([n, den], k) => { dv.setUint32(at + k * 8, n); dv.setUint32(at + k * 8 + 4, den); });
    heap += 24;
    return at;
  };
  const ifd = (at: number, entries: [number, number, number, number][]) => {
    dv.setUint16(at, entries.length);
    entries.forEach(([tag, type, count, value], k) => {
      const e = at + 2 + k * 12;
      dv.setUint16(e, tag); dv.setUint16(e + 2, type); dv.setUint32(e + 4, count);
      if (type === 2 && count <= 4) buf.set(enc(String.fromCharCode(value)), e + 8); // inline 1-char ref
      else dv.setUint32(e + 8, value);
    });
  };
  const EXIF_IFD = 100, GPS_IFD = 180;
  ifd(8, [[0x8769, 4, 1, EXIF_IFD], [0x8825, 4, 1, GPS_IFD]]);
  const exifEntries: [number, number, number, number][] = [[0x9003, 2, opts.date.length + 1, putStr(opts.date)]];
  if (opts.offset) exifEntries.push([0x9011, 2, opts.offset.length + 1, putStr(opts.offset)]);
  ifd(EXIF_IFD, exifEntries);
  ifd(GPS_IFD, [
    [1, 2, 2, opts.lat[1].charCodeAt(0)], [2, 5, 3, putDms(opts.lat[0])],
    [3, 2, 2, opts.lng[1].charCodeAt(0)], [4, 5, 3, putDms(opts.lng[0])],
  ]);
  return buf.subarray(0, heap);
}

export function jpegWithGps(opts: Parameters<typeof tiff>[0]) {
  return concat(
    new Uint8Array([0xff, 0xd8]),
    segment(0xe0, concat(enc('JFIF\0'), new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0]))),
    segment(0xe1, concat(enc('Exif\0\0'), tiff(opts))),
    segment(0xe1, enc('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>28,6.9S</exif:GPSLatitude></x:xmpmeta>')),
    segment(0xe2, concat(enc('ICC_PROFILE\0'), new Uint8Array([1, 1, 9, 9]))),
    segment(0xfe, enc('a comment')),
    segment(0xdb, new Uint8Array(65)), // quantisation table
    segment(0xda, new Uint8Array([1, 1, 0, 0, 63, 0])),
    new Uint8Array([0x12, 0x34, 0x56, 0xff, 0xd9]), // "image data" + EOI
  );
}

const box = (type: string, ...children: Uint8Array[]) => {
  const body = concat(...children);
  const head = new Uint8Array(8);
  new DataView(head.buffer).setUint32(0, body.length + 8);
  head.set(Uint8Array.from(type, (c) => c.charCodeAt(0)), 4); // box types are raw bytes ('©' is 0xA9)
  return concat(head, body);
};

/** ftyp + moov(tkhd with a 90° rotation, udta location, meta creationdate) + mdat. */
export function movWithGps(opts: { iso6709: string; created: string; w: number; h: number; rotated: boolean }) {
  const tkhd = new Uint8Array(84); // version 0 payload after the 8-byte header
  const dv = new DataView(tkhd.buffer);
  const m = 40; // matrix offset within payload: 84 - 36 - 8
  const one = 0x10000;
  if (opts.rotated) { dv.setInt32(m, 0); dv.setInt32(m + 4, one); dv.setInt32(m + 12, -one); dv.setInt32(m + 16, 0); }
  else { dv.setInt32(m, one); dv.setInt32(m + 16, one); }
  dv.setInt32(m + 32, 0x40000000);
  dv.setUint32(76, opts.w * one); dv.setUint32(80, opts.h * one);
  return concat(
    box('ftyp', enc('qt  \0\0\0\0qt  ')),
    box('moov',
      box('trak', box('tkhd', tkhd)),
      box('udta', box('\xa9xyz', new Uint8Array([0, opts.iso6709.length, 0x15, 0xc7]), enc(opts.iso6709))),
      box('meta', enc('com.apple.quicktime.location.ISO6709'), enc(opts.iso6709), enc('com.apple.quicktime.creationdate'), enc(opts.created)),
    ),
    box('mdat', new Uint8Array(32).fill(7)),
  );
}
