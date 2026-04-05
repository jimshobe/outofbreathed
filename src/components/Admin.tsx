import { useState, useEffect } from 'react';
import {
  collection, doc, getDocs, setDoc, deleteDoc, updateDoc,
  query, orderBy, collectionGroup, Timestamp,
} from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import PostEditor from './PostEditor';

type Tab = 'posts' | 'comments' | 'users';

interface Post {
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  mastodon_tag: string;
  published: boolean;
  createdAt: Timestamp | null;
}

interface Comment {
  id: string;
  postSlug: string;
  text: string;
  authorName: string;
  createdAt: Timestamp | null;
}

interface AppUser {
  uid: string;
  name: string;
  email: string;
  photo: string;
  status: 'pending' | 'approved' | 'banned';
}

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatTs(ts: Timestamp | null) {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Posts List ──────────────────────────────────────────────────────────────

function PostsList({ onEdit }: { onEdit: (post: Post | 'new') => void }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'))).then((snap) => {
      setPosts(snap.docs.map((d) => ({ slug: d.id, ...d.data() } as Post)));
      setLoading(false);
    });
  }, []);

  async function handleDelete(slug: string) {
    if (!confirm(`Delete "${slug}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, 'posts', slug));
    setPosts((p) => p.filter((post) => post.slug !== slug));
  }

  return (
    <div>
      <div className="admin-section-header">
        <h2 className="admin-section-title">Posts</h2>
        <button className="btn-primary" onClick={() => onEdit('new')}>New post</button>
      </div>
      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="admin-muted">No posts yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.slug}>
                <td>{p.title}</td>
                <td><span className={`status-badge ${p.published ? 'published' : 'draft'}`}>{p.published ? 'Published' : 'Draft'}</span></td>
                <td>{formatTs(p.createdAt)}</td>
                <td className="admin-actions">
                  <button className="btn-sm" onClick={() => onEdit(p)}>Edit</button>
                  <button className="btn-sm btn-danger" onClick={() => handleDelete(p.slug)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Post Form ────────────────────────────────────────────────────────────────

function PostForm({ post, onDone }: { post: Post | 'new'; onDone: () => void }) {
  const isNew = post === 'new';
  const [title, setTitle] = useState(isNew ? '' : post.title);
  const [slug, setSlug] = useState(isNew ? '' : post.slug);
  const [slugEdited, setSlugEdited] = useState(false);
  const [content, setContent] = useState(isNew ? '' : post.content);
  const [excerpt, setExcerpt] = useState(isNew ? '' : post.excerpt ?? '');
  const [mastodonTag, setMastodonTag] = useState(isNew ? '' : post.mastodon_tag ?? '');
  const [saving, setSaving] = useState(false);

  function handleTitleChange(v: string) {
    setTitle(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  async function save(published: boolean) {
    if (!title.trim() || !slug.trim()) return;
    setSaving(true);
    try {
      const data: Record<string, any> = {
        title: title.trim(),
        content,
        excerpt: excerpt.trim() || null,
        mastodon_tag: mastodonTag.trim() || null,
        published,
        updatedAt: Timestamp.now(),
      };
      if (isNew) data.createdAt = Timestamp.now();
      await setDoc(doc(db, 'posts', slug.trim()), data, { merge: true });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="admin-section-header">
        <h2 className="admin-section-title">{isNew ? 'New post' : 'Edit post'}</h2>
        <button className="btn-sm" onClick={onDone}>← Back</button>
      </div>

      <div className="form-field">
        <label className="form-label">Title</label>
        <input className="form-input" value={title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="Post title" />
      </div>

      <div className="form-field">
        <label className="form-label">Slug (URL)</label>
        <input className="form-input form-input--mono" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} placeholder="my-post-slug" disabled={!isNew} />
        {!isNew && <p className="form-hint">Slug cannot be changed after creation.</p>}
      </div>

      <div className="form-field">
        <label className="form-label">Content</label>
        <PostEditor content={content} onChange={setContent} postSlug={slug} />
      </div>

      <div className="form-field">
        <label className="form-label">Excerpt <span className="form-optional">(optional)</span></label>
        <textarea className="form-input" rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Short summary shown in the stream" />
      </div>

      <div className="form-field">
        <label className="form-label">Mastodon tag <span className="form-optional">(optional)</span></label>
        <input className="form-input" value={mastodonTag} onChange={(e) => setMastodonTag(e.target.value)} placeholder="e.g. AustraliaMove2026" />
      </div>

      <div className="form-actions">
        <button className="btn-primary" onClick={() => save(true)} disabled={saving || !title.trim()}>
          {saving ? 'Saving…' : 'Publish'}
        </button>
        <button className="btn-secondary" onClick={() => save(false)} disabled={saving || !title.trim()}>
          {saving ? 'Saving…' : 'Save draft'}
        </button>
      </div>
    </div>
  );
}

// ── Comments Tab ─────────────────────────────────────────────────────────────

function CommentsList() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collectionGroup(db, 'entries'), orderBy('createdAt', 'desc'))).then((snap) => {
      setComments(
        snap.docs.map((d) => ({
          id: d.id,
          postSlug: d.ref.parent.parent?.id ?? '',
          ...d.data(),
        } as Comment))
      );
      setLoading(false);
    });
  }, []);

  async function handleDelete(comment: Comment) {
    await deleteDoc(doc(db, 'comments', comment.postSlug, 'entries', comment.id));
    setComments((c) => c.filter((x) => x.id !== comment.id));
  }

  return (
    <div>
      <h2 className="admin-section-title">Comments</h2>
      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="admin-muted">No comments yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr><th>Author</th><th>Post</th><th>Comment</th><th>Date</th><th></th></tr>
          </thead>
          <tbody>
            {comments.map((c) => (
              <tr key={c.id}>
                <td>{c.authorName}</td>
                <td><a href={`/posts/${c.postSlug}`} className="admin-link">{c.postSlug}</a></td>
                <td className="comment-preview">{c.text.slice(0, 80)}{c.text.length > 80 ? '…' : ''}</td>
                <td>{formatTs(c.createdAt)}</td>
                <td><button className="btn-sm btn-danger" onClick={() => handleDelete(c)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersList() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(db, 'users'), orderBy('firstSeen', 'desc'))).then((snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));
      setLoading(false);
    });
  }, []);

  async function setStatus(uid: string, status: 'approved' | 'banned') {
    await updateDoc(doc(db, 'users', uid), { status });
    setUsers((u) => u.map((x) => (x.uid === uid ? { ...x, status } : x)));
  }

  const pending = users.filter((u) => u.status === 'pending');
  const rest = users.filter((u) => u.status !== 'pending');

  return (
    <div>
      <h2 className="admin-section-title">Users</h2>
      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="admin-muted">No users yet. They appear here when someone tries to comment.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {[...pending, ...rest].map((u) => (
              <tr key={u.uid}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td><span className={`status-badge ${u.status}`}>{u.status}</span></td>
                <td className="admin-actions">
                  {u.status !== 'approved' && (
                    <button className="btn-sm btn-approve" onClick={() => setStatus(u.uid, 'approved')}>Approve</button>
                  )}
                  {u.status !== 'banned' && (
                    <button className="btn-sm btn-danger" onClick={() => setStatus(u.uid, 'banned')}>Ban</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main Admin Component ──────────────────────────────────────────────────────

export default function Admin({ adminUid }: { adminUid: string }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('posts');
  const [editingPost, setEditingPost] = useState<Post | 'new' | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <p className="admin-muted">Loading…</p>;

  if (!user) {
    return (
      <div className="admin-signin">
        <p className="admin-muted">Sign in to access the admin panel.</p>
        <button className="btn-primary" onClick={() => signInWithPopup(auth, googleProvider)}>
          Sign in with Google
        </button>
      </div>
    );
  }

  if (user.uid !== adminUid) {
    return (
      <div className="admin-signin">
        <p className="admin-muted">You don't have access to this page.</p>
        <button className="btn-sm" onClick={() => signOut(auth)}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      <div className="admin-header">
        <nav className="admin-tabs">
          {(['posts', 'comments', 'users'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`admin-tab${tab === t && !editingPost ? ' active' : ''}`}
              onClick={() => { setTab(t); setEditingPost(null); }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <button className="btn-sm admin-signout" onClick={() => signOut(auth)}>Sign out</button>
      </div>

      <div className="admin-body">
        {editingPost !== null ? (
          <PostForm post={editingPost} onDone={() => setEditingPost(null)} />
        ) : tab === 'posts' ? (
          <PostsList onEdit={setEditingPost} />
        ) : tab === 'comments' ? (
          <CommentsList />
        ) : (
          <UsersList />
        )}
      </div>
    </div>
  );
}
