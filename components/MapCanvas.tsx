'use client';
import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import MapMeasurements from './MapMeasurements';
import DetailLocations from './DetailLocations';
import MapBuildings from './MapBuildings';
import type {Coordinate} from '../lib/map-measure';
import type {CatalogInfo} from '../lib/tiles/catalog';
import type {LayerId,LayerInfo} from '../lib/maps/types';
type Info=Pick<CatalogInfo,'center'|'zoom'|'minZoom'|'maxZoom'|'sources'|'warnings'>&{mode:'single'|'multi'|'layers';layers:Record<LayerId,LayerInfo>;osm:{mode:string;url:string|null;attribution:string;reason?:string}};
export default function MapCanvas(){
  const container=useRef<HTMLDivElement>(null);
  const help=useRef<HTMLDialogElement>(null);
  const [activeLayer,setActiveLayer]=useState('');
  const [height,setHeight]=useState('');
  const [mapInstance,setMapInstance]=useState<L.Map|null>(null);
  const [buildingPoint,setBuildingPoint]=useState<Coordinate|null>(null);
  const [info,setInfo]=useState<Info|null>(null),[message,setMessage]=useState('TPK 메타데이터 확인 중…');
  const [center,setCenter]=useState<[number,number]|null>(null),[zoom,setZoom]=useState<number|null>(null),[clicked,setClicked]=useState<[number,number]|null>(null);
  useEffect(()=>{
    const abort=new AbortController();let map:L.Map|undefined;
    (async()=>{
      try{
        const response=await fetch('/api/map-info',{signal:abort.signal});const data=await response.json();
        if(!response.ok)throw Error(data.error||'메타데이터 오류');if(abort.signal.aborted||!container.current)return;
        const metadata=data as Info;setInfo(metadata);setCenter(metadata.center);setZoom(metadata.zoom);
        map=L.map(container.current,{minZoom:metadata.minZoom,maxZoom:metadata.maxZoom,zoomSnap:1}).setView(metadata.center,metadata.zoom);
        L.control.scale({imperial:false}).addTo(map);
        const boundary=L.featureGroup(metadata.sources.filter(source=>source.bounds&&source.status==='ready').map(source=>{
          const b=source.bounds!;
          return L.rectangle([[b.south,b.west],[b.north,b.east]],{color:source.role==='base'?'#6ca5e5':'#f5b33b',weight:2,fill:false,interactive:false});
        })).addTo(map);
        const layers:Record<string,L.Layer>={};
        const names:Record<LayerId,string>={satellite:'위성영상',street:'일반 지도',elevation:'고도 지도'};
        // Compatibility with the original local/online OSM metadata contract.
        if(metadata.osm.url&&!metadata.layers.street.available)metadata.layers.street={available:true,url:metadata.osm.url,
          attribution:metadata.osm.attribution,minNativeZoom:0,maxNativeZoom:19,online:metadata.osm.mode==='online'};
        for(const id of ['satellite','street','elevation'] as const){
          const source=metadata.layers[id];
          if(!source.available||!source.url)continue;
          const b=source.bounds;
          const tile=L.tileLayer(`${source.url}${source.revision?'?v='+source.revision:''}`,{
            tileSize:256,noWrap:true,bounds:b?[[b.south,b.west],[b.north,b.east]]:undefined,
            minZoom:0,maxZoom:19,minNativeZoom:source.minNativeZoom??0,maxNativeZoom:source.maxNativeZoom??19,
            attribution:source.attribution==='© OpenStreetMap contributors'?'<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>':(source.attribution||'').replace(/[<>&"']/g,'')});
          let failed=false;
          tile.on('tileerror',()=>{failed=true;setMessage('일부 타일이 없습니다. 데이터 범위와 서버 로그를 확인하세요.');});
          tile.on('loading',()=>{failed=false;setMessage('타일을 불러오는 중…');});
          tile.on('load',()=>{if(!failed)setMessage('');});
          layers[names[id]]=tile;
          if(Object.keys(layers).length===1){tile.addTo(map);setActiveLayer(names[id]);}
          if(id!=='satellite'&&b)L.rectangle([[b.south,b.west],[b.north,b.east]],{
            color:id==='street'?'#087f8c':'#a855f7',weight:2,fill:false,interactive:false}).addTo(boundary);
        }
        setMessage(Object.keys(layers).length?'':'사용 가능한 지도 데이터가 없습니다. 오른쪽의 지도 데이터 준비를 확인하세요.');
        L.control.layers(layers,{'데이터 경계':boundary},{collapsed:false}).addTo(map);
        map.on('baselayerchange',(event:L.LayersControlEvent)=>{
          setActiveLayer(event.name);setMessage('');
          const id=(Object.keys(names) as LayerId[]).find(id=>names[id]===event.name),b=id&&metadata.layers[id].bounds;
          if(b){const area=L.latLngBounds([[b.south,b.west],[b.north,b.east]]);
            if(!map!.getBounds().intersects(area))map!.fitBounds(area,{padding:[30,30],maxZoom:metadata.layers[id!].maxNativeZoom??16});}
        });
        let point:L.CircleMarker|undefined;
        map.on('moveend zoomend',()=>{const c=map!.getCenter();setCenter([c.lat,c.lng]);setZoom(map!.getZoom());});
        map.on('click',(event:L.LeafletMouseEvent)=>{setClicked([event.latlng.lat,event.latlng.lng]);point?.remove();point=L.circleMarker(event.latlng,{radius:5,color:'#ff574e',fillOpacity:1}).addTo(map!);});
        setMapInstance(map);
      }catch(error){if(!abort.signal.aborted)setMessage(error instanceof Error?error.message:'지도 초기화 실패');}
    })();return()=>{abort.abort();map?.remove();};
  },[]);
  useEffect(()=>{
    if(!clicked||!info?.layers.elevation.available){setHeight('');return;}
    const abort=new AbortController();setHeight('확인 중…');
    fetch(`/api/elevation?lat=${clicked[0]}&lon=${clicked[1]}`,{signal:abort.signal}).then(async response=>{
      const result=await response.json();if(!response.ok)throw Error(result.error||'고도 조회 실패');
      if(!abort.signal.aborted)setHeight(result.elevationMeters===null?'데이터 없음':`${result.elevationMeters.toFixed(1)} m`);
    }).catch(error=>{if(!abort.signal.aborted)setHeight(error instanceof Error?error.message:'고도 조회 실패');});
    return()=>abort.abort();
  },[clicked,info]);
  return <section className="map-panel"><div className="map-canvas" ref={container} aria-label="오프라인 지도"/>
    <aside className="map-info" aria-label="지도 좌표 정보">
      <div>중심: {center?`${center[0].toFixed(6)}, ${center[1].toFixed(6)}`:'—'}</div>
      <div>Zoom: <span data-testid="zoom">{zoom??'—'}</span></div>
      <div data-testid="clicked">클릭: {clicked?`${clicked[0].toFixed(6)}, ${clicked[1].toFixed(6)}`:'지도를 클릭하세요'}</div>
      {info?.layers.elevation.available&&<div data-testid="elevation-value">고도: {height||'지도를 클릭하세요'}</div>}
      {activeLayer==='고도 지도'&&<small className="elevation-legend">고도 색상: 낮음 <span/> 높음<br/>{info?.layers.elevation.minElevation}–{info?.layers.elevation.maxElevation} m · {info?.layers.elevation.verticalDatum}</small>}
      <small>EPSG:3857 · {info?.osm.mode==='online'?'온라인 OSM 허용':'오프라인'} · 파랑: 기본 지도 · 노랑: 상세 지역</small>
      {info?.mode==='multi'&&mapInstance&&<DetailLocations map={mapInstance} sources={info.sources}/>}
      {info?.mode==='multi'&&<details data-testid="map-sources"><summary>지도 데이터 {info.sources.length}개 · 자동 해상도 선택</summary>
        <ul>{info.sources.map(source=><li key={source.id}>{source.name} · {source.role==='base'?'기본':'상세'} · Zoom {source.minZoom}–{source.maxZoom} · 우선순위 {source.priority} · {source.status==='ready'?(source.usageConfirmed?'사용 중':'메타데이터만'):source.status==='disabled'?'비활성':'사용 불가'}</li>)}</ul>
        <small>상세 타일이 없으면 가능한 낮은 줌 타일을 확대 표시합니다.</small>
        {info.warnings.map((warning,index)=><small key={index}>{warning}</small>)}
      </details>}
      {info&&!info.layers.street.available&&<><small>일반 지도 데이터가 준비되지 않았습니다.</small>{info.osm.reason&&<small>{info.osm.reason}</small>}</>}
    </aside>
    <button className="map-data-help" onClick={()=>help.current?.showModal()}>지도 데이터 준비</button>
    <dialog ref={help} className="building-dialog" aria-label="지도 데이터 준비">
      <h2>지도 데이터 준비</h2>
      <p>위성영상 TPK에는 도로·건물명 지도와 실제 고도값이 포함되지 않습니다. 각 데이터를 별도로 준비하세요.</p>
      <ul>{(['satellite','street','elevation'] as const).map(id=><li key={id}>
        <strong>{{satellite:'위성영상',street:'일반 지도',elevation:'고도 지도'}[id]}</strong>: {info?.layers[id].available?'사용 가능':info?.layers[id].reason||'메타데이터 확인 중'}
      </li>)}</ul>
      <p>OpenStreetMap 일반 지도: <code>data/osm/south-korea.osm.pbf</code>에 원본을 복사하고 메뉴 7로 준비하세요. 메뉴 3은 새 PBF를 감지하면 자동으로 준비합니다. 최초 변환에는 Docker가 필요하며, 이후에는 준비된 데이터를 재사용합니다.</p>
      <p>별도 일반 지도 TPK: <code>data/street/map.tpk</code> 또는 <code>data/street/maps.json</code>에 사용 허가된 도로·지명 TPK를 등록하세요. 단일 TPK는 <code>STREET_USAGE_CONFIRMED=true</code>로 설정합니다.</p>
      <p>고도 지도: 미터 단위 DEM GeoTIFF를 <code>data/elevation/source/dem.tif</code>에 복사하고 실행 메뉴 6으로 변환하세요. 자세한 내용은 README의 일반 지도·고도 지도 항목을 참고하세요.</p>
      <p>파일·설정 변경 후 서버를 재시작하고 새로고침하세요. 준비되지 않은 레이어는 선택 목록에 표시되지 않습니다.</p>
      <button onClick={()=>help.current?.close()}>닫기</button>
    </dialog>
    <div className="map-bottom-tools">
      {message&&<p role="status" className="map-status">{message}</p>}
      {mapInstance&&<MapMeasurements map={mapInstance} onRegisterBuilding={setBuildingPoint}/>}
    </div>
    {mapInstance&&<MapBuildings map={mapInstance} requestedPoint={buildingPoint} onRequestClosed={()=>setBuildingPoint(null)}/>}
  </section>;
}
