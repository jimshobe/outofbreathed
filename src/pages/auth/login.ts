import type { APIRoute } from 'astro';
import { beginLogin } from '../../lib/auth';

// /auth/login?next=/somewhere → Google → /auth/callback → back to `next`.
export const GET: APIRoute = ({ url }) => beginLogin(url);
