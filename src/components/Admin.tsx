import { useState, useEffect } from 'react';
import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc,
  query, orderBy, collectionGroup, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import PostEditor from './PostEditor';
import TripAdmin from './travel/admin/TripAdmin';
import RouteAdmin from './travel/admin/RouteAdmin';
import CategoryConfig from './travel/admin/CategoryConfig';
import { loadCategoryConfig } from '../lib/travel/categories';
import { getRoutes } from '../lib/travel/trips';
import { DEFAULT_CATEGORIES } from '../types/categories';
import type { Category, CategoryDef } from '../types/categories';

const ADMIN_UID = import.meta.env.PUBLIC_ADMIN_UID;

type Role = 'pending' | 'member' | 'contributor' | 'admin' | 'banned';
type Tab = 'posts' | 'comments' | 'users' | 'trips' | 'routes' | 'categories';

interface Post {
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  mastodon_tag: string;
  published: boolean;
  authorUid: string;
  authorName: string;
  createdAt: Timestamp | null;
  categories: Category[];
  tripId: string | null;
  stopId: string | null;
  locationId: string | null;
  routeId: string | null;
}

interface Comment {
  id: string;
  postSlug: string;
  text: string;
  authorName: string;
  authorUid: string;
  createdAt: Timestamp | null;
}

