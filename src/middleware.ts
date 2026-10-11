import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { verifyAccessJwt, type AccessIdentity } from './lib/access';

const OWNER_ONLY = [/^\/post(\/|$)/, /^\/api\//];

export const onRequest = defineMiddleware(async (context, next) => {
  let identity: AccessIdentity | null;
  // Local dev has no Access in front of it; act as the owner.
  if (import.meta.env.DEV) identity = { email: env.OWNER_EMAILS.split(',')[0].trim() };
  else identity = await verifyAccessJwt(context.request.headers.get('Cf-Access-Jwt-Assertion'), env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
  if (!identity) return new Response('Not signed in.', { status: 403, headers: { 'X-Robots-Tag': 'noindex, nofollow' } });

  const owners = env.OWNER_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isOwner = identity.email
    ? owners.includes(identity.email)
    : !!env.SHORTCUT_CLIENT_ID && identity.serviceToken === env.SHORTCUT_CLIENT_ID;
  context.locals.viewer = { ...identity, isOwner };

  // Service tokens exist only for posting; viewers can browse but not post.
  if (OWNER_ONLY.some((r) => r.test(context.url.pathname)) ? !isOwner : !identity.email) {
    return new Response('Not allowed.', { status: 403 });
  }

  // Browsers always send Origin on cross-site writes; refuse writes that come from another site
  // so a signed-in owner's cookie can't be used by some other page. (The Shortcut sends no Origin.)
  const origin = context.request.headers.get('Origin');
  if (!['GET', 'HEAD'].includes(context.request.method) && origin && origin !== context.url.origin) {
    return new Response('Cross-site request refused.', { status: 403 });
  }

  const response = await next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
