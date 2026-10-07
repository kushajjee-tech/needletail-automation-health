// Minimal static server for local preview: node scripts/serve.mjs  →  http://localhost:4173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT) || 4173;
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(dist, path && path !== '.' ? path : 'index.html');
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }).end(body); }
  catch { res.writeHead(404).end('Not found'); }
}).listen(port, () => console.log(`Preview at http://localhost:${port}`));
