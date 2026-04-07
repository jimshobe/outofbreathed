import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Sentinel refs to differentiate invite vs user doc lookups
const USER_REF = { __type: 'userRef' };
const INVITE_REF = { __type: 'inviteRef' };

const { setDocSpy, deleteDocSpy } = vi.hoisted(() => ({
  setDocSpy: vi.fn(() => Promise.resolve()),
  deleteDocSpy: vi.fn(() => Promise.resolve()),
}));

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
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: setDocSpy,
  deleteDoc: deleteDocSpy,
  onSnapshot: vi.fn(() => vi.fn()),
  collection: vi.fn(() => ({})),
  query: vi.fn((ref) => ref),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => ({})),
}));

vi.stubEnv('PUBLIC_ADMIN_UID', 'admin-uid');

import AccountMenu from '../AccountMenu';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// ── Invite redemption ─────────────────────────────────────────────────────────

describe('AccountMenu — invite redemption', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // User with mixed-case email signs in
    vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
      cb({ uid: 'user-123', displayName: 'New User', photoURL: null, email: 'Friend@Example.com' });
      return vi.fn();
    });

    // doc() returns INVITE_REF for 'invites' collection, USER_REF for 'users'
    vi.mocked(doc).mockImplementation((_db: any, collection: string) => {
      return collection === 'invites' ? INVITE_REF : USER_REF;
    });

    // Invite exists with role 'member'
    vi.mocked(getDoc).mockImplementation((ref: any) => {
      if (ref === INVITE_REF) {
        return Promise.resolve({ exists: () => true, data: () => ({ role: 'member' }) });
      }
      return Promise.resolve({ exists: () => false });
    });
  });

  it('looks up invite using the lowercased email', async () => {
    render(<AccountMenu />);

    await waitFor(() => expect(setDocSpy).toHaveBeenCalled());

    // doc() was called with 'invites' and the lowercased email
    const docCalls = vi.mocked(doc).mock.calls;
    const inviteCall = docCalls.find((args) => args[1] === 'invites');
    expect(inviteCall).toBeDefined();
    expect(inviteCall![2]).toBe('friend@example.com');
  });

  it('sets the user doc with the invited role (not pending)', async () => {
    render(<AccountMenu />);

    await waitFor(() => expect(setDocSpy).toHaveBeenCalled());

    expect(setDocSpy).toHaveBeenCalledWith(
      USER_REF,
      expect.objectContaining({ role: 'member' }),
      { merge: true }
    );
  });

  it('deletes the invite doc after redemption', async () => {
    render(<AccountMenu />);

    await waitFor(() => expect(deleteDocSpy).toHaveBeenCalled());

    expect(deleteDocSpy).toHaveBeenCalledWith(INVITE_REF);
  });
});

// ── New user (no invite) ──────────────────────────────────────────────────────

describe('AccountMenu — new user with no invite', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
      cb({ uid: 'new-user-uid', displayName: 'New User', photoURL: null, email: 'new@example.com' });
      return vi.fn();
    });

    vi.mocked(doc).mockImplementation((_db: any, collection: string) => {
      return collection === 'invites' ? INVITE_REF : USER_REF;
    });

    // No invite, no existing user doc
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);
  });

  it('creates user doc with pending role', async () => {
    render(<AccountMenu />);

    await waitFor(() => expect(setDocSpy).toHaveBeenCalled());

    expect(setDocSpy).toHaveBeenCalledWith(
      USER_REF,
      expect.objectContaining({ role: 'pending' })
    );
  });

  it('does not delete any invite doc', async () => {
    render(<AccountMenu />);

    await waitFor(() => expect(setDocSpy).toHaveBeenCalled());

    expect(deleteDocSpy).not.toHaveBeenCalled();
  });
});

// ── Returning user ────────────────────────────────────────────────────────────

describe('AccountMenu — returning user', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
      cb({ uid: 'existing-user', displayName: 'Existing User', photoURL: null, email: 'existing@example.com' });
      return vi.fn();
    });

    vi.mocked(doc).mockImplementation((_db: any, collection: string) => {
      return collection === 'invites' ? INVITE_REF : USER_REF;
    });

    // No invite, but user doc exists with 'contributor' role
    vi.mocked(getDoc).mockImplementation((ref: any) => {
      if (ref === USER_REF) {
        return Promise.resolve({ exists: () => true, data: () => ({ role: 'contributor' }) });
      }
      return Promise.resolve({ exists: () => false });
    });
  });

  it('does not create a new user doc for a returning user', async () => {
    render(<AccountMenu />);

    // Give time for effects to run
    await waitFor(() => expect(getDoc).toHaveBeenCalled());
    // setDoc should NOT be called — user already exists, no invite
    expect(setDocSpy).not.toHaveBeenCalled();
  });
});
