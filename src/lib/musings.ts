// Musings: occasional written pieces, in the Markdown of markdown.ts, shown on the timeline at their date
// (filter "musings") and on their own page. Drafts are seen only by the owner.
import { env } from 'cloudflare:workers';
import { UploadError } from './ingest';
import { mediaUrl, type MomentView } from './moments';
import { photoIds, type PhotoRef } from './markdown';
import type { MusingInfo } from './timeline';

export interface Musing extends MusingInfo { published: number; updated_at: string }

const COLS = 'id, title, body, written_at, set_id, published, updated_at';
const newId = () => 'u' + Date.now().toString(36) + crypto.getRandomValues(new Uint8Array(4)).reduce((s, x) => s + x.toString(36).padStart(2, '0'), '');
const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
export const MAX_BODY = 50_000;

/** A new, empty draft dated `written_at` (the browser's local time with its offset). */
export async function createMusing(writtenAt: unknown): Promise<string> {
  const at = typeof writtenAt === 'string' && ISO_LOCAL.test(writtenAt) ? writtenAt : new Date().toISOString().slice(0, 19) + 'Z';
  const id = newId();
  await env.DB.prepare('INSERT INTO musings (id, written_at) VALUES (?, ?)').bind(id, at).run();
  return id;
}

export async function getMusing(id: string): Promise<Musing | null> {
  return env.DB.prepare(`SELECT ${COLS} FROM musings WHERE id = ?`).bind(id).first<Musing>();
}

/** Owner: every musing, drafts included, newest first. */
export async function allMusings(): Promise<Musing[]> {
  return (await env.DB.prepare(`SELECT ${COLS} FROM musings ORDER BY written_at DESC`).all<Musing>()).results;
}

/** The published musing about a set, if any (for the set page). */
export async function musingForSet(setId: string): Promise<{ id: string; title: string } | null> {
  return env.DB.prepare('SELECT id, title FROM musings WHERE set_id = ? AND published = 1 ORDER BY written_at DESC LIMIT 1').bind(setId).first();
}

export interface MusingEdit { title?: string; body?: string; written_at?: string; set_id?: string | null; published?: boolean }

export async function updateMusing(id: string, e: MusingEdit): Promise<boolean> {
  if (!(await env.DB.prepare('SELECT 1 FROM musings WHERE id = ?').bind(id).first())) return false;
  const sets: string[] = [], vals: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };
  if (e.title !== undefined) {
    if (typeof e.title !== 'string' || e.title.length > 120) throw new UploadError('titles are limited to 120 characters');
    set('title', e.title.trim());
  }
  if (e.body !== undefined) {
    if (typeof e.body !== 'string' || e.body.length > MAX_BODY) throw new UploadError(`a musing is limited to ${MAX_BODY} characters`);
    set('body', e.body);
  }
  if (e.written_at !== undefined) {
    if (typeof e.written_at !== 'string' || !ISO_LOCAL.test(e.written_at)) throw new UploadError('written_at must be ISO 8601, e.g. 2026-11-09T09:12:00+10:00');
    set('written_at', e.written_at);
  }
  if (e.set_id !== undefined) {
    if (e.set_id && !(await env.DB.prepare('SELECT 1 FROM sets WHERE id = ?').bind(e.set_id).first())) throw new UploadError('that set no longer exists');
    set('set_id', e.set_id || null);
  }
  if (e.published !== undefined) {
    if (e.published) {
      const m = await env.DB.prepare('SELECT title, body FROM musings WHERE id = ?').bind(id).first<{ title: string; body: string }>();
      if (!(e.title ?? m?.title)?.trim()) throw new UploadError('give it a title before publishing');
      if (!(e.body ?? m?.body)?.trim()) throw new UploadError('write something before publishing');
    }
    set('published', e.published ? 1 : 0);
  }
  if (!sets.length) return true;
  set('updated_at', new Date().toISOString());
  await env.DB.prepare(`UPDATE musings SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
  return true;
}

export async function deleteMusing(id: string): Promise<boolean> {
  const r = await env.DB.batch([
    env.DB.prepare('DELETE FROM comments WHERE musing_id = ?').bind(id),
    env.DB.prepare('DELETE FROM musings WHERE id = ?').bind(id),
  ]);
  return (r[1].meta.changes ?? 0) > 0;
}

/** How a placed photo is drawn: full size alone, thumbnail in a row; YouTube by its thumbnail. */
export const photoRef = (m: Pick<MomentView, 'id' | 'media_key' | 'thumb_key' | 'youtube_id'>): PhotoRef | null =>
  m.media_key ? { id: m.id, src: mediaUrl(m.media_key), thumb: mediaUrl(m.thumb_key ?? m.media_key), youtube: false }
  : m.youtube_id ? { id: m.id, src: `https://i.ytimg.com/vi/${m.youtube_id}/hqdefault.jpg`, thumb: `https://i.ytimg.com/vi/${m.youtube_id}/mqdefault.jpg`, youtube: true }
  : null;

export { photoIds };
