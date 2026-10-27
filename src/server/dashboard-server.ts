import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
};

export interface DashboardServerInstance {
  server: http.Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export function startDashboardServer(
  targetDir: string,
  options?: { port?: number; openBrowser?: boolean; unref?: boolean }
): Promise<DashboardServerInstance> {
  return new Promise((resolve, reject) => {
    const port = options?.port ?? 3000;
    const resolvedTarget = path.resolve(targetDir);
    const officeDir = path.join(resolvedTarget, '.office');

    // Resolve package root where dist/ directory is located
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageRoot = path.resolve(currentDir, '..', '..');
    const distDir = path.join(packageRoot, 'dist');

    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || '/', `http://localhost:${port}`);
      const pathname = parsedUrl.pathname;

      // API endpoint for office status / baseline / config
      if (pathname === '/api/office-info') {
        const configPath = path.join(officeDir, 'config.json');
        const baselinePath = path.join(officeDir, 'baseline.json');
        let config = null;
        let baseline = null;
        try {
          if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          if (fs.existsSync(baselinePath)) baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
        } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ targetDir: resolvedTarget, config, baseline }));
        return;
      }

      // Check if dist folder exists
      if (!fs.existsSync(distDir)) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>2D Agent Office</h1><p>Dashboard bundle not built. Please run <code>npm run build</code> in the team directory.</p>');
        return;
      }

      // Serve static files from distDir
      let filePath = path.join(distDir, pathname);

      // Traversal protection
      if (!filePath.startsWith(distDir)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      // If directory or non-existent asset, fallback to index.html for SPA routing
      if (pathname === '/' || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': content.length,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=31536000'
        });
        res.end(content);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // If address already in use (e.g. multiple tests or existing instance), don't crash
        resolve({
          server,
          port,
          url: `http://localhost:${port}`,
          close: () => Promise.resolve()
        });
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      if (options?.unref) {
        server.unref();
      }

      if (options?.openBrowser) {
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${cmd} ${url}`);
      }

      resolve({
        server,
        port,
        url,
        close: () =>
          new Promise<void>((resClose) => {
            server.close(() => resClose());
          })
      });
    });
  });
}
