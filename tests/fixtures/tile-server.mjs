// Test double serving a real tile generated from tilemaker's Monaco test extract.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const satellite = await readFile(new URL('./satellite.png', import.meta.url));
const tile = await readFile(new URL('./tile.pbf', import.meta.url));
createServer((req, res) => {
  if (req.url === '/metadata.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({datasets:[{id:'rgb',label:'자연색 RGB',ready:false},{id:'infrared',label:'근적외선 강조',ready:false},{id:'ndvi',label:'식생지수 NDVI',ready:false}]})); return; }
  if (/^\/tile\/(rgb|infrared|ndvi)\/\d+\/\d+\/\d+\.png$/.test(req.url || '')) { res.writeHead(200, {'Content-Type':'image/png'}); res.end(satellite); return; }
  if (req.url === '/health') { res.end('ok'); return; }
  if (req.url === '/tile/99/0/0.pbf') { res.writeHead(503); res.end('unavailable'); return; }
  if (!/^\/tile\/\d+\/\d+\/\d+\.pbf$/.test(req.url || '')) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': 'application/vnd.mapbox-vector-tile' });
  res.end(tile);
}).listen(Number(process.env.PORT || 3101), process.env.BIND_ADDRESS || '127.0.0.1');
