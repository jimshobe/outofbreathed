import { useState, useEffect } from 'react';

interface BlogEntry {
  slug: string;
  title: string;
  date: string;
  stopId: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function BlogStopLinks({ stopId }: { stopId: string }) {
  const [posts, setPosts] = useState<BlogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/posts.json')
      .then((r) => r.json())
      .then((all: BlogEntry[]) => {
        setPosts(all.filter((p) => p.stopId === stopId));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [stopId]);

  if (loading) return <p className="panel-empty">Loading…</p>;
  if (posts.length === 0) return <p className="panel-empty">No linked blog posts yet.</p>;

  return (
    <div className="panel-blog-list">
      {posts.map((post) => (
        <div key={post.slug} className="panel-blog-item">
          <a href={`/posts/${post.slug}`} className="panel-blog-title">{post.title}</a>
          <span className="panel-blog-date">{formatDate(post.date)}</span>
        </div>
      ))}
    </div>
  );
}
