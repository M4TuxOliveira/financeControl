import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps asset URLs relative, so the build works on any static host
// (GitHub Pages project sites, Netlify, Cloudflare Pages, Vercel) with no config.
export default defineConfig({ base: './', plugins: [react()] });
