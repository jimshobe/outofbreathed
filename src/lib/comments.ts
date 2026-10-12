// Comments on moments and sets. Signed-in Google users comment as their first name + avatar; a
// person's comments wait for the owner's approval until the owner has approved one of them.
import { env } from 'cloudflare:workers';
import { UploadError } from './ingest';
import { loadViewer } from './auth';
import { cleanBody, newCommentStatus, parseTarget } from './comment-rules';

export interface CommentView {
  id: string; body: string; status: 'pending' | 'approved' | 'rejected'; created_at: string;
  user_id: string; first_name: string; avatar_url: string | null; mine: boolean;
}

const newId = () => 'c' + Date.now().toString(36) + crypto.getRandomValues(new Uint8Array(4)).reduce((s, x) => s + x.toString(36).padStart(2, '0'), '');

const asUploadError = <T>(f: () => T): T => {
  try { return f(); } catch (e) { throw new UploadError((e as Error).message); }
};

/** Approved comments, plus the viewer's own pending ones (and every pending one for the owner). */
export async function listComments(on: string, viewer: { uid?: string; isOwner: boolean }): Promise<CommentView[]> {
  const t = asUploadError(() => parseTarget(on));
  const col = t.moment_id ? 'moment_id' : 'set_id';
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.body, c.status, c.created_at, c.user_id, u.first_name, u.avatar_url
       FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.${col} = ? AND (c.status = 'approved' OR (c.status = 'pending' AND (c.user_id = ? OR ?)))
      ORDER BY c.created_at`,
  ).bind(t.moment_id ?? t.set_id, viewer.uid ?? '', viewer.isOwner ? 1 : 0).all<Omit<CommentView, 'mine'>>();
  return results.map((c) => ({ ...c, mine: c.user_id === viewer.uid }));
}

export async function addComment(on: unknown, body: unknown, viewer: { uid?: string; isOwner: boolean }): Promise<CommentView> {
  if (!viewer.uid) throw new UploadError('sign in to comment', 401);
  const t = asUploadError(() => parseTarget(on));
  const text = asUploadError(() => cleanBody(body));
  const user = await loadViewer(viewer.uid);
  if (!user) throw new UploadError('sign in again to comment', 401);
  const status = asUploadError(() => newCommentStatus(user, viewer.isOwner));
  const exists = t.moment_id
    ? await env.DB.prepare('SELECT 1 FROM moments WHERE id = ?').bind(t.moment_id).first()
    : await env.DB.prepare('SELECT 1 FROM sets WHERE id = ?').bind(t.set_id).first();
  if (!exists) throw new UploadError('that post no longer exists', 404);
  const id = newId();
  const row = await env.DB.prepare(
    `INSERT INTO comments (id, moment_id, set_id, user_id, body, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING created_at`,
  ).bind(id, t.moment_id, t.set_id, user.id, text, status).first<{ created_at: string }>();
  return { id, body: text, status, created_at: row!.created_at, user_id: user.id, first_name: user.first_name, avatar_url: user.avatar_url, mine: true };
}

/** The author or the owner can delete a comment. */
export async function deleteComment(id: string, viewer: { uid?: string; isOwner: boolean }): Promise<boolean> {
  const c = await env.DB.prepare('SELECT user_id FROM comments WHERE id = ?').bind(id).first<{ user_id: string }>();
  if (!c) return false;
  if (!viewer.isOwner && c.user_id !== viewer.uid) throw new UploadError("you can only delete your own comments", 403);
  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return true;
}

/** Owner: approving a comment also trusts its author, so their later comments appear straight away. */
export async function moderate(id: string, status: unknown): Promise<boolean> {
  if (status !== 'approved' && status !== 'rejected') throw new UploadError('status must be approved or rejected');
  const c = await env.DB.prepare('SELECT user_id FROM comments WHERE id = ?').bind(id).first<{ user_id: string }>();
  if (!c) return false;
  await env.DB.batch([
    env.DB.prepare('UPDATE comments SET status = ? WHERE id = ?').bind(status, id),
    ...(status === 'approved' ? [env.DB.prepare('UPDATE users SET trusted = 1 WHERE id = ?').bind(c.user_id)] : []),
  ]);
  return true;
}

export interface PendingComment { id: string; body: string; created_at: string; first_name: string; email: string; avatar_url: string | null; moment_id: string | null; set_id: string | null }

/** Owner: comments waiting for approval, oldest first. */
export async function pendingComments(): Promise<PendingComment[]> {
  return (await env.DB.prepare(
    `SELECT c.id, c.body, c.created_at, c.moment_id, c.set_id, u.first_name, u.email, u.avatar_url
       FROM comments c JOIN users u ON u.id = c.user_id WHERE c.status = 'pending' ORDER BY c.created_at`,
  ).all<PendingComment>()).results;
}

/** Approved comment counts for a page's moments and sets ("m:<id>" / "s:<id>" → count). */
export async function commentCounts(momentIds: string[], setIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const q = async (col: 'moment_id' | 'set_id', ids: string[], prefix: string) => {
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const { results } = await env.DB.prepare(
        `SELECT ${col} AS id, count(*) AS n FROM comments WHERE status = 'approved' AND ${col} IN (${chunk.map(() => '?').join(',')}) GROUP BY ${col}`,
      ).bind(...chunk).all<{ id: string; n: number }>();
      for (const r of results) counts.set(`${prefix}:${r.id}`, r.n);
    }
  };
  await Promise.all([q('moment_id', momentIds, 'm'), q('set_id', setIds, 's')]);
  return counts;
}
