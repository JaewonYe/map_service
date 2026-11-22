'use client';
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import L from 'leaflet';
import type {Building} from '../lib/buildings/model';
import {parseBuilding} from '../lib/buildings/model';
import type {Coordinate} from '../lib/map-measure';
import {useMapPointDrawing} from './useMapPointDrawing';
import {useMapEditHandles} from './useMapEditHandles';

type Props = {map:L.Map; building:Building; onSaved:(building:Building)=>void; onCancel:()=>void; onBusy:(busy:boolean)=>void};
export default function FacilityPositionEditor({map,building,onSaved,onCancel,onBusy}:Props) {
  const [point,setPoint]=useState<Coordinate>([building.latitude,building.longitude]);
  const [latitude,setLatitude]=useState(String(building.latitude)),[longitude,setLongitude]=useState(String(building.longitude));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(false),saving=useRef(false),abort=useRef<AbortController|null>(null);
  const panel=useRef<HTMLElement>(null),errorElement=useRef<HTMLParagraphElement>(null);
  const move=useCallback((next:Coordinate)=>{
    if(saving.current)return;
    try {const value=parseBuilding({...building,latitude:next[0],longitude:next[1]});
      const roundedLat=Number(value.latitude.toFixed(7));
      const normalized:Coordinate=[Math.sign(roundedLat)*Math.min(Math.abs(roundedLat),85.0511287),Number(value.longitude.toFixed(7))];
      // Rounding at the Web Mercator limit must stay inside the existing API range.
      setPoint(normalized);setLatitude(String(normalized[0]));setLongitude(String(normalized[1]));setError('');
    }catch(error){setError(error instanceof Error?error.message:'좌표를 확인하세요.');}
  },[building]);
  useMapPointDrawing(map,!busy,move);
  useMapEditHandles(map,{points:[point],selected:0,disabled:busy,position:true,select:()=>{},start:()=>{},move:(_,p)=>move(p),end:(_,p)=>move(p)});
  useEffect(()=>{
    const group=L.layerGroup().addTo(map);
    L.circleMarker([building.latitude,building.longitude],{radius:10,color:'var(--color-accent)',weight:3,dashArray:'3 3',fillOpacity:0.1,interactive:false,className:'facility-position-original'})
      .bindTooltip('원래 저장 위치').addTo(group);
    L.polyline([[building.latitude,building.longitude],[point[0],point[1]]],{color:'var(--color-danger)',weight:2,dashArray:'7 5',interactive:false,className:'facility-position-path'}).addTo(group);
    return()=>{group.remove();};
  },[map,building,point]);
  const dirty=point[0]!==building.latitude||point[1]!==building.longitude||latitude!==String(building.latitude)||longitude!==String(building.longitude);
  useEffect(()=>{
    alive.current=true;panel.current?.focus({preventScroll:true});
    return()=>{alive.current=false;abort.current?.abort();map.getContainer().focus({preventScroll:true});};
  },[map]);
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!saving.current){event.preventDefault();onCancel();}};
    document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);
  },[onCancel]);
  useEffect(()=>{
    if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  useEffect(()=>{if(error)errorElement.current?.focus();},[error]);
  function numericPoint():Coordinate {
    if(!latitude.trim()||!longitude.trim())throw Error('위도와 경도를 모두 입력하세요.');
    const value=parseBuilding({...building,latitude:Number(latitude),longitude:Number(longitude)});
    return [value.latitude,value.longitude];
  }
  async function save(event:FormEvent) {
    event.preventDefault();if(saving.current)return;
    let next:Coordinate;try{next=numericPoint();}catch(error){setError(error instanceof Error?error.message:'좌표를 확인하세요.');return;}
    saving.current=true;setBusy(true);onBusy(true);setError('');abort.current=new AbortController();
    try{
      // Omitting boundary uses the existing PUT preservation rule; never translate the polygon.
      const {boundary:_boundary,...original}=building;
      const response=await fetch(`/api/buildings/${building.id}`,{method:'PUT',signal:abort.current.signal,
        headers:{'Content-Type':'application/json','If-Match':`"${building.version}"`},body:JSON.stringify({...original,latitude:next[0],longitude:next[1]})});
      const body=await response.json();if(!response.ok)throw Error(body.error||'위치를 저장하지 못했습니다.');
      if(alive.current)onSaved(body.building);
    }catch(error){if(alive.current)setError(`${error instanceof Error?error.message:'저장 실패'} 미저장 위치와 입력은 유지됩니다. 일시 오류는 재시도하고, 버전 충돌은 취소 후 시설을 다시 열어 최신 정보를 확인하세요.`);}
    finally{saving.current=false;onBusy(false);if(alive.current)setBusy(false);}
  }
  return <section ref={panel} tabIndex={-1} className="facility-boundary-editor facility-position-editor" aria-label="시설 위치 수정" aria-busy={busy}>
    <form onSubmit={save} autoComplete="off" className="position-editor-form">
      <div className="boundary-editor-content"><h2>{building.name} · 위치 수정</h2>
        <p>‘이동’ 마커를 끌거나 빈 지도에서 새 위치를 선택하세요. 숫자 좌표로도 수정할 수 있습니다.</p>
        <p className="position-warning">대표 지점만 이동합니다. 저장된 경계 좌표는 유지됩니다.</p>
        <p>원래 저장 위치: {building.latitude.toFixed(7)}, {building.longitude.toFixed(7)}</p>
        <output aria-live="polite" data-testid="position-draft">미저장 위치: {point[0].toFixed(7)}, {point[1].toFixed(7)}</output>
        <fieldset disabled={busy}><div className="boundary-coordinate-entry">
          <label>위치 위도<input name="position-latitude" autoComplete="off" type="number" inputMode="decimal" step="any" min={-85.05112878} max={85.05112878} required value={latitude} onChange={e=>setLatitude(e.target.value)}/></label>
          <label>위치 경도<input name="position-longitude" autoComplete="off" type="number" inputMode="decimal" step="any" min={-180} max={180} required value={longitude} onChange={e=>setLongitude(e.target.value)}/></label>
        </div><div className="boundary-actions">
          <button type="button" onClick={()=>{try{move(numericPoint());}catch(error){setError(error instanceof Error?error.message:'좌표를 확인하세요.');}}}>좌표 미리보기</button>
          <button type="button" onClick={()=>move([building.latitude,building.longitude])}>원래 위치로 되돌리기</button>
          <button type="button" onClick={()=>map.getContainer().focus()}>지도 이동</button>
        </div></fieldset>
        {error&&<p ref={errorElement} tabIndex={-1} role="alert" className="building-error">{error}</p>}
      </div>
      <div className="boundary-editor-footer"><button className="primary" type="submit" disabled={busy}>{busy?'위치 저장 중…':'위치 저장'}</button><button type="button" disabled={busy} onClick={onCancel}>위치 수정 취소</button></div>
    </form><small>저장 전에는 서버 위치를 바꾸지 않습니다 · Esc 취소</small>
  </section>;
}
