import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Sentinel refs so the onSnapshot mock knows which subscription is which
const COMMENTS_REF = { __type: 'commentsQuery' };
const USER_REF = { __type: 'userDoc' };

vi.mock('../../lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, cb) => {
    // Signed-in non-admin user
    cb({ uid: 'user-123', displayName: 'Test User', photoURL: null, email: 'test@example.com' });
    return vi.fn(); // unsubscribe
  }),
  signInWithPopup: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => COMMENTS_REF),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  doc: vi.fn(() => USER_REF),
  onSnapshot: vi.fn((ref, cb) => {
    if (ref === COMMENTS_REF) {
      // Empty comments list
      cb({ docs: [] });
    } else {
      // User doc with pending role
      cb({ exists: () => true, data: () => ({ role: 'pending' }) });
    }
    return vi.fn(); // unsubscribe
  }),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ seconds: 0 })),
}));

// Set ADMIN_UID to something different from the test user
vi.stubEnv('PUBLIC_ADMIN_UID', 'admin-uid');

import Comments from '../Comments';

describe('Comments — pending user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows styled pending message for a non-admin user with pending role', async () => {
    render(<Comments postSlug="test-post" />);

    await waitFor(() => {
      const msg = screen.getByText(/pending review/i);
      expect(msg).toBeInTheDocument();
      expect(msg).toHaveClass('comment-status-msg');
    });
  });

  it('does not show the comment form for a pending user', async () => {
    render(<Comments postSlug="test-post" />);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/leave a comment/i)).not.toBeInTheDocument();
    });
  });

  it('does not show the sign-in button when user is already signed in', async () => {
    render(<Comments postSlug="test-post" />);

    await waitFor(() => {
      expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument();
    });
  });
});
