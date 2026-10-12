import type { APIRoute } from 'astro';
import { logout } from '../../lib/auth';

export const GET: APIRoute = ({ url }) => logout(url);
