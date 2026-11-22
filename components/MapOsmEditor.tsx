'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import L from 'leaflet';
import {classes,validateObject,vertices,type Kind,type MapObject,type Geometry,type ObjectValue} from '../lib/osm/edit-model';
import type {Coordinate} from '../lib/map-measure';
import type {Bounds} from '../lib/tiles/tpk';
import {useMapPointDrawing} from './useMapPointDrawing';
import {useMapEditHandles} from './useMapEditHandles';
type View={revision:number;dataset:string;bounds:Bounds;editable:boolean;reason:string;objects:MapObject[];changes:MapObject[];changeCount:number};
type Selection={revision:number;dataset:string;bounds:Bounds;object:MapObject;original:MapObject|null};
const kindNames:Record<Kind,string>={road:'도로',building:'건물 외곽',place:'지명',poi:'표시 지점'};
const geometryOf=(kind:Kind,points:Coordinate[]):Geometry=>({type:kind==='road'?'LineString':kind==='building'?'Polygon':'Point',coordinates:kind==='road'?points.map(p=>[p[1],p[0]]):kind==='building'?[points.length?[...points,points[0]].map(p=>[p[1],p[0]]):[]]:points[0]?[points[0][1],points[0][0]]:[]});
async function response(r:Response){const body=await r.json();if(!r.ok)throw Error(body.error||'일반 지도 요청을 처리하지 못했습니다.');return body;}
export default function MapOsmEditor({map,onExit,onChanged}:{map:L.Map;onExit:()=>void;onChanged:()=>void}){
 const [view,setView]=useState<View|null>(null),[selection,setSelection]=useState<Selection|null>(null),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [name,setName]=useState(''),[kind,setKind]=useState<Kind>('road'),[category,setCategory]=useState('residential'),[points,setPoints]=useState<Coordinate[]>([]),[selected,setSelected]=useState(0),[past,setPast]=useState<Coordinate[][]>([]);
 const [latitude,setLatitude]=useState(''),[longitude,setLongitude]=useState(''),[candidates,setCandidates]=useState<MapObject[]>([]),[offset,setOffset]=useState(0);
 const [confirmation,setConfirmation]=useState<{type:'hide'|'restore'|'discard';next?:()=>void}|null>(null);
 const alive=useRef(false),saving=useRef(false),sequence=useRef(0),querySequence=useRef(0),controller=useRef<AbortController|null>(null),pointRef=useRef(points),dragBefore=useRef<Coordinate[]|null>(null),baseline=useRef('');
 const panel=useRef<HTMLElement>(null),errorElement=useRef<HTMLParagraphElement>(null);
 const input=JSON.stringify({name,kind,category,points}),dirty=editing&&input!==baseline.current;
 const validation=useMemo(()=>{try{return {value:validateObject({name,kind,class:category,geometry:geometryOf(kind,points)},selection?.bounds||view?.bounds),error:''};}catch(e){return {value:null,error:e instanceof Error?e.message:'형상을 확인하세요.'};}},[name,kind,category,points,selection,view?.bounds]);
 const commit=useCallback((next:Coordinate[],history=true)=>{if(saving.current)return;const previous=pointRef.current;if(history)setPast(p=>[...p.slice(-99),previous]);pointRef.current=next;setPoints(next);setError('');},[]);
 const limit=kind==='road'?256:kind==='building'?128:1,min=kind==='road'?2:kind==='building'?3:1;
 const add=useCallback((p:Coordinate)=>{if(saving.current)return;if(kind==='place'||kind==='poi'){commit([p]);setSelected(0);}else if(pointRef.current.length<limit){commit([...pointRef.current,p]);setSelected(pointRef.current.length-1);}else setError(`정점은 최대 ${limit}개입니다.`);},[kind,limit,commit]);
 useMapPointDrawing(map,editing&&!busy,add);
 useMapEditHandles(map,{scope:'osm',points:editing?points:[],selected,disabled:!editing||busy,position:kind==='place'||kind==='poi',select:setSelected,start:()=>{dragBefore.current=pointRef.current;},move:(index,p)=>commit(pointRef.current.map((q,i)=>i===index?p:q),false),end:()=>{if(dragBefore.current){const before=dragBefore.current;setPast(p=>[...p.slice(-99),before]);dragBefore.current=null;}},insert:editing&&points.length<limit&&kind==='building'?(after,p)=>{commit([...pointRef.current.slice(0,after+1),p,...pointRef.current.slice(after+1)]);setSelected(after+1);}:undefined});
 const load=useCallback(async()=>{
  const serial=++querySequence.current;setLoading(true);setError('');
  const b=map.getBounds(),bbox=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(',');
  try{const body=await response(await fetch(`/api/osm/objects?bbox=${bbox}&zoom=${map.getZoom()}&offset=${offset}`,{cache:'no-store'}));if(alive.current&&serial===querySequence.current){setView(body);setNotice(body.objects.length?'':'현재 화면에 선택할 객체가 없습니다. 위치를 옮기거나 새 객체를 추가하세요.');}}
  catch(e){if(alive.current&&serial===querySequence.current)setError(e instanceof Error?e.message:'조회 실패');}
  finally{if(alive.current&&serial===querySequence.current)setLoading(false);}
 },[map,offset]);
 useEffect(()=>{alive.current=true;panel.current?.focus({preventScroll:true});return()=>{alive.current=false;sequence.current++;querySequence.current++;controller.current?.abort();map.getContainer().focus({preventScroll:true});};},[map]);
 useEffect(()=>{void load();map.on('moveend zoomend',load);return()=>{map.off('moveend zoomend',load);};},[map,load]);
 useEffect(()=>{if(view)onChanged();},[view?.revision,view?.dataset,onChanged]);
 useEffect(()=>{if(error)errorElement.current?.focus({preventScroll:false});},[error]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 function guarded(next:()=>void){if(saving.current)return;if(dirty)setConfirmation({type:'discard',next});else next();}
 const choose=useCallback(async(key:string)=>{
  if(saving.current)return;const serial=++sequence.current;setError('');setCandidates([]);
  try{const s:Selection=await response(await fetch(`/api/osm/objects/${encodeURIComponent(key)}`,{cache:'no-store'}));if(alive.current&&serial===sequence.current){setSelection(s);setEditing(false);setPast([]);setConfirmation(null);}}
  catch(e){if(alive.current&&serial===sequence.current)setError(e instanceof Error?e.message:'객체 조회 실패');}
 },[]);
 useEffect(()=>{
  if(editing||busy)return;
  const pick=(event:L.LeafletMouseEvent)=>{
   const click=event.containerPoint;const near=(view?.objects||[]).map(o=>({o,d:distance(o,map,click)})).filter(x=>x.d<=12).sort((a,b)=>a.d-b.d).slice(0,10).map(x=>x.o);
   if(near.length===1)void choose(near[0].key);else{setCandidates(near);setNotice(near.length?`${near.length}개 겹친 후보 중 선택하세요.`:'이 위치에 선택할 객체가 없습니다.');}
  };map.on('click',pick);return()=>{map.off('click',pick);};
 },[map,view,editing,busy,choose]);
 useEffect(()=>{
  const geometry=editing?(points.length?geometryOf(kind,points):null):selection?.object.geometry;
  if(!geometry)return;const group=L.layerGroup().addTo(map);
  try{L.geoJSON({type:'Feature',properties:{},geometry} as any,{interactive:false,style:{color:editing?'var(--color-danger)':'var(--color-accent)',weight:3,dashArray:editing?'7 5':undefined,fillOpacity:.15},pointToLayer:(_,p)=>L.circleMarker(p,{interactive:false,radius:8,color:editing?'var(--color-danger)':'var(--color-accent)'})}).addTo(group);}catch{}
  return()=>{group.remove();};
 },[map,selection,editing,kind,points]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key!=='Escape'||saving.current)return;e.preventDefault();if(confirmation)setConfirmation(null);else if(editing)guarded(()=>setEditing(false));else onExit();};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);});
 function begin(object?:MapObject){
  const k=(object?.kind||kind) as Kind,c=object?.class||({road:'residential',building:'yes',place:'town',poi:'parking'}[k]),n=object?.name||'',p=object?.geometry?vertices(object.geometry).map(q=>[q[1],q[0]] as Coordinate):[];
  setKind(k);setCategory(c);setName(n);pointRef.current=p;setPoints(p);setPast([]);setSelected(0);setEditing(true);setConfirmation(null);setError('');baseline.current=JSON.stringify({name:n,kind:k,category:c,points:p});
 }
 async function mutate(action:'add'|'update'|'hide'|'restore'|'reapply'){
  if(saving.current)return;const target=selection;const snapshot=target||view;if(!snapshot)return;
  saving.current=true;setBusy(true);setError('');controller.current=new AbortController();
  try{const r=await response(await fetch('/api/osm/objects',{method:'POST',signal:controller.current.signal,headers:{'Content-Type':'application/json','If-Match':`"${snapshot.revision}"`},body:JSON.stringify({action,key:target?.object.key,dataset:snapshot.dataset,fingerprint:action==='reapply'?target?.original?.fingerprint:target?.object.fingerprint,value:validation.value})}));
   if(!alive.current)return;setEditing(false);setConfirmation(null);setSelection(null);setPast([]);onChanged();await load();if(r.object&&action!=='hide'&&action!=='restore'){saving.current=false;await choose(r.key);}setNotice(action==='restore'?'로컬 수정을 해제했습니다.':'일반 지도 PNG에 로컬 수정을 반영했습니다.');
  }catch(e){if(alive.current)setError(`${e instanceof Error?e.message:'저장 실패'} 입력과 초안은 유지됩니다.`);}
  finally{saving.current=false;if(alive.current)setBusy(false);}
 }
 function moveCoordinate(){try{if(!latitude.trim()||!longitude.trim())throw Error('위도/경도를 입력하세요.');const lat=Number(latitude),lon=Number(longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85.05112878||Math.abs(lon)>180)throw Error('허용 범위의 좌표를 입력하세요.');return [lat,lon] as Coordinate;}catch(e){setError(e instanceof Error?e.message:'좌표 오류');return null;}}
 return <section className="facility-boundary-editor osm-editor" ref={panel} tabIndex={-1} aria-label="일반 지도 편집" aria-busy={busy}>
  <div className="boundary-editor-content"><h2>일반 지도 편집</h2><p>로컬 OSM 지도만 수정합니다. 시설 정보·원본 파일·공개 OSM에는 적용하지 않습니다.</p>
   {loading&&<p role="status">화면 범위 객체를 조회하는 중…</p>}
   {error&&<p ref={errorElement} tabIndex={-1} role="alert" className="building-error">{error}</p>}
   {notice&&<p role="status">{notice}</p>}
   <details><summary>편집 범위·데이터 준비</summary><p>준비된 OSM 범위 안에서만 저장합니다. zoom14–19에서 조회하며, street TPK·XYZ·온라인 지도는 지원하지 않습니다. 구형 데이터는 원본 PBF를 prepare-osm --force 또는 실행 메뉴 7로 다시 준비하세요.</p></details>
   {view?.reason&&<p className="position-warning">{view.reason}</p>}
   <fieldset disabled={busy}>
    <button type="button" onClick={()=>void load()}>현재 화면 다시 조회</button>
    {!selection&&!editing&&<><h3>화면 안 객체</h3><ul className="osm-object-list" aria-label="일반 지도 객체">{(candidates.length?candidates:view?.objects||[]).map(o=><li key={o.key}><button type="button" onClick={()=>guarded(()=>void choose(o.key))}>{o.name||'이름 없음'} · {kindNames[o.kind as Kind]||o.kind} · {o.state}</button></li>)}</ul>
      <label htmlFor="osm-new-kind">새 객체 유형</label><select id="osm-new-kind" name="osm-new-kind" value={kind} onChange={e=>setKind(e.target.value as Kind)}>{Object.entries(kindNames).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select><button type="button" disabled={!view?.editable} onClick={()=>{setSelection(null);begin();}}>새 일반 지도 객체 추가</button>
    </>}
    {selection&&!editing&&<><h3>{selection.object.name||'이름 없음'}</h3><dl><dt>대상</dt><dd>{selection.object.key} · {selection.object.source==='local'?'로컬 신규':'OSM 원본'} · {selection.object.state}</dd><dt>분류/형상</dt><dd>{selection.object.kind} / {selection.object.class} · {selection.object.geometry?.type||'지원하지 않는 형상'}</dd></dl>
     <details><summary>현재 객체 형상 좌표</summary><pre className="osm-geometry">{JSON.stringify(selection.object.geometry,null,2)||'지원하지 않는 형상'}</pre></details>
     {selection.object.reason&&<p className="position-warning">{selection.object.reason}</p>}
     {selection.original&&selection.object.state==='conflict'&&<p>현재 원본: {selection.original.name} · {selection.original.kind}/{selection.original.class}</p>}
     <button type="button" onClick={()=>guarded(()=>void choose(selection.object.key))}>선택 객체 최신 정보 조회</button>
     <div className="boundary-actions"><button type="button" disabled={!selection.object.editable&&selection.object.state!=='conflict'} onClick={()=>begin(selection.object)}>객체 수정</button>
     <button className="danger" type="button" disabled={!selection.object.editable} onClick={()=>setConfirmation({type:'hide'})}>로컬 삭제</button>
     {selection.object.state!=='original'&&<button type="button" onClick={()=>setConfirmation({type:'restore'})}>{selection.object.source==='local'?'신규 객체 제거':'원본으로 복원'}</button>}
     <button type="button" onClick={()=>{setSelection(null);setConfirmation(null);}}>객체 선택 해제</button></div>
    </>}
    {editing&&<><h3>{selection?'객체 초안 수정':'새 객체 초안'}</h3>
     <label>지도 객체 이름<input name="osm-name" autoComplete="off" maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
     <label htmlFor="osm-class">표시 분류</label><select id="osm-class" name="osm-class" value={category} onChange={e=>setCategory(e.target.value)}>{(classes[kind] as readonly string[]).map(c=><option key={c}>{c}</option>)}</select>
     <p>숫자 핸들은 이동, 지도 클릭은 끝에 추가합니다. 중간 삽입·삭제는 아래 좌표와 선택 버튼으로도 가능합니다.</p>
     <output aria-live="polite">정점 {points.length}/{limit} · {validation.error||'저장 가능한 형상'}</output>
     <label htmlFor="osm-vertex">선택 지도 정점</label><select id="osm-vertex" name="osm-vertex" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{points.length?points.map((_,i)=><option key={i} value={i}>{i+1}번</option>):<option value={0}>정점 없음</option>}</select>
     <div className="boundary-actions"><button type="button" disabled={!past.length} onClick={()=>{const previous=past.at(-1)!;setPast(p=>p.slice(0,-1));commit(previous,false);setSelected(0);}}>지도 직전 조작 되돌리기</button>
     <button className="danger" type="button" disabled={points.length<=min} onClick={()=>{commit(points.filter((_,i)=>i!==selected));setSelected(0);}}>선택 지도 정점 삭제</button></div>
     <p>선택 삭제는 최소 {min}개를 유지합니다. 전체 객체 삭제는 편집 취소 후 ‘로컬 삭제’를 사용하세요.</p>
     <details><summary>지도 정점 좌표 입력</summary><div className="boundary-coordinate-entry"><label>지도 정점 위도<input name="osm-lat" autoComplete="off" type="number" inputMode="decimal" step="any" value={latitude} onChange={e=>setLatitude(e.target.value)}/></label><label>지도 정점 경도<input name="osm-lon" autoComplete="off" type="number" inputMode="decimal" step="any" value={longitude} onChange={e=>setLongitude(e.target.value)}/></label></div>
      <div className="boundary-actions"><button type="button" disabled={!points.length} onClick={()=>{const p=moveCoordinate();if(p)commit(points.map((q,i)=>i===selected?p:q));}}>선택 지도 정점 수정</button><button type="button" disabled={points.length>=limit} onClick={()=>{const p=moveCoordinate();if(p)add(p);}}>지도 정점 끝에 추가</button><button type="button" disabled={!points.length||points.length>=limit} onClick={()=>{const p=moveCoordinate();if(p){commit([...points.slice(0,selected+1),p,...points.slice(selected+1)]);setSelected(selected+1);}}}>선택 지도 정점 뒤에 삽입</button></div>
      <ol className="boundary-coordinate-list">{points.map((p,i)=><li key={i}>{i+1}: {p[0].toFixed(7)}, {p[1].toFixed(7)}</li>)}</ol>
     </details>
     {selection?.object.state==='conflict'&&<p className="position-warning">충돌한 원본을 검토한 뒤 명시적으로 재적용해야 합니다. 원본이 없거나 읽기 전용이면 수정 해제만 가능합니다.</p>}
    </>}
    {confirmation&&<div className="building-delete-confirm" role="group" aria-label="일반 지도 변경 확인"><strong>{selection?.object.name||name||'이름 없음'}</strong><p>{confirmation.type==='hide'?(selection?.object.source==='local'?'이 로컬 신규 객체를 제거할까요? 원본 파일은 보존합니다.':'이 객체만 로컬 지도에서 숨길까요? 원본 파일은 보존합니다.'):confirmation.type==='restore'?'이 로컬 수정만 해제할까요? 신규 객체는 제거하고 원본 객체는 원래 표시로 돌아갑니다.':'미저장 초안을 버리고 전환할까요?'}</p><button className="danger" type="button" onClick={()=>{if(confirmation.type==='discard'){const next=confirmation.next;setConfirmation(null);next?.();}else void mutate(confirmation.type);}}>일반 지도 변경 확인</button><button type="button" onClick={()=>setConfirmation(null)}>일반 지도 변경 돌아가기</button></div>}
    <details><summary>로컬 수정 내역 ({view?.changeCount||0})</summary><ul className="osm-object-list" aria-label="일반 지도 수정 내역">{view?.changes.map(o=><li key={o.key}><button type="button" onClick={()=>guarded(()=>void choose(o.key))}>{o.name||'이름 없음'} · {o.state==='conflict'?'충돌':o.state==='hidden'?'로컬 삭제':'로컬 수정'} · {o.key}</button></li>)}</ul><button type="button" disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-50))}>이전 수정 50개</button><button type="button" disabled={offset+50>=(view?.changeCount||0)} onClick={()=>setOffset(n=>n+50)}>다음 수정 50개</button></details>
   </fieldset>
  </div>
  <div className="boundary-editor-footer">{editing&&<><button className="primary" type="button" disabled={busy||!validation.value||selection?.object.state==='conflict'&&!selection.original?.editable} onClick={()=>void mutate(selection?.object.state==='conflict'?'reapply':selection?'update':'add')}>{busy?'지도 저장 중…':selection?.object.state==='conflict'?'원본 검토 후 재적용':'일반 지도 저장'}</button><button type="button" disabled={busy} onClick={()=>{setEditing(false);setConfirmation(null);}}>지도 초안 취소</button></>}<button type="button" disabled={busy} onClick={()=>guarded(onExit)}>일반 지도 편집 종료</button></div>
 </section>;
}
function distance(object:MapObject,map:L.Map,click:L.Point){
 if(!object.geometry)return Infinity;const p=vertices(object.geometry).map(q=>map.latLngToContainerPoint([q[1],q[0]]));if(!p.length)return Infinity;if(object.geometry.type==='Point')return p[0].distanceTo(click);
 if(object.geometry.type==='Polygon'){let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>click.y)!==(p[j].y>click.y)&&click.x<(p[j].x-p[i].x)*(click.y-p[i].y)/(p[j].y-p[i].y)+p[i].x)inside=!inside;if(inside)return 0;}
 let nearest=Infinity;const chain=object.geometry.type==='Polygon'?[...p,p[0]]:p;for(let i=0;i<chain.length-1;i++){const a=chain[i],b=chain[i+1],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((click.x-a.x)*dx+(click.y-a.y)*dy)/(dx*dx+dy*dy)));nearest=Math.min(nearest,Math.hypot(click.x-a.x-t*dx,click.y-a.y-t*dy));}return nearest;
}
