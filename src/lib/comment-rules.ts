// Pure comment rules (unit-tested).

export const MAX_COMMENT = 1000;

/** A new comment is published straight away for people the owner has approved before; otherwise it waits. */
export function newCommentStatus(user: { trusted: number; blocked: number }, isOwner: boolean): 'approved' | 'pending' {
  if (user.blocked) throw new Error('commenting is turned off for this account');
  return isOwner || user.trusted ? 'approved' : 'pending';
}

/** Trims and collapses runs of blank lines; rejects empty or over-long comments. Stored as plain text. */
export function cleanBody(raw: unknown): string {
  const body = (typeof raw === 'string' ? raw : '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!body) throw new Error('write something first');
  if (body.length > MAX_COMMENT) throw new Error(`comments are limited to ${MAX_COMMENT} characters`);
  return body;
}

/** "m:<moment id>" or "s:<set id>" → which thing a comment is on. */
export function parseTarget(on: unknown): { moment_id: string | null; set_id: string | null } {
  const m = typeof on === 'string' ? on.match(/^([ms]):([\w-]{1,64})$/) : null;
  if (!m) throw new Error('unknown comment target');
  return m[1] === 'm' ? { moment_id: m[2], set_id: null } : { moment_id: null, set_id: m[2] };
}
