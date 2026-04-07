import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const ADMIN_UID = 'admin-uid';
const CONTRIBUTOR_UID = 'contributor-uid';

vi.mock('../../lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  collectionGroup: vi.fn(() => ({})),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  getDoc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => ({})),
  Timestamp: { now: vi.fn(() => ({})) },
}));

// Admin imports PostEditor, which requires TipTap — stub it out
vi.mock('../PostEditor', () => ({
  default: () => <div data-testid="post-editor" />,
}));

import Admin from '../Admin';
import { onAuthStateChanged } from 'firebase/auth';
import { getDoc } from 'firebase/firestore';

// ── Admin user ────────────────────────────────────────────────────────────────

describe('Admin — admin user', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
      cb({ uid: ADMIN_UID, displayName: 'Admin', photoURL: null, email: 'admin@example.com' });
      return vi.fn();
    });

    // getDoc not called for admin (role set directly by uid match)
  });

  it('shows Posts, Comments, and Users tabs', async () => {
    render(<Admin adminUid={ADMIN_UID} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^posts$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^comments$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^users$/i })).toBeInTheDocument();
    });
  });
});

// ── Contributor user ──────────────────────────────────────────────────────────

describe('Admin — contributor user', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
      cb({ uid: CONTRIBUTOR_UID, displayName: 'Contributor', photoURL: null, email: 'contrib@example.com' });
      return vi.fn();
    });

    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: 'contributor' }),
    } as any);
  });

  it('shows only the Posts tab', async () => {
    render(<Admin adminUid={ADMIN_UID} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^posts$/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /^comments$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^users$/i })).not.toBeInTheDocument();
  });
});

// ── Unauthorized user ─────────────────────────────────────────────────────────

describe('Admin — member user (no access)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
      cb({ uid: 'member-uid', displayName: 'Member', photoURL: null, email: 'member@example.com' });
      return vi.fn();
    });

    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: 'member' }),
    } as any);
  });

  it('shows access denied message', async () => {
    render(<Admin adminUid={ADMIN_UID} />);

    await waitFor(() => {
      expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    });
  });

  it('shows no tab navigation', async () => {
    render(<Admin adminUid={ADMIN_UID} />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^posts$/i })).not.toBeInTheDocument();
    });
  });
});
