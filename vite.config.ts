import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

/** When HMR is disabled (Cloud Run / AI Studio preview), prevent @vite/client from opening a WebSocket to port 24678. */
function disableHmrClientWs(): Plugin {
  return {
    name: 'disable-hmr-client-ws',
    apply: 'serve',
    enforce: 'post',
    transform(code, id) {
      if (process.env.DISABLE_HMR !== 'true') return;
      if (!id.replace(/\\/g, '/').endsWith('/vite/dist/client/client.mjs')) return;
      const patched = code.replace(
        /let wsTransport = createWebSocketModuleRunnerTransport\(\{[\s\S]*?pingInterval:\s*hmrTimeout\s*\}\);/,
        'let wsTransport = { async connect() {}, async disconnect() {}, send() {} };',
      );
      if (patched !== code) return { code: patched, map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), disableHmrClientWs()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router-dom',
      'recharts',
      'lucide-react',
    ],
  },
  server: {
    // AI Studio désactive le HMR via DISABLE_HMR
    hmr: process.env.DISABLE_HMR !== 'true',
    ws: process.env.DISABLE_HMR === 'true' ? false : undefined,
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
