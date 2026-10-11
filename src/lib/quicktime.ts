// MP4/MOV metadata handling. iPhones record location as an ISO 6709 string
// ("+47.4470-122.4600+050.000/") in the moov box's metadata, and the capture time as
// com.apple.quicktime.creationdate ("2026-10-10T09:12:00+1000"). We read both, then blank the
// location in place: same byte length, so no box sizes or sample offsets change.

export interface VideoMeta {
  takenAt?: string;
  lat?: number;
  lng?: number;
  width?: number;
  height?: number;
}

const ISO6709 = /([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?(?:CRSWGS_84)?\//g;
const CREATION = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-]\d{2}:?\d{2}|Z)/;

/** Finds the top-level moov box: [start, end) in bytes. */
export function findMoov(b: Uint8Array): [number, number] | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 0;
  while (i + 8 <= b.length) {
    let size = dv.getUint32(i);
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (size === 1) size = Number(dv.getBigUint64(i + 8));
    else if (size === 0) size = b.length - i;
    if (size < 8) return null;
    if (type === 'moov') return [i, Math.min(i + size, b.length)];
    i += size;
  }
  return null;
}

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
};

export function readVideoMeta(b: Uint8Array): VideoMeta {
  const moov = findMoov(b);
  if (!moov) return {};
  const box = b.subarray(...moov);
  const text = latin1(box);
  const meta: VideoMeta = {};

  const loc = [...text.matchAll(ISO6709)][0];
  if (loc) {
    const lat = parseFloat(loc[1]), lng = parseFloat(loc[2]);
    // 0,0 is what a blanked location reads as; treat it as "no location", not the Gulf of Guinea.
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) { meta.lat = lat; meta.lng = lng; }
  }
  const c = text.match(CREATION);
  if (c) meta.takenAt = c[1] + (c[2] === 'Z' ? 'Z' : c[2].replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2'));

  // Display size from the video track header (tkhd): width/height are 16.16 fixed point in its
  // last 8 bytes; a 90° rotation matrix means the picture is shown portrait.
  const dv = new DataView(box.buffer, box.byteOffset, box.byteLength);
  for (let i = text.indexOf('tkhd'); i !== -1; i = text.indexOf('tkhd', i + 4)) {
    const start = i - 4, size = dv.getUint32(start);
    if (size < 92 || start + size > box.length) continue;
    const w = dv.getUint32(start + size - 8) / 65536, h = dv.getUint32(start + size - 4) / 65536;
    if (!w || !h) continue; // audio tracks have no size
    const matrix = start + size - 44;
    const a = dv.getInt32(matrix) / 65536, bb = dv.getInt32(matrix + 4) / 65536;
    const rotated = Math.round(a) === 0 && Math.abs(Math.round(bb)) === 1;
    meta.width = Math.round(rotated ? h : w);
    meta.height = Math.round(rotated ? w : h);
    break;
  }
  return meta;
}

/** Overwrites every ISO 6709 location in the moov box with zeros, in place. Returns how many were blanked. */
export function blankVideoLocation(b: Uint8Array): number {
  const moov = findMoov(b);
  if (!moov) return 0;
  const box = b.subarray(...moov);
  let n = 0;
  for (const m of latin1(box).matchAll(ISO6709)) {
    for (let k = m.index!; k < m.index! + m[0].length; k++) {
      const ch = box[k];
      if (ch >= 0x30 && ch <= 0x39) box[k] = 0x30; // every digit becomes '0'
    }
    n++;
  }
  return n;
}
