import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['./src/wasm-pkg/wasm_vis.js'] },
});
