import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.LAUNCHPAD_API_ORIGIN || 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The sandbox reaches this dev server through a proxied host name, so the
    // host allow-list stays open in development.
    allowedHosts: true,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/uploads': { target: API, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
