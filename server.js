// Local dev server: serves public/ and routes /api/<name> to api/<name>.js (same files Vercel deploys).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    const api = pathname.match(/^\/api\/([\w-]+)$/);
    if (api) {
      const file = path.resolve('api', `${api[1]}.js`);
      if (!fs.existsSync(file)) return res.writeHead(404).end('{}');
      const mod = await import(pathToFileURL(file).href);
      return mod.default(req, res);
    }
    let file = path.join('public', decodeURIComponent(pathname));
    if (!file.startsWith('public') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = 'public/index.html';
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));
