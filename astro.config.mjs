// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  site: 'https://outofbreathed.com',
  adapter: vercel(),
  integrations: [react()],
});
