import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultDist = fileURLToPath(new URL('./dist', import.meta.url));

export function createFrontendApp({ backendUrl = process.env.BACKEND_URL, distDir = defaultDist } = {}) {
  if (!backendUrl) {
    throw new Error('BACKEND_URL environment variable is required to start the production frontend proxy server.');
  }
  const target = new URL(backendUrl);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password
      || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('BACKEND_URL must be the backend HTTP(S) origin without a path or credentials.');
  }
  const app = express();
  app.disable('x-powered-by');
  // Keep API paths, streaming bodies, cookies and redirects intact. Parsing JSON
  // here would consume request bodies before the backend can receive them.
  app.use(createProxyMiddleware({
    pathFilter: pathname => pathname === '/api' || pathname.startsWith('/api/'),
    target: target.origin,
    changeOrigin: true,
    proxyTimeout: 180_000,
    timeout: 180_000,
    on: {
      error: (_error, _req, res) => {
        if (res.headersSent) return res.destroy();
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Backend temporarily unavailable. Please try again shortly.' }));
      },
    },
  }));
  app.use(express.static(distDir, { index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  createFrontendApp().listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log('MediCluster frontend ready; API requests forward to configured backend.');
  });
}
