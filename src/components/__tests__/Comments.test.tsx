import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Sentinel refs so the onSnapshot mock knows which subscription is which
const COMMENTS_REF = { __type: 'commentsQuery' };
const USER_REF = { __type: 'userDoc' };

vi.mock('../../lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => COMMENTS_REF),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  doc: vi.fn(() => USER_REF),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-comment-id' })),
  deleteDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => ({ seconds: 0 })),
}));

vi.stubEnv('PUBLIC_ADMIN_UID', 'admin-uid');

import Comments from '../Comments';
import { onAuthStateChanged } from 'firebase/auth';
import { onSnapshot, addDoc } from 'firebase/firestore';

function setupSignedIn(role: string, uid = 'user-123') {
  vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
    cb({ uid, displayName: 'Test User', photoURL: null, email: 'test@example.com' });
    return vi.fn();
  });
  vi.mocked(onSnapshot).mockImplementation((ref: any, cb: any) => {
    if (ref === COMMENTS_REF) cb({ docs: [] });
    else cb({ exists: () => true, data: () => ({ role }) });
    return vi.fn();
  });
}

function setupSignedOut() {
  vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
    cb(null);
    return vi.fn();
  });
  vi.mocked(onSnapshot).mockImplementation((ref: any, cb: any) => {
    if (ref === COMMENTS_REF) cb({ docs: [] });
    return vi.fn();
  });
}

// ── Pending user ──────────────────────────────────────────────────────────────

describe('Comments — pending user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSignedIn('pending');
  });

  it('shows styled pending message', async () => {
    render(<Comments postSlug="test-post" />);
    await waitFor(() => {
      const msg = screen.getByText(/pending review/i);
      expect(msg).toBeInTheDocument();
      expect(msg).toHaveClass('comment-status-msg');
    });
  });

  it('does not show the comment form', async () => {
    render(<Comments postSlug="test-post" />);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/leave a comment/i)).not.toBeInTheDocument();
    });
  });

  it('does not show the sign-in button when already signed in', async () => {
    render(<Comments postSlug="test-post" />);
    await waitFor(() => {
      expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument();
    });
  });
});

// ── Banned user ───────────────────────────────────────────────────────────────

describe('Comments — banned user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSignedIn('banned');
  });

  it('shows "not permitted" message', async () => {
    render(<Comments postSlug="test-post" />);
    await waitFor(() => {
      const msg = screen.getByText(/not permitted to comment/i);
      expect(msg).toBeInTheDocument();
      expect(msg).toHaveClass('comment-status-msg');
    });
  });

  it('does not show the comment textarea', async () => {
    render(<Comments postSlug="test-post" />);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/leave a comment/i)).not.toBeInTheDocument();
    });
  });
});

// ── Member user ───────────────────────────────────────────────────────────────

describe('Comments — member user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSignedIn('member');
  });

  it('shows the comment form', async () => {
    render(<Comments postSlug="test-post" />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/leave a comment/i)).toBeInTheDocument();
    });
  });

  it('calls addDoc with correct fields on submit', async () => {
    const user = userEvent.setup();
    render(<Comments postSlug="test-post" />);

    const textarea = await screen.findByPlaceholderText(/leave a comment/i);
    await user.type(textarea, 'Hello world');
    await user.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledWith(
        COMMENTS_REF,
        expect.objectContaining({
          text: 'Hello world',
          authorName: 'Test User',
          authorUid: 'user-123',
        })
      );
    });
  });

  it('clears the textarea after a successful submit', async () => {
    const user = userEvent.setup();
    render(<Comments postSlug="test-post" />);

    const textarea = await screen.findByPlaceholderText(/leave a comment/i);
    await user.type(textarea, 'Hello world');
    await user.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });
});

// ── Unauthenticated ───────────────────────────────────────────────────────────

describe('Comments — unauthenticated user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSignedOut();
  });

  it('shows the Google sign-in button', async () => {
    render(<Comments postSlug="test-post" />);
    await waitFor(() => {
      expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
    });
  });

  it('does not show the comment form', async () => {
    render(<Comments postSlug="test-post" />);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/leave a comment/i)).not.toBeInTheDocument();
    });
  });
});
