import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const jpeg=await readFile(new URL('./satellite.jpg',import.meta.url));
createServer((req,res)=>{
  if(req.url==='/health'){res.end('ok');return;}
  if(req.url==='/metadata.json'){
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({datasets:[{
      id:'rgb',ready:true,label:'Esri RGB',minzoom:6,maxzoom:15,bbox:[125.45,36.35,126.55,37.08],attribution:'Esri synthetic test'
    }]}));return;
  }
  if(/^\/tile\/rgb\/\d+\/\d+\/\d+\.jpg$/.test(req.url||'')){
    res.writeHead(200,{'Content-Type':'image/jpeg'});res.end(jpeg);return;
  }
  res.writeHead(404);res.end();
}).listen(3101,'127.0.0.1');
