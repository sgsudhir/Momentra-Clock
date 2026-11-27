import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev-only HTTP proxy at `/device-proxy/*` forwarding requests to the URL in
 * `X-Momentra-Target` so browsers can talk to LAN ESP32 devices without CORS.
 */
function momentraDeviceProxyPlugin(): Plugin {
  const handleProxy = (req: IncomingMessage, res: ServerResponse) => {
    const rawTarget = req.headers['x-momentra-target'];
    const targetHeader = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget;
    if (!targetHeader) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing X-Momentra-Target header' }));
      return;
    }

    let targetUrl: URL;
    try {
      const subPath = (req.url || '/').replace(/^\/device-proxy/, '') || '/';
      targetUrl = new URL(subPath, targetHeader);
      if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
        throw new Error('Unsupported protocol');
      }
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid device target URL' }));
      return;
    }

    const forwardHeaders: Record<string, string | string[]> = {};
    if (req.headers['content-type']) {
      forwardHeaders['content-type'] = req.headers['content-type'];
    }
    if (req.headers['content-length']) {
      forwardHeaders['content-length'] = req.headers['content-length'];
    }

    const transport = targetUrl.protocol === 'https:' ? https : http;
    const proxyReq = transport.request(
      targetUrl,
      {
        method: req.method || 'GET',
        headers: forwardHeaders,
        timeout: targetUrl.pathname === '/api/ota' ? 120_000 : 8_000,
      },
      (proxyRes) => {
        res.statusCode = proxyRes.statusCode || 502;
        const contentType = proxyRes.headers['content-type'];
        if (contentType) res.setHeader('Content-Type', contentType);
        const cacheControl = proxyRes.headers['cache-control'];
        if (cacheControl) res.setHeader('Cache-Control', cacheControl);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('Device request timed out'));
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
      } else {
        res.end();
      }
    });

    req.pipe(proxyReq);
  };

  return {
    name: 'momentra-device-proxy',
    configureServer(server) {
      server.middlewares.use('/device-proxy', handleProxy);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/device-proxy', handleProxy);
    },
  };
}

export default defineConfig({
  plugins: [react(), momentraDeviceProxyPlugin()],
  server: {
    port: 5173,
    host: true,
  },
});
