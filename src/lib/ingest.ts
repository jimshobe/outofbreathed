import { env } from 'cloudflare:workers';
import { readJpegMeta, stripJpegMeta } from './exif';
import { mapPosition, placeName, geocodePlace } from './geo';

import { parseCategories, type Category } from './categories';

// Photos are resized here, so the original can be large. Videos aren't stored on the site at all:
// they live on YouTube (unlisted) and are posted as links.
const MAX_PHOTO_BYTES = 40 * 1024 * 1024;
const DISPLAY_PX = 1600;
const THUMB_PX = 480;

export class UploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export interface UploadFields {
  categories?: string[];
  caption?: string;
  taken_at?: string;
  /** Used only when neither the uploader nor the file says when it was taken (the uploader's local "now"). */
  fallback_taken_at?: string;
  lat?: number;
  lng?: number;
  place_name?: string;
  /** A typed place used only when the item has no location of its own (YouTube links, stripped photos). */
  fallback_place?: string;
  youtube?: string;
  source_ref?: string;
  /** Id of an existing set to put this moment in. */
  set_id?: string;
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

export async function existingBySourceRef(ref: string | undefined): Promise<string | null> {
  if (!ref) return null;
  const row = await env.DB.prepare('SELECT id FROM moments WHERE source_ref = ?').bind(ref).first<{ id: string }>();
  return row?.id ?? null;
}

/** Validates, processes and stores one upload. Returns the moment id and whether it was newly created. */
export async function ingest(file: File | null, f: UploadFields): Promise<{ id: string; created: boolean }> {
  const already = await existingBySourceRef(f.source_ref);
  if (already) return { id: already, created: false };

  let categories: Category[];
  try {
    categories = parseCategories(f.categories ?? []);
  } catch (e) {
    throw new UploadError((e as Error).message);
  }
  if (!categories.length) categories = ['misc'];
  const category = categories[0]; // primary
  if (f.taken_at && !ISO_LOCAL.test(f.taken_at)) throw new UploadError('taken_at must be ISO 8601, e.g. 2026-10-10T09:12:00+10:00');
  const fallbackTakenAt = f.fallback_taken_at && ISO_LOCAL.test(f.fallback_taken_at) ? f.fallback_taken_at : new Date().toISOString();
  if ((f.lat == null) !== (f.lng == null) || (f.lat != null && (Math.abs(f.lat) > 90 || Math.abs(f.lng!) > 180))) {
    throw new UploadError('lat and lng must both be valid numbers');
  }

  if (f.set_id && !(await env.DB.prepare('SELECT 1 FROM sets WHERE id = ?').bind(f.set_id).first())) throw new UploadError('that set no longer exists');

  const id = newId();
  let kind: 'photo' | 'video';
  let source: 'site' | 'youtube' = 'site';
  let youtube_id: string | null = null;
  let media_key: string | null = null, thumb_key: string | null = null;
  let width: number | null = null, height: number | null = null;
  let meta: { takenAt?: string; lat?: number; lng?: number } = {};
  const puts: [string, Uint8Array, string][] = [];

  if (f.youtube && !file) {
    youtube_id = youtubeId(f.youtube);
    if (!youtube_id) throw new UploadError('not a YouTube link');
    kind = 'video';
    source = 'youtube';
  } else if (file) {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const type = sniff(head);
    if (type === 'video') throw new UploadError('videos go on YouTube: upload it there as Unlisted, then post the link', 415);
    if (!type) throw new UploadError('unsupported file: send a JPEG, PNG, WebP or HEIC photo', 415);
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
  } else {
    throw new UploadError('send a file, or a YouTube link');
  }

  // Values sent by the uploader win over what's in the file; fallbacks only fill gaps.
  let lat = f.lat ?? meta.lat ?? null, lng = f.lng ?? meta.lng ?? null;
  const taken_at = f.taken_at ?? meta.takenAt ?? fallbackTakenAt;
  const typedPlace = f.place_name?.trim() || null;
  const fallbackPlace = f.fallback_place?.trim() || null;
  let place_name: string | null;
  if (lat != null && lng != null) {
    place_name = typedPlace ?? (await placeName(lat, lng));
  } else {
    // No GPS: look up the typed place so the post still lands on the map.
    place_name = typedPlace ?? fallbackPlace;
    const hit = place_name ? await geocodePlace(place_name) : null;
    if (hit) ({ lat, lng } = hit);
  }
  const shown = lat != null && lng != null ? mapPosition(lat, lng) : null;

  await Promise.all(puts.map(([key, body, contentType]) => env.MEDIA.put(key, body, { httpMetadata: { contentType } })));
  try {
    // One batch = one transaction: the moment and its categories land together or not at all.
    await env.DB.batch([env.DB.prepare(
      `INSERT INTO moments (id, kind, taken_at, lat, lng, display_lat, display_lng, place_name, category, caption,
                            source, media_key, youtube_id, thumb_key, width, height, source_ref, set_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, kind, taken_at, lat, lng, shown?.display_lat ?? null, shown?.display_lng ?? null, place_name, category,
      f.caption?.trim() || null, source, media_key, youtube_id, thumb_key, width, height, f.source_ref ?? null, f.set_id ?? null,
    ), ...categories.map((c) => env.DB.prepare('INSERT INTO moment_categories (moment_id, category) VALUES (?, ?)').bind(id, c))]);
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
  return {
    categories: form.getAll('category').filter((v): v is string => typeof v === 'string'),
    caption: s('caption'),
    taken_at: s('taken_at'),
    fallback_taken_at: s('fallback_taken_at'),
    lat: n('lat'),
    lng: n('lng'),
    place_name: s('place_name'),
    fallback_place: s('fallback_place'),
    youtube: s('youtube'),
    source_ref: s('source_ref'),
    set_id: s('set_id'),
  };
}
