'use client';
import {useEffect,useRef,useState} from 'react';
import type {PreparedSatellite} from '../lib/downloads/prepared';
import type {Bounds} from '../lib/tiles/tpk';
export default function DownloadedMapSelection({info,disabled,onChanged,onApplied,onView}:{info:any;disabled:boolean;onChanged:()=>Promise<void>;onApplied:()=>void;onView:(bounds:Bounds)=>void}){
 const [chosen,setChosen]=useState<string[]>([]),[dirty,setDirty]=useState(false),[revision,setRevision]=useState(0),[saving,setSaving]=useState(false),[submitted,setSubmitted]=useState(''),[error,setError]=useState('');
 const gate=useRef(false),alive=useRef(true),alert=useRef<HTMLParagraphElement>(null);const maps:PreparedSatellite[]=info?.preparedSatellites||[];
 const applied:string[]=info?.registry?.satellitePackages??(info?.registry?.layers?.satellite?[info.registry.layers.satellite]:[]),serverRevision=info?.registry?.revision??0,appliedKey=applied.join(',');
 const ready=info?.worker?.online&&info.worker.selectionVersion===1,locked=disabled||saving||!!submitted,available=maps.filter(p=>p.selectable),job=info?.jobs?.find((j:any)=>j.id===submitted);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!dirty&&!submitted){setChosen(applied);setRevision(serverRevision);}},[appliedKey,serverRevision,dirty,submitted]);
 useEffect(()=>{if(error)alert.current?.focus();},[error]);
 useEffect(()=>{if(!submitted||!job)return;if(job.state==='completed'){setSubmitted('');setDirty(false);setChosen(applied);setRevision(serverRevision);onApplied();}else if(['failed','cancelled','interrupted','partial'].includes(job.state)){setSubmitted('');setError(job.error||'선택 적용이 완료되지 않았습니다. 현재 적용 상태를 확인하세요.');}},[submitted,job?.state,serverRevision,appliedKey,onApplied]);
 function change(ids:string[]){setChosen(ids);setDirty(true);setError('');}
 function reset(){setChosen(applied);setRevision(serverRevision);setDirty(false);setError('');}
 async function apply(){if(gate.current)return;gate.current=true;setSaving(true);setError('');try{
  const r=await fetch('/api/downloads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'select',packageIds:chosen,registryRevision:revision})}),v=await r.json();if(!r.ok)throw Error(v.error||'표시 선택을 적용하지 못했습니다.');if(alive.current){setSubmitted(v.id);await onChanged();}
 }catch(e){if(alive.current)setError((e as Error).message);}finally{gate.current=false;if(alive.current)setSaving(false);}}
 return <section className="download-transfer" aria-labelledby="downloaded-map-selection-title"><h3 id="downloaded-map-selection-title">다운로드한 위성 지도 표시</h3>
  <p>표시할 지도를 선택한 뒤 ‘선택한 지도 표시’를 누르세요. 선택은 저장되며 미리보기와 홈 지도에서 함께 사용합니다.</p>
  <details><summary>겹치는 지도 선택 기준</summary><p>현재 화면의 실제 줌에 맞는 타일을 우선합니다. 같은 줌은 더 구체적인 지역 범위, 같은 범위는 나중에 선택한 자료를 우선합니다. 빈 타일은 다른 선택 지도로 대체합니다.</p></details>
  <p role="status">선택 {chosen.length}개 / 사용 가능 {available.length}개 · 현재 적용 {applied.length}개{submitted?' · 선택 적용 중…':''}</p>
  {!ready&&<p className="position-warning">표시 선택을 지원하는 worker가 연결되지 않았습니다. web과 worker를 함께 업데이트·실행하세요.</p>}
  {dirty&&revision!==serverRevision&&<p className="position-warning">등록 상태가 변경됐습니다. 입력한 선택을 유지했습니다. 적용된 선택으로 되돌린 뒤 다시 선택하세요.</p>}
  {error&&<p role="alert" tabIndex={-1} ref={alert} className="building-error">{error}</p>}
  {chosen.length>32&&<p className="building-error">함께 표시할 위성은 최대32개입니다. 일부 선택을 해제하세요.</p>}
  <div className="download-actions"><button type="button" disabled={locked||!available.length} onClick={()=>change([...available].reverse().map(p=>p.id))}>전체 선택</button><button type="button" disabled={locked||!chosen.length&&dirty} onClick={()=>change([])}>전체 해제</button><button type="button" disabled={locked||!dirty} onClick={reset}>적용된 선택으로 되돌리기</button><button type="button" className="primary" disabled={locked||!ready||!dirty||chosen.length>32||chosen.some(id=>!available.some(p=>p.id===id))} onClick={()=>void apply()}>{saving?'선택 요청 중…':submitted?'선택 적용 중…':'선택한 지도 표시'}</button><a className="download-link-button" href="#download-preview">미리보기로 이동</a></div>
  {!maps.length&&<p>아직 준비된 위성 패키지가 없습니다. 위성 다운로드를 완료하거나 이전 ZIP을 가져오세요.</p>}
  {!!maps.length&&<ul className="downloaded-map-list" aria-label="다운로드한 위성 지도">{maps.map(p=><li key={p.id}><label className="download-check"><input type="checkbox" name={'satellite-source-'+p.id} checked={chosen.includes(p.id)} disabled={locked||!p.selectable} onChange={e=>change(e.target.checked?[...chosen,p.id]:chosen.filter(id=>id!==p.id))}/>{p.name}</label><p>{applied.includes(p.id)?'현재 적용 중':'현재 미적용'} · 실제 줌 {p.zoomLevels.length?p.zoomLevels.join(', '):'선택 적용 시 검사'}</p>{p.reason&&<p className="building-error">{p.reason}</p>}{p.bounds&&<button type="button" disabled={locked} onClick={()=>onView(p.bounds!)}>{p.name} 영역 보기</button>}</li>)}</ul>}
  {info?.registry?.satelliteVisible===false&&<p>위성 표시를 모두 해제했습니다. 선택한 위성 없이 다른 위성 파일로 자동 대체하지 않습니다.</p>}
 </section>;
}
