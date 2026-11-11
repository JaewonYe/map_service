'use client';
import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import type {MapInfo} from '../lib/tiles/tpk';
type Info=MapInfo&{osm:{mode:string;url:string|null;attribution:string}};
export default function MapCanvas(){
  const container=useRef<HTMLDivElement>(null);
  const [info,setInfo]=useState<Info|null>(null),[message,setMessage]=useState('TPK 메타데이터 확인 중…');
  const [center,setCenter]=useState<[number,number]|null>(null),[zoom,setZoom]=useState<number|null>(null),[clicked,setClicked]=useState<[number,number]|null>(null);
  useEffect(()=>{
    const abort=new AbortController();let map:L.Map|undefined;
    (async()=>{
      try{
        const response=await fetch('/api/map-info',{signal:abort.signal});const data=await response.json();
        if(!response.ok)throw Error(data.error||'메타데이터 오류');if(abort.signal.aborted||!container.current)return;
        const metadata=data as Info;setInfo(metadata);setCenter(metadata.center);setZoom(metadata.zoom);
        const b=metadata.bounds;const bounds:L.LatLngBoundsExpression=[[b.south,b.west],[b.north,b.east]];
        map=L.map(container.current,{minZoom:metadata.minZoom,maxZoom:metadata.maxZoom,zoomSnap:1}).setView(metadata.center,metadata.zoom);
        L.control.scale({imperial:false}).addTo(map);
        const boundary=L.rectangle(bounds,{color:'#f5b33b',weight:2,fill:false,interactive:false}).addTo(map);
        const satellite=L.tileLayer(`/api/tiles/{z}/{x}/{y}?v=${metadata.revision}`,{tileSize:metadata.tileSize,bounds,noWrap:true,
          minNativeZoom:metadata.minZoom,maxNativeZoom:metadata.maxZoom,
          attribution:metadata.attribution.replace(/[<>&"']/g,'')});
        const layers:Record<string,L.Layer>={};
        if(metadata.usageConfirmed){
          let failed=false;
          satellite.on('tileerror',()=>{failed=true;setMessage('일부 타일이 없거나 읽을 수 없습니다. 데이터 범위와 서버 로그를 확인하세요.');});
          satellite.on('loading',()=>{failed=false;setMessage('타일을 불러오는 중…');});
          satellite.on('load',()=>{if(!failed)setMessage('');});
          satellite.addTo(map);layers['위성영상']=satellite;setMessage('');
        }else setMessage('메타데이터만 확인했습니다. 사용 권한 확인 후 TPK_USAGE_CONFIRMED=true로 설정하세요.');
        if(metadata.osm.url){
          layers['OSM']=L.tileLayer(metadata.osm.url,{attribution:metadata.osm.attribution,noWrap:true,maxZoom:metadata.maxZoom});
          if(!metadata.usageConfirmed)layers.OSM.addTo(map);
        }
        L.control.layers(layers,{'데이터 경계':boundary},{collapsed:false}).addTo(map);
        let point:L.CircleMarker|undefined;
        map.on('moveend zoomend',()=>{const c=map!.getCenter();setCenter([c.lat,c.lng]);setZoom(map!.getZoom());});
        map.on('click',(event:L.LeafletMouseEvent)=>{setClicked([event.latlng.lat,event.latlng.lng]);point?.remove();point=L.circleMarker(event.latlng,{radius:5,color:'#ff574e',fillOpacity:1}).addTo(map!);});
      }catch(error){if(!abort.signal.aborted)setMessage(error instanceof Error?error.message:'지도 초기화 실패');}
    })();return()=>{abort.abort();map?.remove();};
  },[]);
  return <section className="map-panel"><div className="map-canvas" ref={container} aria-label="오프라인 위성지도"/>
    <aside className="map-info" aria-label="지도 좌표 정보">
      <div>중심: {center?`${center[0].toFixed(6)}, ${center[1].toFixed(6)}`:'—'}</div>
      <div>Zoom: <span data-testid="zoom">{zoom??'—'}</span></div>
      <div data-testid="clicked">클릭: {clicked?`${clicked[0].toFixed(6)}, ${clicked[1].toFixed(6)}`:'지도를 클릭하세요'}</div>
      <small>EPSG:3857 · {info?.osm.mode==='online'?'온라인 OSM 허용':'오프라인'} · 노란 선: TPK 경계</small>
      {info?.osm.mode==='unavailable'&&<small>오프라인 OSM 타일이 없어 위성영상만 제공합니다.</small>}
    </aside>
    {message&&<p role="status" className="map-status">{message}</p>}
  </section>;
}
