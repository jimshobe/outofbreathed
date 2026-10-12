import type { APIRoute } from 'astro';
import { finishLogin } from '../../lib/auth';

export const GET: APIRoute = ({ url, cookies }) => finishLogin(url, cookies);
