import { useState, useEffect, useRef } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import {
  doc, getDoc, setDoc, deleteDoc, onSnapshot,
  collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';

const ADMIN_UID = import.meta.env.PUBLIC_ADMIN_UID;

type Role = 'pending' | 'member' | 'contributor' | 'admin' | 'banned' | null;

const roleLabel: Record<NonNullable<Role>, string> = {
  admin: 'Admin',
  contributor: 'Contributor',
  member: 'Member',
  pending: 'Access pending review',
  banned: 'Access denied',
};

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function AccountMenu() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [role, setRole] = useState<Role>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isAdmin = user?.uid === ADMIN_UID;

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  // On sign-in: check for invite, then create/load user doc
  useEffect(() => {
    if (!user) { setRole(null); return; }
    if (user.uid === ADMIN_UID) { setRole('admin'); return; }

    const userRef = doc(db, 'users', user.uid);

    async function handleSignIn() {
      // Check for invite by email
      if (user.email) {
        const inviteRef = doc(db, 'invites', user.email.toLowerCase());
        const inviteSnap = await getDoc(inviteRef);
        if (inviteSnap.exists()) {
          const invitedRole = inviteSnap.data().role as Role;
          await setDoc(userRef, {
            name: user.displayName ?? 'Anonymous',
            photo: user.photoURL ?? '',
            email: user.email,
            role: invitedRole,
            firstSeen: serverTimestamp(),
          }, { merge: true });
          await deleteDoc(inviteRef);
          setRole(invitedRole);
          return;
        }
      }

      // No invite — create or load user doc
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          name: user.displayName ?? 'Anonymous',
          photo: user.photoURL ?? '',
          email: user.email ?? '',
          role: 'pending',
          firstSeen: serverTimestamp(),
        });
        setRole('pending');
      } else {
        setRole(snap.data().role as Role);
      }
    }

    handleSignIn();
  }, [user]);

  // Live pending count for admin
  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'pending')),
      (snap) => setPendingCount(snap.size)
    );
  }, [isAdmin]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="account-wrap">
      <button
        className="account-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        aria-expanded={open}
      >
        {user?.photoURL ? (
          <img src={user.photoURL} alt="" className="account-trigger-avatar" referrerPolicy="no-referrer" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        )}
        {isAdmin && pendingCount > 0 && (
          <span className="account-badge" aria-label={`${pendingCount} pending`}>{pendingCount}</span>
        )}
      </button>

      {open && (
        <div className="account-dropdown">
          {user === undefined ? (
            <p className="account-loading">Loading…</p>
          ) : !user ? (
            <div className="account-signin-prompt">
              <p className="account-hint">Sign in to leave comments.</p>
              <button
                className="account-google-btn"
                onClick={() => signInWithPopup(auth, googleProvider).then(() => setOpen(false)).catch(() => {})}
              >
                <GoogleIcon />
                Sign in with Google
              </button>
            </div>
          ) : (
            <div className="account-user">
              <div className="account-user-info">
                {user.photoURL && (
                  <img src={user.photoURL} alt="" className="account-user-avatar" referrerPolicy="no-referrer" />
                )}
                <div>
                  <div className="account-user-name">{user.displayName}</div>
                  {role && <div className="account-user-status">{roleLabel[role]}</div>}
                </div>
              </div>

              {(isAdmin || role === 'contributor') && (
                <a
                  href="/admin"
                  className="account-admin-link"
                  onClick={() => setOpen(false)}
                >
                  {isAdmin ? 'Admin panel' : 'My posts'}
                  {isAdmin && pendingCount > 0 && (
                    <span className="account-admin-badge">{pendingCount} pending</span>
                  )}
                </a>
              )}

              <button className="account-signout" onClick={() => { signOut(auth); setOpen(false); }}>
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
