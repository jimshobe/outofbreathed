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
      <EntryDate iso={entry.date} />
      <h2 className="entry-title">
        <a href={`/posts/${entry.slug}`}>{entry.title}</a>
      </h2>
      {entry.excerpt && (
        <p className="entry-excerpt">{entry.excerpt}</p>
      )}
      <a href={`/posts/${entry.slug}`} className="read-more">
        Read →
      </a>
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

function SocialCard({ entry, index, onMediaClick }: {
  entry: SocialEntry;
  index: number;
  onMediaClick: (url: string, alt: string, kind: 'image' | 'video') => void;
}) {
  const text = stripHtml(entry.content);
  if (!text) return null;

  const single = entry.media.length === 1;

  return (
    <article className="entry entry--mastodon" style={{ animationDelay: `${index * 40}ms` }}>
      <EntryDate iso={entry.date} />
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
