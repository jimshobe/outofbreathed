import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');

  const data = posts
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .map((post) => ({
      type: 'blog' as const,
      title: post.data.title,
      date: post.data.date.toISOString(),
      slug: post.id,
      excerpt: post.data.excerpt ?? null,
      mastodon_tag: post.data.mastodon_tag ?? null,
    }));

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
};
