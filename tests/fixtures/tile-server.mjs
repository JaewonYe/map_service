// Test double serving a real tile generated from tilemaker's Monaco test extract.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const tile = await readFile(new URL('./tile.pbf', import.meta.url));
createServer((req, res) => {
  if (req.url === '/health') { res.end('ok'); return; }
  if (req.url === '/tile/99/0/0.pbf') { res.writeHead(503); res.end('unavailable'); return; }
  if (!/^\/tile\/\d+\/\d+\/\d+\.pbf$/.test(req.url || '')) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': 'application/vnd.mapbox-vector-tile' });
  res.end(tile);
}).listen(Number(process.env.PORT || 3101), process.env.BIND_ADDRESS || '127.0.0.1');
