import type { APIRoute } from 'astro';
import { getAdminDb } from '../../lib/firebase-admin';

export const GET: APIRoute = async () => {
  const db = getAdminDb();
  const snap = await db
    .collection('posts')
    .where('published', '==', true)
    .get();

  const data = snap.docs
    .map((doc) => {
      const d = doc.data();
      const content: string = d.content ?? '';

      const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
      const image = imgMatch ? imgMatch[1] : null;

      const words = content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
      const readingTime = Math.max(1, Math.round(words / 200));

      const date = d.createdAt?.toDate?.()?.toISOString()
        ?? d.updatedAt?.toDate?.()?.toISOString()
        ?? new Date().toISOString();

      return {
        type: 'blog' as const,
        title: d.title,
        date,
        slug: doc.id,
        excerpt: d.excerpt ?? null,
        mastodon_tag: d.mastodon_tag ?? null,
        categories: d.categories ?? [],
        image,
        readingTime,
        tripId: d.tripId ?? null,
        stopId: d.stopId ?? null,
        locationId: d.locationId ?? null,
      };
    })
    .sort((a, b) => new Date(b.date).valueOf() - new Date(a.date).valueOf());

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
};
