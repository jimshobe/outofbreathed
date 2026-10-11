import { env } from 'cloudflare:workers';
import { readJpegMeta, stripJpegMeta } from './exif';
import { readVideoMeta, blankVideoLocation } from './quicktime';
import { displayLocation, placeName, type Zone } from './geo';

export const CATEGORIES = ['misc', 'family', 'travel', 'moto', 'food'] as const;
export type Category = (typeof CATEGORIES)[number];

// Photos are resized here, so the original can be large. Videos are kept as uploaded (compressed on
// the phone), and must fit in Worker memory alongside the parsed form, so they get a lower cap.
const MAX_PHOTO_BYTES = 40 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const DISPLAY_PX = 1600;
const THUMB_PX = 480;

export class UploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export interface UploadFields {
  category?: string;
  caption?: string;
  private?: boolean;
  food_type?: string;
  taken_at?: string;
  /** Used only when neither the uploader nor the file says when it was taken (the uploader's local "now"). */
  fallback_taken_at?: string;
  lat?: number;
  lng?: number;
  place_name?: string;
  youtube?: string;
  source_ref?: string;
}

export const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}

type Kind = 'jpeg' | 'image' | 'video';
function sniff(b: Uint8Array): Kind | null {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image'; // PNG
  const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image';
  if (ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (/^(heic|heix|hevc|mif1|msf1|avif)$/.test(brand)) return 'image';
    return 'video'; // qt, isom, mp41, mp42, M4V ...
  }
  return null;
}

async function toJpeg(bytes: Uint8Array<ArrayBuffer>, maxPx: number): Promise<Uint8Array> {
  const out = await env.IMAGES.input(new Blob([bytes]).stream())
    .transform({ width: maxPx, height: maxPx, fit: 'scale-down' })
    .output({ format: 'image/jpeg', quality: 82 });
  // Re-encoding usually drops metadata already; strip anyway so no location can survive.
  return stripJpegMeta(new Uint8Array(await out.response().arrayBuffer()));
}

/** Reads width/height from a baseline or progressive JPEG's SOF segment. */
function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

const newId = () => {
  // Time-ordered and unguessable: base36 timestamp + random suffix.
  const rand = crypto.getRandomValues(new Uint8Array(8)).reduce((s, x) => s + x.toString(36).padStart(2, '0'), '');
  return Date.now().toString(36) + rand.slice(0, 10);
};

async function zones(): Promise<Zone[]> {
  const { results } = await env.DB.prepare('SELECT lat, lng, radius_m FROM private_zones').all<Zone>();
  return results;
}

export async function existingBySourceRef(ref: string | undefined): Promise<string | null> {
  if (!ref) return null;
  const row = await env.DB.prepare('SELECT id FROM moments WHERE source_ref = ?').bind(ref).first<{ id: string }>();
  return row?.id ?? null;
}

