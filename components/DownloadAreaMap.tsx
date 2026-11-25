'use client';
import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import type {Bounds} from '../lib/tiles/tpk';
export default function DownloadAreaMap({bounds,onBounds,onViewport,fit,draw,onDrawEnd,sourceRevision=0,satelliteOnly=false,displayRequest=0,viewTarget=null}:{bounds:Bounds;onBounds:(b:Bounds)=>void;onViewport:(b:Bounds)=>void;fit:number;draw:boolean;onDrawEnd:()=>void;sourceRevision?:number;satelliteOnly?:boolean;displayRequest?:number;viewTarget?:{bounds:Bounds;id:number}|null}){
 const wanted=useRef(false),toggled=useRef(false),lastDisplay=useRef(0),[layerVersion,setLayerVersion]=useState(0);
 const container=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),rectangle=useRef<L.Rectangle|null>(null),callback=useRef({onBounds,onViewport,onDrawEnd}),[ready,setReady]=useState(false),[message,setMessage]=useState('오프라인 개요를 준비하는 중…'),[localAvailable,setLocalAvailable]=useState(false),[local,setLocal]=useState(false),tile=useRef<L.TileLayer|null>(null),outline=useRef<L.GeoJSON|null>(null);
 useEffect(()=>{callback.current={onBounds,onViewport,onDrawEnd};});
 useEffect(()=>{const abort=new AbortController();let observer:ResizeObserver|undefined;const m=L.map(container.current!,{maxZoom:19,minZoom:2,zoomControl:false,zoomAnimation:!matchMedia('(prefers-reduced-motion: reduce)').matches,fadeAnimation:false}).fitBounds([[bounds.south,bounds.west],[bounds.north,bounds.east]]);map.current=m;const overviewPane=m.createPane('download-overview');overviewPane.style.zIndex='180';overviewPane.style.pointerEvents='none';L.control.zoom({position:'bottomleft'}).addTo(m);L.control.scale({imperial:false}).addTo(m);
  const update=()=>{const b=m.getBounds();callback.current.onViewport({west:b.getWest(),south:b.getSouth(),east:b.getEast(),north:b.getNorth()});};m.on('moveend',update);update();
  void (async()=>{try{const r=await fetch('/overview/countries.geojson',{signal:abort.signal});if(!r.ok)throw Error();const v=await r.json();if(abort.signal.aborted)return;outline.current=L.geoJSON(v,{pane:'download-overview',interactive:false,style:{color:'var(--color-control-border)',fillColor:'var(--color-primary-subtle)',fillOpacity:1,weight:1},attribution:'Natural Earth · Public domain (1:110m)'}).addTo(m);rectangle.current?.bringToFront();if(!wanted.current)setMessage('오프라인 국가 개요입니다. 위성영상·도로/시설 상세 미리보기가 아닙니다.');}catch{if(!abort.signal.aborted)setMessage('국가 개요를 읽지 못했습니다. 기본 지역·시설 경계 또는 좌표로 영역을 지정할 수 있습니다.');}})();

  observer=new ResizeObserver(()=>m.invalidateSize({pan:false}));observer.observe(container.current!);setReady(true);return()=>{abort.abort();observer?.disconnect();m.remove();map.current=null;};
 // The initial extent is fixed once; fit requests below are explicit user actions.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{if(!ready||!map.current)return;const abort=new AbortController();
  void (async()=>{try{
   const r=await fetch('/api/map-info',{signal:abort.signal,cache:'no-store'});if(!r.ok)throw Error();const v=await r.json();if(abort.signal.aborted||!map.current)return;
   const source=(satelliteOnly?[v.layers?.satellite]:['satellite','street','elevation'].map(k=>v.layers?.[k])).find(x=>x?.available&&!x.online);
   tile.current?.remove();tile.current=null;setLocalAvailable(!!source);
   if(source){tile.current=L.tileLayer(source.url+(source.revision?'?v='+source.revision:''),{maxZoom:19,minNativeZoom:source.minNativeZoom??0,maxNativeZoom:source.maxNativeZoom??19,noWrap:true,attribution:source.attribution});
    tile.current.on('tileerror',()=>{if(wanted.current)setMessage('일부 영역에 선택한 지도 타일이 없거나 읽지 못했습니다. 빈 곳은 국가 개요로 표시합니다.');});
    if(displayRequest!==lastDisplay.current||satelliteOnly&&!toggled.current){wanted.current=true;setLocal(true);toggled.current=false;}
    setMessage(wanted.current?'선택한 로컬 지도를 표시합니다. 빈 곳은 오프라인 국가 개요입니다.':'오프라인 국가 개요입니다. 현재 로컬 지도 보기로 전환할 수 있습니다.');
   }else{wanted.current=false;setLocal(false);setMessage(satelliteOnly?'표시할 위성 지도가 없거나 현재 사용할 수 없습니다. 오프라인 국가 개요를 표시합니다.':'오프라인 국가 개요입니다. 위성영상·도로/시설 상세 미리보기가 아닙니다.');}
   lastDisplay.current=displayRequest;setLayerVersion(n=>n+1);
  }catch{if(!abort.signal.aborted){tile.current?.remove();tile.current=null;wanted.current=false;setLocal(false);setLocalAvailable(false);setMessage('선택 지도 미리보기를 조회하지 못했습니다. 연결·선택 상태를 확인하세요.');}}})();
  return()=>abort.abort();
 },[ready,sourceRevision,satelliteOnly,displayRequest]);
 useEffect(()=>{if(!ready||!map.current||!viewTarget)return;const b=viewTarget.bounds;map.current.fitBounds([[b.south,b.west],[b.north,b.east]],{padding:[24,24],maxZoom:17,animate:false});},[ready,viewTarget?.id]);
 useEffect(()=>{if(!ready||!map.current)return;const m=map.current,b=L.latLngBounds([[bounds.south,bounds.west],[bounds.north,bounds.east]]);if(rectangle.current)rectangle.current.setBounds(b);else rectangle.current=L.rectangle(b,{interactive:false,color:'var(--color-accent)',weight:3,fillOpacity:.12}).addTo(m);},[bounds,ready]);
 useEffect(()=>{if(ready&&map.current)map.current.fitBounds([[bounds.south,bounds.west],[bounds.north,bounds.east]],{padding:[24,24],animate:false});},[fit,ready]);
 useEffect(()=>{wanted.current=local;if(!ready||!map.current||!tile.current)return;if(local)tile.current.addTo(map.current);else tile.current.remove();rectangle.current?.bringToFront();},[local,ready,layerVersion]);
 useEffect(()=>{if(!draw||!map.current)return;const m=map.current;let first:L.LatLng|null=null;let marker:L.CircleMarker|null=null;const click=(e:L.LeafletMouseEvent)=>{if(!first){first=e.latlng;marker=L.circleMarker(first,{interactive:false,radius:7,color:'var(--color-accent)'}).addTo(m);setMessage('반대쪽 모서리를 클릭하세요. Esc로 취소할 수 있습니다.');}else{callback.current.onBounds({west:Math.min(first.lng,e.latlng.lng),east:Math.max(first.lng,e.latlng.lng),south:Math.min(first.lat,e.latlng.lat),north:Math.max(first.lat,e.latlng.lat)});callback.current.onDrawEnd();}};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')callback.current.onDrawEnd();};m.on('click',click);document.addEventListener('keydown',esc);const doubled=m.doubleClickZoom.enabled();m.doubleClickZoom.disable();setMessage('지도에서 사각형의 두 모서리를 차례로 선택하세요. 숫자 좌표 대안도 제공합니다.');return()=>{m.off('click',click);document.removeEventListener('keydown',esc);marker?.remove();if(doubled)m.doubleClickZoom.enable();setMessage('다운로드 사각형을 표시했습니다. 범위와 제공처를 확인하세요.');};},[draw]);
 return <><div className="download-map-tools"><span>{local?'현재 로컬 지도':'오프라인 국가 개요'}</span>{localAvailable&&<button type="button" onClick={()=>{toggled.current=true;wanted.current=!local;setLocal(x=>!x);setMessage(!local?'선택한 로컬 지도를 표시합니다. 빈 곳은 오프라인 국가 개요입니다.':'오프라인 국가 개요입니다.');}}>{local?'국가 개요 보기':'현재 로컬 지도 보기'}</button>}</div><div ref={container} className="download-map" aria-label="다운로드 영역 선택 지도" tabIndex={0}/><p className="download-map-description" role="status">{message}</p></>;
}
