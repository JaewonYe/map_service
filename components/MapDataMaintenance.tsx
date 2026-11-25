'use client';
import {useEffect,useRef,useState} from 'react';
const labels={delete:'지도 삭제',clear:'전체 초기화',restore:'백업 복원'} as const;
type Operation=keyof typeof labels;
export default function MapDataMaintenance({info,job,onChanged}:{info:any;job:any;onChanged:()=>Promise<void>}){
 const [includeLegacy,setLegacy]=useState(true),[confirm,setConfirm]=useState<any>(null),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const heading=useRef<HTMLHeadingElement>(null),alert=useRef<HTMLParagraphElement>(null),trigger=useRef<HTMLButtonElement|null>(null),saving=useRef(false);
 const pending=!!info?.maintenance?.pending,operations:any[]=info?.maintenance?.operations||[],ready=info?.worker?.online&&info.worker.maintenanceVersion===1;
 const backups=operations.filter(o=>o.backupId&&!operations.some(r=>r.state==='completed'&&r.request.operation==='restore'&&r.request.backupId===o.backupId));
 useEffect(()=>{if(confirm)heading.current?.focus();},[confirm]);useEffect(()=>{if(error)alert.current?.focus();},[error]);
 function open(operation:Operation,event:React.MouseEvent<HTMLButtonElement>,backupId?:string){trigger.current=event.currentTarget;setError('');setText('');setConfirm({operation,backupId,targetId:job?.id,name:job?.request?.name||'선택 작업',registryRevision:info.registry.revision,includeLegacy:operation==='clear'&&includeLegacy});}
 function close(){setConfirm(null);setText('');setError('');trigger.current?.focus();}
 async function submit(){if(!confirm||saving.current)return;saving.current=true;setBusy(true);setError('');try{
  const r=await fetch('/api/downloads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'maintenance',...confirm,confirmation:text})});const v=await r.json();if(!r.ok)throw Error(v.error||'지도 정리를 요청하지 못했습니다.');setConfirm(null);setText('');await onChanged();
 }catch(e){setError((e as Error).message);}finally{saving.current=false;setBusy(false);}}
 return <section className="download-transfer" aria-labelledby="map-maintenance-title"><h3 id="map-maintenance-title">지도 데이터 삭제·초기화</h3>
  <p>삭제할 파일은 서버의 백업 폴더로 옮깁니다. 백업은 디스크 공간을 계속 사용하며, 시설·경계·OSM 수정 내역과 인증 설정은 보존합니다.</p>
  {!ready&&<p className="position-warning">삭제 기능을 지원하는 worker가 연결되지 않았습니다. web과 worker를 함께 업데이트·실행하세요.</p>}
  {pending&&<p role="status">지도 정리 중입니다. 새 다운로드·등록은 완료 후 사용할 수 있습니다. 이 페이지를 닫아도 worker에서 계속 처리합니다.</p>}
  <label className="download-check"><input name="clear-legacy-maps" type="checkbox" checked={includeLegacy} disabled={!ready||pending||busy} onChange={e=>setLegacy(e.target.checked)}/>전체 초기화에 직접 설치한 위성·일반·고도 지도도 포함</label>
  {includeLegacy&&ready&&!info.worker.legacyReset&&<p className="position-warning">직접 설치한 지도 경로가 worker에 연결되지 않았습니다. worker를 업데이트하거나 위 선택을 해제하세요.</p>}
  <div className="download-actions">
   {job&&<button type="button" className="danger" disabled={!ready||pending||busy||['queued','running'].includes(job.state)} onClick={e=>open('delete',e)}>선택 작업·지도 삭제</button>}
   <button type="button" className="danger" disabled={!ready||pending||busy||includeLegacy&&!info.worker.legacyReset} onClick={e=>open('clear',e)}>지도 데이터 전체 초기화</button>
  </div>
  {confirm&&<div className="building-delete-confirm" role="group" aria-labelledby="map-maintenance-confirm-title">
   <h4 id="map-maintenance-confirm-title" tabIndex={-1} ref={heading}>{labels[confirm.operation as Operation]} 확인</h4>
   {confirm.operation==='delete'?<p>“{confirm.name}”의 패키지·이전 ZIP·연결된 재등록 기록을 함께 백업으로 옮깁니다. 적용 중이면 지도 선택에서도 해제합니다. 다른 위성 패키지는 유지하고 공유 원본 파일은 남깁니다. 패키지가 없는 실패 작업은 기록만 정리합니다.</p>:confirm.operation==='clear'?<p>진행 중·대기 중 다운로드를 취소하고 다운로드 이력·패키지·이전 ZIP·위성/고도 원본·적용 상태{confirm.includeLegacy?'와 직접 설치한 지도 파일':''}를 백업으로 옮깁니다. 별도로 실행한 CLI·지도 준비 도구는 먼저 종료하세요.</p>:<p>선택한 백업의 파일과 적용 상태를 복원합니다. 복원할 위치에 새 파일이 있거나 적용 상태가 달라졌으면 덮어쓰지 않고 중단합니다. 취소했던 다운로드는 복원 후에도 다시 실행하지 않습니다.</p>}
   <label htmlFor="map-maintenance-phrase">확인 문구: {labels[confirm.operation as Operation]}</label><input id="map-maintenance-phrase" name="map-maintenance-phrase" autoComplete="off" spellCheck={false} value={text} disabled={busy} onChange={e=>setText(e.target.value)}/>
   {error&&<p role="alert" tabIndex={-1} ref={alert} className="building-error">{error}</p>}
   <div className="download-actions"><button type="button" className="danger" disabled={busy||text!==labels[confirm.operation as Operation]} onClick={()=>void submit()}>{busy?'정리 요청 중…':'확인하고 '+labels[confirm.operation as Operation]}</button><button type="button" disabled={busy} onClick={close}>정리 취소</button></div>
  </div>}
  {!!operations.length&&<div aria-live="polite"><h4>최근 정리 결과</h4>{operations.slice(0,5).map(o=><div className="download-job-item" key={o.id}><p>{labels[o.request.operation as Operation]} · {o.state==='completed'?'완료':o.state==='failed'?'실패':o.state==='running'?'진행 중':'대기'} · {o.stage}</p>{o.error&&<p className="building-error">{o.error}</p>}{o.recoveryRequired&&<p>이동 기록과 백업을 보존했습니다. 파일 잠금·권한 등 원인을 해소하면 worker가 자동 재시도합니다.</p>}</div>)}</div>}
  {!!backups.length&&<details><summary>복원 가능한 백업 {backups.length}개</summary><p>백업 이후 적용 변경이나 파일 충돌이 있으면 복원을 중단합니다. 백업은 각 지도 폴더의 .map-trash와 다운로드 폴더의 maintenance 기록으로 구성됩니다.</p>{backups.map(o=><div className="download-job-item" key={o.id}><p>{labels[o.request.operation as Operation]} · {new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'short'}).format(new Date(o.createdAt))}</p><small>백업 ID {o.backupId}</small><button type="button" disabled={!ready||pending||busy} onClick={e=>open('restore',e,o.backupId)}>이 백업 복원</button></div>)}</details>}
 </section>;
}
