'use client';

import { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import { mapConfig } from '../lib/map-config';

type Dataset = { id: string; ready: boolean; bbox?: [number,number,number,number]; minzoom?: number; maxzoom?: number; attribution?: string };

export default function MapCanvas() {
  const container=useRef<HTMLDivElement>(null);
  const [message,setMessage]=useState('Esri RGB 영상을 확인하고 있습니다…');
  useEffect(() => {
    if (!container.current) return;
    setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
    let map: Map;
    try {
      map=new Map({container:container.current,style:{version:8,sources:{},layers:[
        {id:'background',type:'background',paint:{'background-color':'#eee'}}]},
        center:[mapConfig.center[1],mapConfig.center[0]],zoom:mapConfig.zoom,minZoom:mapConfig.minZoom,maxZoom:mapConfig.maxZoom});
    } catch {setMessage('WebGL 지원을 확인하세요.');return;}
    const abort=new AbortController();
    map.addControl(new NavigationControl());
    map.on('error',()=>setMessage('Esri RGB 타일 서버 상태를 확인하세요.'));
    map.on('style.load',async()=>{
      try {
        const response=await fetch('/imagery/metadata.json',{signal:abort.signal});
        if (!response.ok) throw Error('metadata');
        const catalog: {datasets:Dataset[]}=await response.json();
        if (abort.signal.aborted) return;
        const rgb=catalog.datasets.find(entry=>entry.id==='rgb' && entry.ready);
        if (!rgb) {setMessage('Esri RGB 데이터가 없습니다. 실행 메뉴에서 영상 준비를 먼저 완료하세요.');return;}
        map.addSource('esri-rgb',{type:'raster',tiles:['/imagery/rgb/{z}/{x}/{y}.jpg'],tileSize:256,
          bounds:rgb.bbox,minzoom:rgb.minzoom,maxzoom:rgb.maxzoom,attribution:rgb.attribution});
        map.addLayer({id:'esri-rgb',type:'raster',source:'esri-rgb',paint:{'raster-fade-duration':0}});
      } catch {if(!abort.signal.aborted)setMessage('Esri RGB 서버에 연결할 수 없습니다.');}
    });
    map.on('sourcedata',event=>{if(event.sourceId==='esri-rgb' && event.sourceDataType==='content')setMessage('');});
    return()=>{abort.abort();map.remove();};
  },[]);
  return <section className="map-panel"><div ref={container} className="map-canvas" aria-label="태안군 Esri RGB 지도" />
    {message && <p className="map-status" role="status">{message}</p>}</section>;
}
