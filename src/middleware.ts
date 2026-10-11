import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { verifyAccessJwt } from './lib/access';

export const onRequest = defineMiddleware(async (context, next) => {
  // Local dev has no Access in front of it.
  if (import.meta.env.DEV) {
    context.locals.user = { email: 'dev@localhost' };
  } else {
    const token = context.request.headers.get('Cf-Access-Jwt-Assertion');
    const user = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    if (!user) return new Response('Not signed in.', { status: 403, headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
    context.locals.user = user;
  }

  const response = await next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
