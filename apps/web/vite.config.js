import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Production: the build output is copied into the NestJS static folder (see Dockerfile).
// Development: /api is proxied to a locally running API on :3000.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': '/src' } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  build: { chunkSizeWarningLimit: 900 },
});
