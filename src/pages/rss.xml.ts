import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getAdminDb } from '../lib/firebase-admin';

export async function GET(context: APIContext) {
  const db = getAdminDb();
  const snap = await db
    .collection('posts')
    .where('published', '==', true)
    .orderBy('createdAt', 'desc')
    .get();

  const items = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      title: d.title,
      pubDate: d.createdAt?.toDate?.() ?? new Date(),
      description: d.excerpt ?? undefined,
      link: `/posts/${doc.id}/`,
    };
  });

  return rss({
    title: 'outofbreathed.com',
    description: 'A personal stream.',
    site: context.site!,
    items,
  });
}
