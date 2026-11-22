import { defineConfig } from 'vite';

// `base: './'` keeps every asset path relative, so the built site works from any
// folder, including GitHub Pages at /<repo>/.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
