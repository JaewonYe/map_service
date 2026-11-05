// Test double: validates the HTTP integration, not real OSM rendering.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const tile = await readFile(new URL('./tile.png', import.meta.url));
createServer((req, res) => {
  if (req.url === '/health') { res.end('ok'); return; }
  if (req.url === '/tile/99/0/0.png') { res.writeHead(503); res.end('renderer unavailable'); return; }
  if (!/^\/tile\/\d+\/\d+\/\d+\.png$/.test(req.url || '')) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': 'image/png' });
  res.end(tile);
}).listen(Number(process.env.PORT || 3101), process.env.BIND_ADDRESS || '127.0.0.1');
