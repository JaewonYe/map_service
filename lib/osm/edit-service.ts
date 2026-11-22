import {randomUUID} from 'node:crypto';
import {getOsmIndex,type OsmIndex} from './index';
import {getOsmEdits,type EditSnapshot} from './edit-store';
import {objectKey,validateObject,OsmEditError,intersectsBounds,type MapObject} from './edit-model';
import type {Bounds} from '../tiles/tpk';
export async function editView(){const index=await getOsmIndex(true),snapshot=await getOsmEdits().read();return {index,snapshot};}
export function detail(index:OsmIndex,snapshot:EditSnapshot,key:string){return index.reconcile(snapshot).find(x=>x.edit.key===key)?.object||index.source(key);}
export async function objects(request:Request){
 const {index,snapshot}=await editView(),p=new URL(request.url).searchParams;
 const offset=Number(p.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>500)throw new OsmEditError('수정 목록 offset은 0–500 정수여야 합니다.');
 const edits=index.reconcile(snapshot).map(x=>x.object);
 const base={revision:snapshot.revision,dataset:index.revision,bounds:index.metadata.bounds,editable:index.schemaVersion===2,reason:index.schemaVersion===2?'':'구형 schema1입니다. prepare-osm --force로 원본 PBF를 다시 준비하세요.',changes:edits.slice(offset,offset+50),changeCount:edits.length};
 if(p.get('changes')==='1')return {...base,objects:[]};
 const numbers=(p.get('bbox')||'').split(',').map(Number),zoom=Number(p.get('zoom'));
 if(numbers.length!==4||!numbers.every(Number.isFinite)||!Number.isInteger(zoom)||zoom<14||zoom>19)throw new OsmEditError('zoom14–19에서 화면 범위 bbox를 지정하세요.');
 const [west,south,east,north]=numbers;
 if(west>=east||south>=north||east-west>.25||north-south>.25||west< -180||east>180||south< -85.05112878||north>85.05112878)throw new OsmEditError('조회 bbox는 각 축 0.25도 이하의 유효한 범위여야 합니다. 확대하세요.',422);
 const bounds:Bounds={west,south,east,north},applied=index.reconcile(snapshot).filter(x=>x.object.state!=='conflict'),changed=new Set(applied.map(x=>x.edit.key));
 const result=index.objects(bounds,zoom).filter(x=>!changed.has(x.key));
 for(const item of applied)if(item.object.state!=='hidden'&&item.object.geometry&&intersectsBounds(item.object.geometry,bounds))result.push(item.object);
 if(result.length>200)throw new OsmEditError('객체가 너무 많습니다. 더 확대하세요.',422);
 return {...base,objects:result};
}
export async function change(value:any,expected:number){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new OsmEditError('수정 동작을 JSON 객체로 입력하세요.');
 const {index}=await editView();
 const key=value.action==='add'?`local:${randomUUID()}`:objectKey(value.key);
 const updated=await getOsmEdits().mutate(expected,async snapshot=>{
  // Re-read the published dataset inside the serialized mutation, never apply an old selection to a new base.
  const current=await getOsmIndex(true);
  if(value.dataset!==current.revision||current.revision!==index.revision)throw new OsmEditError('원본 데이터셋이 변경됐습니다. 초안은 유지됩니다. 최신 원본을 다시 조회하세요.',409);
  const previous=snapshot.edits.find(e=>e.key===key),base=current.source(key);
  if(value.action==='restore'){
   if(!previous)throw new OsmEditError('복원할 로컬 수정이 없습니다.',404);
   snapshot.edits=snapshot.edits.filter(e=>e.key!==key);return;
  }
  if(current.schemaVersion!==2)throw new OsmEditError('schema1 지도는 읽기 전용입니다. --force 재준비가 필요합니다.',409);
  if(!['add','update','hide','reapply'].includes(value.action))throw new OsmEditError('지원하지 않는 수정 동작입니다.');
  if(value.action!=='add'&&!key.startsWith('local:')){
   if(!base)throw new OsmEditError('원본 대상이 삭제되었습니다. 수정은 보존되며 원본 복원으로 해제할 수 있습니다.',409);
   if(!base.editable)throw new OsmEditError(base.reason||'읽기 전용 객체입니다.',409);
   if(value.fingerprint!==base.fingerprint)throw new OsmEditError('원본 객체가 변경됐습니다. 초안은 유지됩니다. 최신 정보로 검토하세요.',409);
   if(previous&&previous.baseFingerprint!==base.fingerprint&&value.action!=='reapply')throw new OsmEditError('충돌한 수정입니다. 원본을 검토한 뒤 명시적으로 재적용하세요.',409);
  }else if(value.action!=='add'&&!previous)throw new OsmEditError('로컬 객체가 없습니다.',404);
  if(value.action==='hide'&&key.startsWith('local:')){snapshot.edits=snapshot.edits.filter(e=>e.key!==key);return;}
  const original=value.action==='hide'?previous?.value||base:value.value;
  const parsed=validateObject(original,current.metadata.bounds);
  if(base&&base.kind!==parsed.kind)throw new OsmEditError('원본 객체 종류는 바꿀 수 없습니다.');
  const edit={key,action:value.action==='add'||key.startsWith('local:')?'add' as const:value.action==='hide'||value.action==='reapply'&&previous?.action==='hide'?'hide' as const:'update' as const,baseFingerprint:base?.fingerprint||null,dataset:current.revision,value:parsed,updatedAt:new Date().toISOString()};
  snapshot.edits=[...snapshot.edits.filter(e=>e.key!==key),edit];
 });
 return {revision:updated.revision,dataset:index.revision,key,object:detail(index,updated,key)};
}
