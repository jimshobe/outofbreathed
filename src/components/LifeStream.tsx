import { useState, useEffect } from 'react';
import { MASTODON_INSTANCE, MASTODON_USERNAME } from '../config';

interface BlogEntry {
  type: 'blog';
  title: string;
  date: string;
  slug: string;
  excerpt: string | null;
  mastodon_tag: string | null;
}

interface MastodonEntry {
  type: 'mastodon';
  id: string;
  date: string;
  content: string;
  url: string;
  media: { url: string; previewUrl: string; alt: string }[];
}

type StreamEntry = BlogEntry | MastodonEntry;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function MastodonContent({ html }: { html: string }) {
  return (
    <p
      className="mastodon-text"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function EntryDate({ iso }: { iso: string }) {
  return <time className="entry-date" dateTime={iso}>{formatDate(iso)}</time>;
}

function BlogCard({ entry }: { entry: BlogEntry }) {
  return (
    <article className="entry entry--blog">
      <EntryDate iso={entry.date} />
      <h2 className="entry-title">
        <a href={`/posts/${entry.slug}`}>{entry.title}</a>
      </h2>
      {entry.excerpt && (
        <p className="entry-excerpt">{entry.excerpt}</p>
      )}
      <a href={`/posts/${entry.slug}`} className="read-more">
        Read more
      </a>
    </article>
  );
}

function Lightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <img src={url} alt={alt} className="lightbox-img" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function MastodonCard({ entry, onImageClick }: { entry: MastodonEntry; onImageClick: (url: string, alt: string) => void }) {
  const text = stripHtml(entry.content);
  if (!text) return null;

  return (
    <article className="entry entry--mastodon">
      <EntryDate iso={entry.date} />
      <MastodonContent html={entry.content} />
      {entry.media.length > 0 && (
        <div className="entry-media">
          {entry.media.map((m) => (
            <button key={m.url} className="entry-media-btn" onClick={() => onImageClick(m.url, m.alt)} aria-label="View full size">
              <img src={m.previewUrl} alt={m.alt} loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function SkeletonEntry() {
  return (
    <div className="entry entry--skeleton" aria-hidden="true">
      <div className="skeleton skeleton--date" />
      <div className="skeleton skeleton--line skeleton--long" />
      <div className="skeleton skeleton--line skeleton--medium" />
    </div>
  );
}

export default function LifeStream() {
  const [entries, setEntries] = useState<StreamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [postsRes, accountRes] = await Promise.all([
          fetch('/api/posts.json'),
          fetch(`https://${MASTODON_INSTANCE}/api/v1/accounts/lookup?acct=${MASTODON_USERNAME}`),
        ]);

        if (!postsRes.ok) throw new Error('Failed to load posts');

        const blogPosts: BlogEntry[] = await postsRes.json();

        let mastodonEntries: MastodonEntry[] = [];

        if (accountRes.ok) {
          const account = await accountRes.json();
          const statusRes = await fetch(
            `https://${MASTODON_INSTANCE}/api/v1/accounts/${account.id}/statuses?limit=40&exclude_replies=true&exclude_reblogs=true`
          );
          if (statusRes.ok) {
            const statuses = await statusRes.json();
            mastodonEntries = statuses
              .filter((s: any) => s.content && s.content.trim() !== '<p></p>')
              .map((s: any) => ({
                type: 'mastodon' as const,
                id: s.id,
                date: s.created_at,
                content: s.content,
                url: s.url,
                media: (s.media_attachments ?? [])
                  .filter((m: any) => m.type === 'image')
                  .map((m: any) => ({ url: m.url, previewUrl: m.preview_url ?? m.url, alt: m.description ?? '' })),
              }));
          }
        }

        const merged: StreamEntry[] = [...blogPosts, ...mastodonEntries].sort(
          (a, b) => new Date(b.date).valueOf() - new Date(a.date).valueOf()
        );

        setEntries(merged);
      } catch (e) {
        setError('Could not load the stream.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="stream">
        {[0, 1, 2].map((i) => <SkeletonEntry key={i} />)}
      </div>
    );
  }

  if (error) {
    return <p className="stream-error">{error}</p>;
  }

  if (entries.length === 0) {
    return <p className="stream-empty">Nothing here yet.</p>;
  }

  return (
    <>
      {lightbox && (
        <Lightbox url={lightbox.url} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
      <div className="stream">
        {entries.map((entry) =>
          entry.type === 'blog'
            ? <BlogCard key={`blog-${entry.slug}`} entry={entry} />
            : <MastodonCard key={`mastodon-${entry.id}`} entry={entry} onImageClick={(url, alt) => setLightbox({ url, alt })} />
        )}
      </div>
    </>
  );
}
