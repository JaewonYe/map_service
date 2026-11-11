import assert from 'node:assert/strict';
const base=process.env.MAP_URL||'http://127.0.0.1:3001';
const response=await fetch(`${base}/api/map-info`);assert.equal(response.status,200);
const info=await response.json();assert.equal(info.projection,'EPSG:3857');assert.ok(info.usageConfirmed,'Confirm permitted package use first');
const z=info.zoom,x=Math.floor((info.center[1]+180)/360*2**z),y=Math.floor((1-Math.asinh(Math.tan(info.center[0]*Math.PI/180))/Math.PI)/2*2**z);
const tile=await fetch(`${base}/api/tiles/${z}/${x}/${y}`);assert.equal(tile.status,200);
assert.match(tile.headers.get('content-type')||'',/^image\/(jpeg|png)$/);assert.ok((await tile.arrayBuffer()).byteLength>8);
console.log('Actual package metadata and center XYZ tile passed.');
