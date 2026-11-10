import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    // MapLibre 6 starts its web worker from a file next to its own module; Vite's dependency pre-bundling would
    // move the module away from that file, so the dev server serves MapLibre as it is.
    optimizeDeps: { exclude: ['maplibre-gl'] },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: env.BACKEND_URL || 'http://localhost:3000', changeOrigin: false },
        '/uploads': { target: env.BACKEND_URL || 'http://localhost:3000', changeOrigin: false },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.js'],
      include: ['tests/**/*.test.{js,jsx}'],
      css: false,
    },
  };
});
