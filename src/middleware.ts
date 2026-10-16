import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { readSession, isOwnerEmail, SESSION_COOKIE, type Session } from './lib/auth';

// Viewing is public. Posting, editing and moderation are for the owner (an OWNER_EMAILS Google account).
const OWNER_ONLY = /^\/(post|api)(\/|$)/;

// Old blog addresses that may be bookmarked or linked from elsewhere.
const OLD_BLOG = [/^\/posts\//, /^\/rss\.xml$/, /^\/api\/posts\.json$/, /^\/admin\/?$/];

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request } = context;

  // One canonical address: www.outofbreathed.com → outofbreathed.com (same path).
  if (url.hostname.startsWith('www.')) {
    return Response.redirect(`${url.protocol}//${url.hostname.slice(4)}${url.pathname}${url.search}`, 301);
  }
  // Old blog links land somewhere sensible instead of a 404.
  if (OLD_BLOG.some((r) => r.test(url.pathname))) {
    return Response.redirect(new URL(url.pathname.startsWith('/admin') ? '/post' : '/', url).href, 301);
  }

  let session: Session | null = await readSession(context.cookies.get(SESSION_COOKIE)?.value);
  // Local dev can't sign in with Google; act as the owner unless a test asks to be someone else
  // ("x-dev-viewer: anon" or "user:<id>:<email>").
  if (import.meta.env.DEV && !session) {
    const as = request.headers.get('x-dev-viewer');
    if (as?.startsWith('user:')) { const [, uid, email, name] = as.split(':'); session = { uid, email, name: name ?? 'Tester' }; }
    else if (as !== 'anon') session = { uid: 'dev-owner', email: env.OWNER_EMAILS.split(',')[0].trim(), name: 'Owner' };
  }
  const isOwner = !!session && isOwnerEmail(session.email);
  context.locals.viewer = { uid: session?.uid, email: session?.email, name: session?.name, avatar: session?.avatar ?? null, isOwner };

  if (OWNER_ONLY.test(url.pathname) && !isOwner) {
    if (request.method === 'GET' && url.pathname.startsWith('/post')) {
      return session
        ? new Response(`Signed in as ${session.email}, which isn't the owner account. Sign out at /auth/logout.`, { status: 403 })
        : context.redirect(`/auth/login?next=${encodeURIComponent(url.pathname)}`);
    }
    return Response.json({ error: 'owner only' }, { status: 403 });
  }

  // Browsers always send Origin on cross-site writes; refuse writes that come from another site so a
  // signed-in visitor's cookie can't be used by some other page.
  const origin = request.headers.get('Origin');
  if (!['GET', 'HEAD'].includes(request.method) && origin && origin !== url.origin) {
    return new Response('Cross-site request refused.', { status: 403 });
  }

  let response = await next();
  try {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  } catch {
    // Responses from the edge cache have immutable headers; copy before adding ours.
    response = new Response(response.body, response);
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
});
