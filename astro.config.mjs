// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Every page is behind the Access login and reads live data, so render on demand.
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
});
