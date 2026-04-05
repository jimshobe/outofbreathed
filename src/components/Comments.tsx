import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';

interface Comment {
  id: string;
  text: string;
  authorName: string;
  authorPhoto: string;
  authorUid: string;
  createdAt: Timestamp | null;
}

function formatCommentDate(ts: Timestamp | null): string {
  if (!ts) return '';
  return ts.toDate().toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function Comments({ postSlug }: { postSlug: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, setUser);
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'comments', postSlug, 'entries'),
      orderBy('createdAt', 'asc')
    );
    const unsubComments = onSnapshot(q, (snap) => {
      setComments(
        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Comment))
      );
    });
    return () => unsubComments();
  }, [postSlug]);

  async function handleSignIn() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !text.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'comments', postSlug, 'entries'), {
        text: text.trim(),
        authorName: user.displayName ?? 'Anonymous',
        authorPhoto: user.photoURL ?? '',
        authorUid: user.uid,
        createdAt: serverTimestamp(),
      });
      setText('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="comments">
      <h2 className="comments-heading">Comments</h2>

      {comments.length === 0 ? (
        <p className="comments-empty">No comments yet. Be the first.</p>
      ) : (
        <div className="comments-list">
          {comments.map((c) => (
            <div key={c.id} className="comment">
              {c.authorPhoto && (
                <img
                  src={c.authorPhoto}
                  alt={c.authorName}
                  className="comment-avatar"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-author">{c.authorName}</span>
                  <span className="comment-date">{formatCommentDate(c.createdAt)}</span>
                </div>
                <p className="comment-text">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {user ? (
        <form className="comment-form" onSubmit={handleSubmit}>
          <div className="comment-form-user">
            {user.photoURL && (
              <img
                src={user.photoURL}
                alt={user.displayName ?? ''}
                className="comment-avatar"
                referrerPolicy="no-referrer"
              />
            )}
            <span className="comment-form-name">{user.displayName}</span>
            <button
              type="button"
              className="comment-signout"
              onClick={() => signOut(auth)}
            >
              Sign out
            </button>
          </div>
          <textarea
            className="comment-input"
            placeholder="Leave a comment…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          <button
            type="submit"
            className="comment-submit"
            disabled={submitting || !text.trim()}
          >
            {submitting ? 'Posting…' : 'Post comment'}
          </button>
        </form>
      ) : (
        <button className="comment-signin" onClick={handleSignIn}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google to comment
        </button>
      )}
    </section>
  );
}
