import type { APIRoute } from 'astro';
import { makeGenericAPIRouteHandler } from '@keystatic/core/api/generic';
import { parseString } from 'set-cookie-parser';
import config from '../../../../keystatic.config';

export const prerender = false;

export const ALL: APIRoute = async (context) => {
  // Vercel serverless passes localhost as the host in req.url.
  // The real public host is in x-forwarded-host.
  let request = context.request;
  const url = new URL(request.url);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
    if (forwardedHost) {
      url.hostname = forwardedHost.split(':')[0];
      url.port = '';
      url.protocol = forwardedProto + ':';
      request = new Request(url.toString(), request);
    }
  }

  const handler = makeGenericAPIRouteHandler(
    {
      ...config,
      clientId: process.env.KEYSTATIC_GITHUB_CLIENT_ID,
      clientSecret: process.env.KEYSTATIC_GITHUB_CLIENT_SECRET,
      secret: process.env.KEYSTATIC_SECRET,
    },
    { slugEnvName: 'PUBLIC_KEYSTATIC_GITHUB_APP_SLUG' }
  );

  const { body, headers, status } = await handler(request);

  let headersMap = new Map<string, string[]>();
  if (headers) {
    if (Array.isArray(headers)) {
      for (const [key, value] of headers as [string, string][]) {
        const k = key.toLowerCase();
        if (!headersMap.has(k)) headersMap.set(k, []);
        headersMap.get(k)!.push(value);
      }
    } else if (typeof (headers as any).entries === 'function') {
      const hdrs = headers as Headers;
      for (const [key, value] of hdrs.entries()) {
        headersMap.set(key.toLowerCase(), [value]);
      }
      if ('getSetCookie' in hdrs && typeof (hdrs as any).getSetCookie === 'function') {
        const cookies = (hdrs as any).getSetCookie() as string[];
        if (cookies.length) headersMap.set('set-cookie', cookies);
      }
    } else {
      for (const [key, value] of Object.entries(headers as Record<string, string>)) {
        headersMap.set(key.toLowerCase(), [value]);
      }
    }
  }

  const setCookieHeaders = headersMap.get('set-cookie');
  headersMap.delete('set-cookie');
  if (setCookieHeaders) {
    for (const setCookieValue of setCookieHeaders) {
      const { name, value, ...options } = parseString(setCookieValue);
      const sameSite = options.sameSite?.toLowerCase();
      context.cookies.set(name, value, {
        domain: options.domain,
        expires: options.expires,
        httpOnly: options.httpOnly,
        maxAge: options.maxAge,
        path: options.path,
        sameSite:
          sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none'
            ? sameSite
            : undefined,
      });
    }
  }

  return new Response(body, {
    status,
    headers: [...headersMap.entries()].flatMap(([key, vals]) =>
      vals.map((v) => [key, v] as [string, string])
    ),
  });
};
