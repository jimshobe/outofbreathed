// Sign in with Google (OpenID Connect authorization-code flow with PKCE) and the session cookie.
//
// Viewing the site needs no sign-in. Signing in gives you a name for comments; signing in with an
// OWNER_EMAILS address makes you the owner (posting, editing, moderation). The session is an
// HMAC-signed cookie holding only the user id, so reading it costs no database query.
import { env } from 'cloudflare:workers';
import { sign, verify, randomToken, pkceChallenge } from './signed';
import { verifyJwt } from './jwt';

export const SESSION_COOKIE = 'ob_session';
const STATE_COOKIE = 'ob_oauth';
export const SESSION_DAYS = 30;

export interface Viewer { id: string; email: string; first_name: string; avatar_url: string | null; trusted: number; blocked: number }

const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export const isOwnerEmail = (email: string | undefined) =>
  !!email && env.OWNER_EMAILS.split(',').map((e) => e.trim().toLowerCase()).includes(email.toLowerCase());

/** Only same-site paths, so the sign-in link can't be used to bounce people to another site. */
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/');

/** Starts sign-in: remembers state + PKCE verifier in a short-lived signed cookie, then goes to Google. */
export async function beginLogin(url: URL): Promise<Response> {
  const state = randomToken(), verifier = randomToken(48);
  const redirectUri = `${url.origin}/auth/callback`;
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
    state, code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256', prompt: 'select_account',
  });
  const pending = await sign({ state, verifier, next: safeNext(url.searchParams.get('next')) }, env.SESSION_SECRET, 600);
  return new Response(null, {
    status: 302,
    headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, 'Set-Cookie': cookie(STATE_COOKIE, pending, 600) },
  });
}

/** Finishes sign-in: checks state, swaps the code for an ID token, verifies it, saves the user, sets the session. */
export async function finishLogin(url: URL, cookies: { get(name: string): { value: string } | undefined }): Promise<Response> {
  const fail = (why: string) => new Response(`Sign-in failed: ${why}. Go back and try again.`, { status: 400, headers: { 'Set-Cookie': cookie(STATE_COOKIE, '', 0) } });
  const pending = await verify<{ state: string; verifier: string; next: string }>(cookies.get(STATE_COOKIE)?.value, env.SESSION_SECRET);
  if (!pending || pending.state !== url.searchParams.get('state')) return fail('the sign-in expired or was started elsewhere');
  const code = url.searchParams.get('code');
  if (!code) return fail(url.searchParams.get('error') ?? 'no code from Google');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code, code_verifier: pending.verifier,
      grant_type: 'authorization_code', redirect_uri: `${url.origin}/auth/callback`,
    }),
  });
  if (!tokenRes.ok) {
    // Google explains what's wrong (e.g. invalid_client, redirect_uri_mismatch); nothing secret in it.
    const err = (await tokenRes.json().catch(() => ({}))) as { error?: string; error_description?: string };
    console.error('google token exchange failed', tokenRes.status, err);
    return fail(`Google refused the sign-in (${tokenRes.status} ${err.error ?? ''}${err.error_description ? `: ${err.error_description}` : ''})`);
  }
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  const claims = await verifyJwt(id_token, {
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'], audience: env.GOOGLE_CLIENT_ID,
  });
  if (!claims || typeof claims.sub !== 'string' || typeof claims.email !== 'string') return fail('the ID token was invalid');
  if (claims.email_verified !== true) return fail('that Google account has no verified email');

  const name = String(claims.given_name ?? claims.name ?? claims.email.split('@')[0]).split(' ')[0].slice(0, 40);
  await env.DB.prepare(
    `INSERT INTO users (id, email, first_name, avatar_url, last_seen) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT (id) DO UPDATE SET email = excluded.email, first_name = excluded.first_name, avatar_url = excluded.avatar_url, last_seen = excluded.last_seen`,
  ).bind(claims.sub, claims.email.toLowerCase(), name, typeof claims.picture === 'string' ? claims.picture : null).run();


  const avatar = typeof claims.picture === 'string' ? claims.picture : null;
  const session = await sign({ uid: claims.sub, email: claims.email.toLowerCase(), name, avatar }, env.SESSION_SECRET, SESSION_DAYS * 86400);
  const headers = new Headers({ Location: pending.next });
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, session, SESSION_DAYS * 86400));
  headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0));
  return new Response(null, { status: 302, headers });
}

export function logout(url: URL): Response {
  return new Response(null, { status: 302, headers: { Location: safeNext(url.searchParams.get('next')), 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) } });
}

export interface Session { uid: string; email: string; name?: string; avatar?: string | null }

/** The signed-in session (id, email, first name, avatar), without a database read. */
export async function readSession(value: string | undefined): Promise<Session | null> {
  return verify<Session & Record<string, unknown>>(value, env.SESSION_SECRET);
}

/** The full signed-in user, for actions that need it (commenting). */
export async function loadViewer(uid: string): Promise<Viewer | null> {
  return env.DB.prepare('SELECT id, email, first_name, avatar_url, trusted, blocked FROM users WHERE id = ?').bind(uid).first<Viewer>();
}