interface AppUser {
  uid: string;
  name: string;
  email: string;
  photo: string;
  role: Role;
}

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatTs(ts: Timestamp | null) {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Posts List ──────────────────────────────────────────────────────────────

function PostsList({
  onEdit,
  currentUser,
  isAdmin,
}: {
  onEdit: (post: Post | 'new') => void;
  currentUser: User;
  isAdmin: boolean;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'))).then((snap) => {
      let all = snap.docs.map((d) => ({ slug: d.id, ...d.data() } as Post));
      if (!isAdmin) all = all.filter((p) => p.authorUid === currentUser.uid);
      setPosts(all);
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
              {isAdmin && <th>Author</th>}
              <th>Status</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => {
              const canEdit = isAdmin || p.authorUid === currentUser.uid;
              return (
                <tr key={p.slug}>
                  <td>{p.title}</td>
                  {isAdmin && <td className="admin-muted">{p.authorName || '—'}</td>}
                  <td><span className={`status-badge ${p.published ? 'published' : 'draft'}`}>{p.published ? 'Published' : 'Draft'}</span></td>
                  <td>{formatTs(p.createdAt)}</td>
                  <td className="admin-actions">
                    {canEdit && <button className="btn-sm" onClick={() => onEdit(p)}>Edit</button>}
                    {canEdit && <button className="btn-sm btn-danger" onClick={() => handleDelete(p.slug)}>Delete</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Post Form ────────────────────────────────────────────────────────────────

function PostForm({
  post,
  onDone,
  currentUser,
  availableCategories,
}: {
  post: Post | 'new';
  onDone: () => void;
  currentUser: User;
  availableCategories: CategoryDef[];
}) {
  const isNew = post === 'new';
  const [title, setTitle] = useState(isNew ? '' : post.title);
  const [slug, setSlug] = useState(isNew ? '' : post.slug);
  const [slugEdited, setSlugEdited] = useState(false);
  const [content, setContent] = useState(isNew ? '' : post.content);
  const [excerpt, setExcerpt] = useState(isNew ? '' : post.excerpt ?? '');
  const [mastodonTag, setMastodonTag] = useState(isNew ? '' : post.mastodon_tag ?? '');
  const [categories, setCategories] = useState<Category[]>(isNew ? [] : (post.categories ?? []));
  const [routeId, setRouteId] = useState<string | null>(isNew ? null : (post as Post).routeId ?? null);
  const [availableRoutes, setAvailableRoutes] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRoutes().then((rs) => setAvailableRoutes(rs.map((r) => ({ id: r.id, name: r.name })))).catch(() => {});
  }, []);

  function toggleCategory(cat: Category) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

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
        categories,
        routeId: routeId || null,
        published,
        authorUid: isNew ? currentUser.uid : (post as Post).authorUid || currentUser.uid,
        authorName: isNew ? (currentUser.displayName ?? '') : (post as Post).authorName || (currentUser.displayName ?? ''),
        updatedAt: serverTimestamp(),
      };
      if (isNew) data.createdAt = serverTimestamp();
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
        <p className="form-hint">Images must be 5 MB or smaller.</p>
      </div>

      <div className="form-field">
        <label className="form-label">Excerpt <span className="form-optional">(optional)</span></label>
        <textarea className="form-input" rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Short summary shown in the stream" />
      </div>

      <div className="form-field">
        <label className="form-label">Mastodon tag <span className="form-optional">(optional)</span></label>
        <input className="form-input" value={mastodonTag} onChange={(e) => setMastodonTag(e.target.value)} placeholder="e.g. AustraliaMove2026" />
      </div>

      <div className="form-field">
        <label className="form-label">Categories <span className="form-optional">(optional)</span></label>
        <div className="category-checkboxes">
          {availableCategories.map((cat) => (
            <label key={cat.value} className="category-checkbox-label">
              <input
                type="checkbox"
                checked={categories.includes(cat.value)}
                onChange={() => toggleCategory(cat.value)}
              />
              {cat.label}
            </label>
          ))}
        </div>
      </div>

      {availableRoutes.length > 0 && (
        <div className="form-field">
          <label className="form-label">Route <span className="form-optional">(optional)</span></label>
          <select
            className="form-input"
            value={routeId ?? ''}
            onChange={(e) => setRouteId(e.target.value || null)}
          >
            <option value="">— none —</option>
            {availableRoutes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

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
      <h2 className="admin-section-title" style={{ marginBottom: '1.5rem' }}>Comments</h2>
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

const ROLE_OPTIONS: Role[] = ['member', 'contributor', 'banned'];
const roleBadgeClass: Record<Role, string> = {
  admin: 'admin',
  contributor: 'contributor',
  member: 'approved',
  pending: 'pending',
  banned: 'banned',
};

function UsersList() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'contributor'>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'users'), orderBy('firstSeen', 'desc'))).then((snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AppUser)));
      setLoading(false);
    });
  }, []);

  async function setRole(uid: string, role: Role) {
    await updateDoc(doc(db, 'users', uid), { role });
    setUsers((u) => u.map((x) => (x.uid === uid ? { ...x, role } : x)));
  }

  async function sendInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true);
    setInviteError(null);
    try {
      const currentUser = auth.currentUser;

      // Send invite email first — only save to Firestore if it succeeds
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: inviteRole, callerUid: currentUser?.uid }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to send invite');
      }

      await setDoc(doc(db, 'invites', email), {
        email,
        role: inviteRole,
        createdAt: serverTimestamp(),
      });
      setInviteEmail('');
      setInviteSent(true);
      setTimeout(() => setInviteSent(false), 3000);
    } catch (e: any) {
      setInviteError(e.message ?? 'Something went wrong');
    } finally {
      setInviting(false);
    }
  }

  const pending = users.filter((u) => u.role === 'pending');
  const rest = users.filter((u) => u.role !== 'pending');

  return (
    <div>
      {/* Invite section */}
      <div className="admin-section-header">
        <h2 className="admin-section-title">Invite someone</h2>
      </div>
      <div className="invite-form">
        <input
          className="form-input invite-email"
          type="email"
          placeholder="email@example.com"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
        />
        <select
          className="form-input invite-role"
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value as 'member' | 'contributor')}
        >
          <option value="member">Member</option>
          <option value="contributor">Contributor</option>
        </select>
        <button className="btn-primary" onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}>
          {inviting ? 'Sending…' : inviteSent ? 'Sent ✓' : 'Send invite'}
        </button>
      </div>
      {inviteError && <p className="form-hint" style={{ marginTop: '0.5rem', color: '#e05c6a' }}>{inviteError}</p>}
      <p className="form-hint" style={{ marginTop: '0.5rem' }}>
        They'll receive an email with a link. When they sign in with Google using that address, their role is set automatically.
      </p>

      {/* Users table */}
      <div className="admin-section-header" style={{ marginTop: '2.5rem' }}>
        <h2 className="admin-section-title">
          Users
          {pending.length > 0 && <span className="pending-count">{pending.length} pending</span>}
        </h2>
      </div>
      {loading ? (
        <p className="admin-muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="admin-muted">No users yet. They appear here when someone signs in.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>
          </thead>
          <tbody>
            {[...pending, ...rest].map((u) => (
              <tr key={u.uid}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <span className={`status-badge ${roleBadgeClass[u.role]}`}>
                    {u.role}
                  </span>
                </td>
                <td className="admin-actions">
                  {ROLE_OPTIONS.filter((r) => r !== u.role).map((r) => (
                    <button
                      key={r}
                      className={`btn-sm ${r === 'banned' ? 'btn-danger' : r === 'contributor' ? 'btn-approve' : ''}`}
                      onClick={() => setRole(u.uid, r)}
                    >
                      {r === 'banned' ? 'Ban' : r === 'member' ? 'Make member' : 'Make contributor'}
                    </button>
                  ))}
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
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [tab, setTab] = useState<Tab>('posts');
  const [editingPost, setEditingPost] = useState<Post | 'new' | null>(null);
  const [availableCategories, setAvailableCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);

  const isAdmin = user?.uid === adminUid;

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    loadCategoryConfig()
      .then((c) => { if (c.categories?.length) setAvailableCategories(c.categories); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) { setUserRole(null); return; }
    if (user.uid === adminUid) { setUserRole('admin'); return; }
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists()) setUserRole(snap.data().role as Role);
      else setUserRole(null);
    });
  }, [user]);

  if (user === undefined || (user && !userRole)) return <p className="admin-muted">Loading…</p>;

  if (!user) {
    return (
      <div className="admin-signin">
        <p className="admin-muted">Sign in to access this page.</p>
        <button className="btn-primary" onClick={() => signInWithPopup(auth, googleProvider)}>
          Sign in with Google
        </button>
      </div>
    );
  }

  if (userRole !== 'admin' && userRole !== 'contributor') {
    return (
      <div className="admin-signin">
        <p className="admin-muted">You don't have access to this page.</p>
        <button className="btn-sm" onClick={() => signOut(auth)}>Sign out</button>
      </div>
    );
  }

  const tabs: Tab[] = isAdmin
    ? ['posts', 'comments', 'users', 'trips', 'routes', 'categories']
    : ['posts'];

  return (
    <div className="admin-wrap">
      <div className="admin-header">
        <nav className="admin-tabs">
          {tabs.map((t) => (
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
          <PostForm post={editingPost} onDone={() => setEditingPost(null)} currentUser={user} availableCategories={availableCategories} />
        ) : tab === 'posts' ? (
          <PostsList onEdit={setEditingPost} currentUser={user} isAdmin={isAdmin} />
        ) : tab === 'comments' ? (
          <CommentsList />
        ) : tab === 'users' ? (
          <UsersList />
        ) : tab === 'trips' ? (
          <TripAdmin />
        ) : tab === 'routes' ? (
          <RouteAdmin />
        ) : (
          <CategoryConfig />
        )}
      </div>
    </div>
  );
}
