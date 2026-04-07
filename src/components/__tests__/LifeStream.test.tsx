import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.stubEnv('PUBLIC_ADMIN_UID', 'admin-uid');

const BLOG_POST_OLD: any = {
  type: 'blog',
  title: 'Old Post',
  date: '2024-01-01T00:00:00Z',
  slug: 'old-post',
  excerpt: null,
  mastodon_tag: null,
};

const BLOG_POST_NEW: any = {
  type: 'blog',
  title: 'New Post',
  date: '2024-06-01T00:00:00Z',
  slug: 'new-post',
  excerpt: null,
  mastodon_tag: null,
};

const MASTODON_MIDDLE: any = {
  id: 'status-1',
  created_at: '2024-03-15T00:00:00Z',
  content: '<p>Middle Mastodon post</p>',
  url: 'https://aus.social/@thejamsho/status-1',
  media_attachments: [],
};

function makeFetchMock(statuses: any[] = [MASTODON_MIDDLE]) {
  return vi.fn((url: string) => {
    if (url === '/api/posts.json') {
      return Promise.resolve({
        ok: true,
        json: async () => [BLOG_POST_NEW, BLOG_POST_OLD],
      });
    }
    if (url.includes('accounts/lookup')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: '12345' }),
      });
    }
    if (url.includes('/statuses')) {
      return Promise.resolve({
        ok: true,
        json: async () => statuses,
      });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
  });
}

import LifeStream from '../LifeStream';

// ── Merge and sort ────────────────────────────────────────────────────────────

describe('LifeStream — merged feed sorted newest first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = makeFetchMock() as any;
  });

  it('renders all three entries', async () => {
    render(<LifeStream />);

    await waitFor(() => {
      expect(screen.getByText('New Post')).toBeInTheDocument();
      expect(screen.getByText('Old Post')).toBeInTheDocument();
      expect(screen.getByText(/Middle Mastodon post/i)).toBeInTheDocument();
    });
  });

  it('shows newest entry first and oldest last', async () => {
    render(<LifeStream />);

    await waitFor(() => {
      expect(screen.getByText('New Post')).toBeInTheDocument();
    });

    const titles = screen
      .getAllByRole('article')
      .map((el) => el.textContent ?? '');

    const newIdx = titles.findIndex((t) => t.includes('New Post'));
    const midIdx = titles.findIndex((t) => t.includes('Middle Mastodon post'));
    const oldIdx = titles.findIndex((t) => t.includes('Old Post'));

    expect(newIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(oldIdx);
  });
});

// ── Media type mapping ────────────────────────────────────────────────────────

describe('LifeStream — media type mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps gifv attachment to kind=video (shows Play video button)', async () => {
    const gifvStatus = {
      id: 'status-gifv',
      created_at: '2024-04-01T00:00:00Z',
      content: '<p>A gifv post</p>',
      url: 'https://aus.social/@thejamsho/gifv',
      media_attachments: [
        { type: 'gifv', url: 'https://cdn.aus.social/video.mp4', preview_url: 'https://cdn.aus.social/thumb.jpg', description: 'A looping video' },
      ],
    };
    global.fetch = makeFetchMock([gifvStatus]) as any;

    render(<LifeStream />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /play video/i })).toBeInTheDocument();
    });
  });

  it('maps video attachment to kind=video (shows Play video button)', async () => {
    const videoStatus = {
      id: 'status-video',
      created_at: '2024-04-01T00:00:00Z',
      content: '<p>A video post</p>',
      url: 'https://aus.social/@thejamsho/video',
      media_attachments: [
        { type: 'video', url: 'https://cdn.aus.social/video.mp4', preview_url: 'https://cdn.aus.social/thumb.jpg', description: 'A video' },
      ],
    };
    global.fetch = makeFetchMock([videoStatus]) as any;

    render(<LifeStream />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /play video/i })).toBeInTheDocument();
    });
  });

  it('maps image attachment to kind=image (shows View full size button)', async () => {
    const imageStatus = {
      id: 'status-img',
      created_at: '2024-04-01T00:00:00Z',
      content: '<p>An image post</p>',
      url: 'https://aus.social/@thejamsho/img',
      media_attachments: [
        { type: 'image', url: 'https://cdn.aus.social/photo.jpg', preview_url: 'https://cdn.aus.social/thumb.jpg', description: 'A photo' },
      ],
    };
    global.fetch = makeFetchMock([imageStatus]) as any;

    render(<LifeStream />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /view full size/i })).toBeInTheDocument();
    });
  });
});

// ── Empty content filtering ───────────────────────────────────────────────────

describe('LifeStream — empty content filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render a status with empty <p></p> content', async () => {
    const emptyStatus = {
      id: 'status-empty',
      created_at: '2024-04-01T00:00:00Z',
      content: '<p></p>',
      url: 'https://aus.social/@thejamsho/empty',
      media_attachments: [],
    };
    global.fetch = makeFetchMock([emptyStatus]) as any;

    render(<LifeStream />);

    // Only blog posts should be visible
    await waitFor(() => {
      expect(screen.getByText('New Post')).toBeInTheDocument();
    });

    // Empty status should not produce an article
    const articles = screen.getAllByRole('article');
    // 2 blog posts only — the empty mastodon status is filtered out
    expect(articles).toHaveLength(2);
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe('LifeStream — error state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any;
  });

  it('shows error message when fetch fails', async () => {
    render(<LifeStream />);

    await waitFor(() => {
      expect(screen.getByText(/could not load the stream/i)).toBeInTheDocument();
    });
  });
});
