import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { BLUESKY_HANDLE } from '../../config';

interface SocialLinkDoc {
  id: string;
  platform: string;
  postUri: string;
}

interface BlueskyPost {
  uri: string;
  text: string;
  createdAt: string;
  url: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function BlueskyStopFeed({ stopId }: { stopId: string }) {
  const [posts, setPosts] = useState<BlueskyPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setPosts([]);

    async function load() {
      // Find social_links docs for this stop (bluesky)
      const snap = await getDocs(
        query(
          collection(db, 'social_links'),
          where('stopId', '==', stopId),
          where('platform', '==', 'bluesky')
        )
      );
      const links: SocialLinkDoc[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SocialLinkDoc));
      if (!links.length) { setLoading(false); return; }

      // Fetch each post from Bluesky public API
      const fetched = await Promise.all(
        links.map(async (link) => {
          try {
            const res = await fetch(
              `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(link.postUri)}&depth=0`
            );
            if (!res.ok) return null;
            const data = await res.json();
            const post = data.thread?.post;
            if (!post) return null;
            const rkey = post.uri.split('/').pop();
            return {
              uri: post.uri,
              text: post.record?.text ?? '',
              createdAt: post.record?.createdAt ?? '',
              url: `https://bsky.app/profile/${BLUESKY_HANDLE}/post/${rkey}`,
            } as BlueskyPost;
          } catch {
            return null;
          }
        })
      );

      setPosts(fetched.filter(Boolean) as BlueskyPost[]);
      setLoading(false);
    }

    load().catch(() => setLoading(false));
  }, [stopId]);

  if (loading) return <p className="panel-empty">Loading…</p>;
  if (posts.length === 0) return <p className="panel-empty">No linked social posts yet.</p>;

  return (
    <div className="panel-social-list">
      {posts.map((post) => (
        <div key={post.uri} className="panel-social-post">
          {post.createdAt && (
            <p className="panel-social-date">{formatDate(post.createdAt)}</p>
          )}
          <p
            className="panel-social-text"
            dangerouslySetInnerHTML={{ __html: escapeHtml(post.text).replace(/\n/g, '<br>') }}
          />
          <a href={post.url} className="panel-social-link" target="_blank" rel="noopener noreferrer">
            View on Bluesky →
          </a>
        </div>
      ))}
    </div>
  );
}
