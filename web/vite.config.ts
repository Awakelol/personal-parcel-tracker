import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': sharedDir },
  },
  server: {
    // Allow importing the API contract from ../shared.
    fs: { allow: ['..'] },
    // `npm run dev` in worker/ serves the API on 8787.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