/** Validates, processes and stores one upload. Returns the moment id and whether it was newly created. */
export async function ingest(file: File | null, f: UploadFields): Promise<{ id: string; created: boolean }> {
  const already = await existingBySourceRef(f.source_ref);
  if (already) return { id: already, created: false };

  const category = (f.category ?? 'misc').toLowerCase();
  if (!CATEGORIES.includes(category as Category)) throw new UploadError(`category must be one of ${CATEGORIES.join(', ')}`);
  // Family (which includes the kids) is private unless the uploader says otherwise.
  const visibility = (f.private ?? category === 'family') ? 'private' : 'everyone';
  const food_type = category === 'food' && (f.food_type === 'home' || f.food_type === 'out') ? f.food_type : null;
  if (f.taken_at && !ISO_LOCAL.test(f.taken_at)) throw new UploadError('taken_at must be ISO 8601, e.g. 2026-10-10T09:12:00+10:00');
  const fallbackTakenAt = f.fallback_taken_at && ISO_LOCAL.test(f.fallback_taken_at) ? f.fallback_taken_at : new Date().toISOString();
  if ((f.lat == null) !== (f.lng == null) || (f.lat != null && (Math.abs(f.lat) > 90 || Math.abs(f.lng!) > 180))) {
    throw new UploadError('lat and lng must both be valid numbers');
  }

  const id = newId();
  let kind: 'photo' | 'video';
  let source: 'site' | 'youtube' = 'site';
  let youtube_id: string | null = null;
  let media_key: string | null = null, thumb_key: string | null = null;
  let width: number | null = null, height: number | null = null;
  let meta: { takenAt?: string; lat?: number; lng?: number } = {};
  const puts: [string, Uint8Array, string][] = [];

  if (f.youtube && !file) {
    if (visibility === 'private') throw new UploadError('private moments stay on the site; upload the video instead of a YouTube link');
    youtube_id = youtubeId(f.youtube);
    if (!youtube_id) throw new UploadError('not a YouTube link');
    kind = 'video';
    source = 'youtube';
  } else if (file) {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const type = sniff(head);
    if (!type) throw new UploadError('unsupported file: send a JPEG, PNG, WebP, HEIC, MP4 or MOV', 415);

    if (type === 'video') {
      if (file.size > MAX_VIDEO_BYTES) throw new UploadError(`video is over ${MAX_VIDEO_BYTES >> 20} MB: compress it to 720p, or post a YouTube link instead`, 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const v = readVideoMeta(bytes);
      blankVideoLocation(bytes);
      meta = v;
      kind = 'video';
      width = v.width ?? null;
      height = v.height ?? null;
      const ext = String.fromCharCode(...head.subarray(8, 10)) === 'qt' ? 'mov' : 'mp4';
      media_key = `m/${id}.${ext}`;
      puts.push([media_key, bytes, ext === 'mov' ? 'video/quicktime' : 'video/mp4']);
    } else {
      if (file.size > MAX_PHOTO_BYTES) throw new UploadError(`photo is over ${MAX_PHOTO_BYTES >> 20} MB`, 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (type === 'jpeg') meta = readJpegMeta(bytes);
      let display: Uint8Array, thumb: Uint8Array;
      try {
        [display, thumb] = await Promise.all([toJpeg(bytes, DISPLAY_PX), toJpeg(bytes, THUMB_PX)]);
      } catch (e) {
        throw new UploadError(`couldn't process this image (${e instanceof Error ? e.message : e})`, 415);
      }
      const size = jpegSize(display);
      width = size?.width ?? null;
      height = size?.height ?? null;
      kind = 'photo';
      media_key = `m/${id}.jpg`;
      thumb_key = `t/${id}.jpg`;
      puts.push([media_key, display, 'image/jpeg'], [thumb_key, thumb, 'image/jpeg']);
    }
  } else {
    throw new UploadError('send a file, or a YouTube link');
  }

  // Values sent by the uploader (the Shortcut reads them from Photos) win over what's in the file.
  const lat = f.lat ?? meta.lat ?? null, lng = f.lng ?? meta.lng ?? null;
  const taken_at = f.taken_at ?? meta.takenAt ?? fallbackTakenAt;
  const shown = lat != null && lng != null ? displayLocation(lat, lng, visibility === 'private', await zones()) : null;
  const place_name = f.place_name?.trim() || (lat != null && lng != null ? await placeName(lat, lng) : null);

  await Promise.all(puts.map(([key, body, contentType]) => env.MEDIA.put(key, body, { httpMetadata: { contentType } })));
  try {
    await env.DB.prepare(
      `INSERT INTO moments (id, kind, taken_at, lat, lng, display_lat, display_lng, place_name, category, food_type, caption,
                            visibility, source, media_key, youtube_id, thumb_key, width, height, source_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, kind, taken_at, lat, lng, shown?.display_lat ?? null, shown?.display_lng ?? null, place_name, category, food_type,
      f.caption?.trim() || null, visibility, source, media_key, youtube_id, thumb_key, width, height, f.source_ref ?? null,
    ).run();
  } catch (e) {
    await Promise.all(puts.map(([key]) => env.MEDIA.delete(key)));
    // Two retries raced: the other one won, so return its moment.
    const winner = await existingBySourceRef(f.source_ref);
    if (winner) return { id: winner, created: false };
    throw e;
  }
  return { id, created: true };
}

/** Parses the multipart form the Shortcut and the post page send. */
export function fieldsFromForm(form: FormData): UploadFields {
  const s = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };
  // Shortcuts may format numbers with a decimal comma depending on region settings.
  const n = (k: string) => {
    const v = s(k)?.replace(',', '.');
    return v != null && Number.isFinite(Number(v)) ? Number(v) : undefined;
  };
  const priv = s('private')?.toLowerCase();
  return {
    category: s('category'),
    caption: s('caption'),
    private: priv == null ? undefined : ['1', 'true', 'yes', 'on'].includes(priv),
    food_type: s('food_type'),
    taken_at: s('taken_at'),
    fallback_taken_at: s('fallback_taken_at'),
    lat: n('lat'),
    lng: n('lng'),
    place_name: s('place_name'),
    youtube: s('youtube'),
    source_ref: s('source_ref'),
  };
}
