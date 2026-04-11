import type { APIRoute } from 'astro';
import { getAdminDb } from '../../lib/firebase-admin';

export const GET: APIRoute = async () => {
  const db = getAdminDb();
  const snap = await db
    .collection('posts')
    .where('published', '==', true)
    .orderBy('createdAt', 'desc')
    .get();

  const data = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      type: 'blog' as const,
      title: d.title,
      date: d.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      slug: doc.id,
      excerpt: d.excerpt ?? null,
      mastodon_tag: d.mastodon_tag ?? null,
      categories: d.categories ?? [],
      tripId: d.tripId ?? null,
      stopId: d.stopId ?? null,
      locationId: d.locationId ?? null,
    };
  });

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
};
