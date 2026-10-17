import type { APIRoute } from 'astro';
import { placeMoments, lbItem, fmtDay } from '../../lib/moments';

// Viewer endpoint: the moments at one map spot (?lat=&lng= is the spot key from listPlaces).
export const GET: APIRoute = async ({ url }) => {
  const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ error: 'lat and lng required' }, { status: 400 });
  const { moments, sets } = await placeMoments(lat, lng);
  const setTitle = new Map(sets.map((s) => [s.id, s.title]));
  return Response.json({
    moments: moments.map((m) => ({
      ...(m.media_key ? lbItem(m) : { id: m.id, caption: m.caption, meta: null, src: null }),
      thumb: m.thumb_key ? `/media/${m.thumb_key}` : m.youtube_id ? `https://i.ytimg.com/vi/${m.youtube_id}/mqdefault.jpg` : null,
      youtube: m.youtube_id,
      date: fmtDay(m.taken_at),
      taken_at: m.taken_at,
      set: m.set_id ? { id: m.set_id, title: setTitle.get(m.set_id) ?? '' } : null,
    })),
  });
};
