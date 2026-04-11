import { useState, useEffect } from 'react';
import { MASTODON_INSTANCE, MASTODON_USERNAME, BLUESKY_HANDLE } from '../config';
import { loadCategoryConfig, categorizeSocialPost } from '../lib/travel/categories';
import { getPublishedTrips, getTripStops } from '../lib/travel/trips';
import { DEFAULT_CATEGORIES } from '../types/categories';
import type { Category, CategoryConfig } from '../types/categories';
import type { TripJSON, TripStopJSON } from '../types/travel';
import TravelMap from './travel/TravelMap';

interface BlogEntry {
  type: 'blog';
  title: string;
  date: string;
  slug: string;
  excerpt: string | null;
  mastodon_tag: string | null;
  categories: string[];
  image: string | null;
  readingTime: number;
}

interface SocialMedia {
  url: string;
  previewUrl: string;
  alt: string;
  kind: 'image' | 'video';
}

interface SocialEntry {
  type: 'social';
  source: 'mastodon' | 'bluesky';
  id: string;
  date: string;
  content: string;
  url: string;
  media: SocialMedia[];
  hashtags: string[];
}

type StreamEntry = BlogEntry | SocialEntry;

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Bluesky uses UTF-8 byte offsets in facets, not character offsets
function processBlueskyText(text: string, facets: any[]): string {
  if (!facets || facets.length === 0) {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(text);

  const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

  let html = '';
  let pos = 0;

  for (const facet of sorted) {
    const { byteStart, byteEnd } = facet.index;
    if (byteStart > pos) {
      html += escapeHtml(decoder.decode(bytes.slice(pos, byteStart)));
    }

    const segment = escapeHtml(decoder.decode(bytes.slice(byteStart, byteEnd)));
    const tagFeature = facet.features?.find((f: any) => f.$type === 'app.bsky.richtext.facet#tag');
    const linkFeature = facet.features?.find((f: any) => f.$type === 'app.bsky.richtext.facet#link');
    const mentionFeature = facet.features?.find((f: any) => f.$type === 'app.bsky.richtext.facet#mention');

    if (tagFeature) {
      html += `<a href="https://bsky.app/hashtag/${encodeURIComponent(tagFeature.tag)}" target="_blank" rel="noopener noreferrer">${segment}</a>`;
    } else if (linkFeature) {
      html += `<a href="${escapeHtml(linkFeature.uri)}" target="_blank" rel="noopener noreferrer">${segment}</a>`;
    } else if (mentionFeature) {
      html += `<a href="https://bsky.app/profile/${encodeURIComponent(mentionFeature.did)}" target="_blank" rel="noopener noreferrer">${segment}</a>`;
    } else {
      html += segment;
    }

    pos = byteEnd;
  }

  if (pos < bytes.length) {
    html += escapeHtml(decoder.decode(bytes.slice(pos)));
  }

  return html.replace(/\n/g, '<br>');
}

function SocialContent({ html }: { html: string }) {
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

function BlogCard({ entry, index }: { entry: BlogEntry; index: number }) {
  return (
    <article className="entry entry--blog" style={{ animationDelay: `${index * 40}ms` }}>
      <div className="blog-card-inner">
        <div className="blog-card-body">
          <div className="blog-card-meta">
            <EntryDate iso={entry.date} />
            <span className="blog-reading-time">{entry.readingTime} min read</span>
          </div>
          {(entry.categories ?? []).length > 0 && (
            <div className="blog-categories">
              {(entry.categories ?? []).map((cat) => (
                <span key={cat} className="blog-category-pill">{cat}</span>
              ))}
            </div>
          )}
          <h2 className="entry-title">
            <a href={`/posts/${entry.slug}`}>{entry.title}</a>
          </h2>
          {entry.excerpt && (
            <p className="entry-excerpt">{entry.excerpt}</p>
          )}
          <a href={`/posts/${entry.slug}`} className="read-more">
            Read →
          </a>
        </div>
        {entry.image && (
          <a href={`/posts/${entry.slug}`} className="blog-card-thumb-link" tabIndex={-1} aria-hidden="true">
            <img src={entry.image} alt="" className="blog-card-thumb" loading="lazy" />
          </a>
        )}
      </div>
    </article>
  );
}

function Lightbox({ url, alt, kind, onClose }: { url: string; alt: string; kind: 'image' | 'video'; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      {kind === 'video' ? (
        <video src={url} className="lightbox-img" controls autoPlay loop onClick={(e) => e.stopPropagation()} />
      ) : (
        <img src={url} alt={alt} className="lightbox-img" onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}

const SOURCE_ICONS: Record<SocialEntry['source'], { label: string; icon: React.ReactNode }> = {
  mastodon: {
    label: 'Mastodon',
    icon: (
      <svg width="13" height="13" viewBox="0 0 74 79" fill="currentColor" aria-hidden="true">
        <path d="M73.7 17.5C72.7 10.6 66.8 5.2 59.8 4.1 58.6 3.9 53.8 3 42.6 3h-.1C31.4 3 28.9 3.9 27.7 4.1 20.9 5.1 14.7 9.9 13.1 16.8c-.8 3.5-.9 7.3-.7 10.9.3 5.2.4 10.5 1.2 15.7 .6 3.4 1.4 6.7 2.6 9.9 2.3 5.9 8 9.8 14.1 10.9 6.3 1.2 12.8.9 19-.6.7-.2 1.3-.4 2-.6.7-.3 1.5-.6 2.1-1.1l-.1-3.8c-.7.3-1.5.6-2.3.8-5.8 1.6-11.9 1.7-17.7.3-4.6-1.2-7.7-5.2-8.3-9.9 5.5 1.3 11.1 2 16.7 2 2.8 0 5.5-.1 8.3-.4 5.5-.6 10.9-1.9 15.5-4.9 4.9-3.2 8.1-8.3 8.7-14 .2-2 .5-4 .5-6.1 0-.8.3-5.6.2-6.5zM61 36.6H52v-11c0-5.3-2.3-8-6.9-8-5.1 0-7.6 3.3-7.6 9.8v5.4h-8.9v-5.4c0-6.5-2.6-9.8-7.7-9.8-4.5 0-6.8 2.7-6.8 8v11H6.5v-11.7c0-5.3 1.3-9.5 4-12.6 2.8-3.1 6.4-4.7 10.9-4.7 5.2 0 9.2 2 11.8 6l2.5 4.3 2.5-4.3c2.6-4 6.6-6 11.8-6 4.5 0 8.1 1.6 10.9 4.7 2.7 3.1 4 7.3 4 12.6V36.6z"/>
      </svg>
    ),
  },
  bluesky: {
    label: 'Bluesky',
    icon: (
      <svg width="13" height="13" viewBox="0 0 568 501" fill="currentColor" aria-hidden="true">
        <path d="M123.1 33.5C188.9 82.8 259.3 182.6 284 234.1c24.7-51.5 95.1-151.3 160.9-200.6C491.4.8 568-13 568 78.2c0 18.2-10.4 153-16.5 174.9-21.2 75.9-98.5 95.4-167.1 83.7 119.9 20.4 150.6 87.9 84.6 155.4C349.5 615.9 314.6 502.9 306 470.8c-1.5-5.2-2.2-7.6-2-5.5-.2-2.1-.9.3-2 5.5-8.6 32.1-43.5 145.1-163 21.4-66-67.5-35.3-135 84.6-155.4C154.9 348.5 77.6 329 56.4 253.1 50.4 231.2 40 96.2 40 78 40-13 116.4.8 123.1 33.5z"/>
      </svg>
    ),
  },
};

function SocialCard({ entry, index, onMediaClick }: {
  entry: SocialEntry;
  index: number;
  onMediaClick: (url: string, alt: string, kind: 'image' | 'video') => void;
}) {
  const text = stripHtml(entry.content);
  if (!text) return null;

  const single = entry.media.length === 1;
  const source = SOURCE_ICONS[entry.source];

  return (
    <article className="entry entry--mastodon" style={{ animationDelay: `${index * 40}ms` }}>
      <div className="social-card-header">
        <EntryDate iso={entry.date} />
        <a
          href={entry.url}
          className="social-source-badge"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View on ${source.label}`}
        >
          {source.icon}
          <span>{source.label}</span>
        </a>
      </div>
      <SocialContent html={entry.content} />
      {entry.media.length > 0 && (
        <div className={single ? 'entry-media entry-media--single' : 'entry-media'}>
          {entry.media.map((m) => (
            <button key={m.url} className="entry-media-btn" onClick={() => onMediaClick(m.url, m.alt, m.kind)} aria-label={m.kind === 'video' ? 'Play video' : 'View full size'}>
              {m.kind === 'video' ? (
                <div className="entry-media-video-thumb">
                  {m.previewUrl && m.previewUrl !== m.url
                    ? <img src={m.previewUrl} alt={m.alt} loading="lazy" />
                    : <video src={m.url} muted playsInline preload="metadata" />
                  }
                  <span className="entry-media-play">▶</span>
                </div>
              ) : (
                <img src={single ? m.url : m.previewUrl} alt={m.alt} loading="lazy" />
              )}
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

async function fetchMastodon(): Promise<SocialEntry[]> {
  const accountRes = await fetch(
    `https://${MASTODON_INSTANCE}/api/v1/accounts/lookup?acct=${MASTODON_USERNAME}`
  );
  if (!accountRes.ok) return [];

  const account = await accountRes.json();
  const statusRes = await fetch(
    `https://${MASTODON_INSTANCE}/api/v1/accounts/${account.id}/statuses?limit=40&exclude_replies=true&exclude_reblogs=true`
  );
  if (!statusRes.ok) return [];

  const statuses = await statusRes.json();
  return statuses
    .filter((s: any) => s.content && s.content.trim() !== '<p></p>')
    .map((s: any) => ({
      type: 'social' as const,
      source: 'mastodon' as const,
      id: s.id,
      date: s.created_at,
      content: s.content,
      url: s.url,
      hashtags: (s.tags ?? []).map((t: any) => t.name.toLowerCase()),
      media: (s.media_attachments ?? [])
        .filter((m: any) => ['image', 'gifv', 'video'].includes(m.type))
        .map((m: any) => ({
          url: m.url,
          previewUrl: m.preview_url ?? m.url,
          alt: m.description ?? '',
          kind: m.type === 'image' ? 'image' : 'video',
        })),
    }));
}

async function fetchBluesky(): Promise<SocialEntry[]> {
  if (!BLUESKY_HANDLE) return [];

  const res = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${BLUESKY_HANDLE}&limit=40&filter=posts_no_replies`
  );
  if (!res.ok) return [];

  const data = await res.json();
  return (data.feed ?? [])
    .filter((item: any) => !item.reason && item.post?.record?.text?.trim())
    .map((item: any) => {
      const post = item.post;
      const rkey = post.uri.split('/').pop();
      const url = `https://bsky.app/profile/${BLUESKY_HANDLE}/post/${rkey}`;

      const media: SocialMedia[] = [];
      if (post.embed?.$type === 'app.bsky.embed.images#view') {
        for (const img of post.embed.images) {
          media.push({
            url: img.fullsize,
            previewUrl: img.thumb,
            alt: img.alt ?? '',
            kind: 'image',
          });
        }
      }

      const hashtags = (post.record.facets ?? [])
        .flatMap((f: any) =>
          (f.features ?? [])
            .filter((feat: any) => feat.$type === 'app.bsky.richtext.facet#tag')
            .map((feat: any) => feat.tag.toLowerCase())
        );

      return {
        type: 'social' as const,
        source: 'bluesky' as const,
        id: post.uri,
        date: post.record.createdAt,
        content: processBlueskyText(post.record.text, post.record.facets ?? []),
        url,
        hashtags,
        media,
      };
    });
}

function toTripJSON(trip: any): TripJSON {
  return {
    id: trip.id,
    name: trip.name,
    description: trip.description ?? '',
    startDate: trip.startDate?.toDate?.()?.toISOString() ?? '',
    endDate: trip.endDate?.toDate?.()?.toISOString() ?? '',
    published: trip.published,
  };
}

function toStopJSON(stop: any): TripStopJSON {
  return {
    id: stop.id,
    tripId: stop.tripId,
    name: stop.name,
    lat: stop.lat,
    lng: stop.lng,
    date: stop.date?.toDate?.()?.toISOString() ?? '',
    order: stop.order,
    notes: stop.notes ?? null,
  };
}

export default function LifeStream() {
  const [entries, setEntries] = useState<StreamEntry[]>([]);
  const [categoryConfig, setCategoryConfig] = useState<CategoryConfig>({ hashtags: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string; kind: 'image' | 'video' } | null>(null);
  const [activeFilter, setActiveFilter] = useState<Category | 'all'>('all');
  const [travelTrips, setTravelTrips] = useState<TripJSON[]>([]);
  const [travelStops, setTravelStops] = useState<TripStopJSON[]>([]);
  const [travelLoading, setTravelLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [postsRes, mastodonEntries, blueskyEntries, config] = await Promise.all([
          fetch('/api/posts.json'),
          fetchMastodon().catch(() => [] as SocialEntry[]),
          fetchBluesky().catch(() => [] as SocialEntry[]),
          loadCategoryConfig().catch(() => ({ hashtags: {} } as CategoryConfig)),
        ]);

        if (!postsRes.ok) throw new Error('Failed to load posts');

        const blogPosts: BlogEntry[] = await postsRes.json();

        const merged: StreamEntry[] = [...blogPosts, ...mastodonEntries, ...blueskyEntries].sort(
          (a, b) => new Date(b.date).valueOf() - new Date(a.date).valueOf()
        );

        setCategoryConfig(config);
        setEntries(merged);
      } catch (e) {
        setError('Could not load the stream.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Lazy-load travel map data when Travel filter is first activated
  useEffect(() => {
    if (activeFilter !== 'travel' || travelTrips.length > 0 || travelLoading) return;
    setTravelLoading(true);
    getPublishedTrips()
      .then(async (trips) => {
        const allStops = (await Promise.all(trips.map((t) => getTripStops(t.id)))).flat();
        setTravelTrips(trips.map(toTripJSON));
        setTravelStops(allStops.map(toStopJSON));
      })
      .catch(() => {})
      .finally(() => setTravelLoading(false));
  }, [activeFilter]);

  function matchesFilter(entry: StreamEntry): boolean {
    if (activeFilter === 'all') return true;
    if (entry.type === 'blog') {
      return (entry.categories ?? []).includes(activeFilter);
    }
    const computed = categorizeSocialPost(entry.hashtags, categoryConfig);
    return computed.includes(activeFilter);
  }

  const filtered = entries.filter(matchesFilter);

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

  return (
    <>
      {lightbox && (
        <Lightbox url={lightbox.url} alt={lightbox.alt} kind={lightbox.kind} onClose={() => setLightbox(null)} />
      )}

      <nav className="stream-filters" aria-label="Filter by category">
        <button
          className={`filter-pill${activeFilter === 'all' ? ' active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          All
        </button>
        {(categoryConfig.categories ?? DEFAULT_CATEGORIES).map((cat) => (
          <button
            key={cat.value}
            className={`filter-pill${activeFilter === cat.value ? ' active' : ''}`}
            onClick={() => setActiveFilter(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </nav>

      {activeFilter === 'travel' && (
        <div className="travel-map-slot">
          {travelLoading ? (
            <div className="travel-map-loading">Loading map…</div>
          ) : (
            <TravelMap trips={travelTrips} stops={travelStops} />
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="stream-empty">Nothing here yet.</p>
      ) : (
        <div className="stream">
          {filtered.map((entry, i) =>
            entry.type === 'blog'
              ? <BlogCard key={`blog-${entry.slug}`} entry={entry} index={i} />
              : <SocialCard key={`${entry.source}-${entry.id}`} entry={entry} index={i} onMediaClick={(url, alt, kind) => setLightbox({ url, alt, kind })} />
          )}
        </div>
      )}
    </>
  );
}
