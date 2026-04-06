import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// vi.hoisted ensures these are available inside vi.mock factory functions
const { setDocSpy, ADMIN_UID } = vi.hoisted(() => ({
  setDocSpy: vi.fn(() => Promise.resolve()),
  ADMIN_UID: 'admin-uid',
}));

vi.stubEnv('PUBLIC_ADMIN_UID', ADMIN_UID);

vi.mock('../../lib/firebase', () => ({
  auth: { currentUser: { uid: ADMIN_UID } },
  googleProvider: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth, cb) => {
    cb({ uid: ADMIN_UID, displayName: 'Admin', photoURL: null, email: 'admin@example.com' });
    return vi.fn();
  }),
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
  getDoc: vi.fn(() =>
    Promise.resolve({ exists: () => true, data: () => ({ role: 'admin' }) })
  ),
  setDoc: setDocSpy,
  deleteDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => ({})),
  Timestamp: { now: vi.fn(() => ({})) },
}));

// Mock fetch to simulate Resend failure (bad API key)
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: false,
    status: 500,
    json: async () => ({ error: 'Email service not configured' }),
  } as Response)
);

import Admin from '../Admin';

describe('Admin invite — API failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDocSpy.mockResolvedValue(undefined);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Email service not configured' }),
    });
  });

  it('shows error message when invite email fails', async () => {
    const user = userEvent.setup();
    render(<Admin adminUid={ADMIN_UID} />);

    // Navigate to Users tab
    const usersTab = await screen.findByRole('button', { name: /users/i });
    await user.click(usersTab);

    // Fill in email
    const emailInput = await screen.findByPlaceholderText(/email@example.com/i);
    await user.type(emailInput, 'friend@example.com');

    // Click Send invite
    const sendBtn = screen.getByRole('button', { name: /send invite/i });
    await user.click(sendBtn);

    // Error should appear
    await waitFor(() => {
      expect(screen.getByText(/email service not configured/i)).toBeInTheDocument();
    });
  });

  it('does not write to Firestore when the invite email fails', async () => {
    const user = userEvent.setup();
    render(<Admin adminUid={ADMIN_UID} />);

    const usersTab = await screen.findByRole('button', { name: /users/i });
    await user.click(usersTab);

    const emailInput = await screen.findByPlaceholderText(/email@example.com/i);
    await user.type(emailInput, 'friend@example.com');

    const sendBtn = screen.getByRole('button', { name: /send invite/i });
    await user.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/email service not configured/i)).toBeInTheDocument();
    });

    expect(setDocSpy).not.toHaveBeenCalled();
  });
});
