"""Reversible map-only maintenance, executed under the download worker's flock.

A durable pending request blocks new web writes and map reads. A journal records
same-filesystem renames before changing the registry; restart rolls it forward.
"""
import copy, errno, json, os, time
from pathlib import Path
from common import WorkError, atomic, read_json, identity, now

PHRASES={'delete':'지도 삭제','clear':'전체 초기화','restore':'백업 복원'}
KEEP={'.map-trash','README.md','maps.example.json','.gitkeep'}
DOWNLOAD_KEEP={'maintenance','maintenance.pending.json','worker.lock','worker.json','providers.json','active.json','.map-trash','README.md'}

def validate(v):
    if not isinstance(v,dict) or v.get('version')!=1 or v.get('type')!='maintenance' or type(v.get('registryRevision')) is not int or v['registryRevision']<0:raise WorkError('Invalid maintenance request')
    identity(v.get('id'))
    if v.get('operation') not in PHRASES or v.get('confirmation')!=PHRASES.get(v.get('operation')):raise WorkError('삭제·초기화·복원 확인 문구가 일치하지 않습니다.')
    if v['operation']=='delete':identity(v.get('targetId'))
    if v['operation']=='restore':identity(v.get('backupId'))
    if type(v.get('includeLegacy',False)) is not bool:raise WorkError('Invalid legacy selection')
    return v

def vacant(path):
    if not path.is_dir():return False
    for i,p in enumerate(path.rglob('*')):
        if i>10000 or p.is_symlink() or not p.is_dir():return False
    return True
def remove_empty(path):
    for p in sorted(path.rglob('*'),key=lambda p:len(p.parts),reverse=True):p.rmdir()
    path.rmdir()

def marker(root):return Path(root)/'maintenance.pending.json'
def folder(root):return Path(root)/'maintenance'
def layers(r):return {'layers':r['layers'],'satellitePackages':r.get('satellitePackages',[r['layers']['satellite']] if r['layers'].get('satellite') else []),**{k:r[k] for k in ('satelliteVisible','satelliteSelectionJob') if k in r}}

def filesystem_failure(error,context):
    # Never copy exception text/filenames: those may contain host paths or secrets.
    number=error.errno if type(error.errno) is int else None
    result={'code':errno.errorcode.get(number,'OS_ERROR'),'errno':number}
    allowed_operations={'ensure-map-root','inspect','remove-empty-backup','prepare-backup-directory','rename','write-journal'}
    if context.get('operation') in allowed_operations:result['operation']=context['operation']
    if context.get('root') in {'downloads','imagery','dem','tpk','osm','street','elevation'}:result['root']=context['root']
    for key in ('entryIndex','total'):
        if type(context.get(key)) is int and 0<=context[key]<=1000:result[key]=context[key]
    return result

class Maintenance:
    def __init__(self,w):self.w=w;self.base=folder(w.root);self.base.mkdir(exist_ok=True);self.io_context={}
    def roots(self,legacy=False):
        result={'downloads':self.w.root,**self.w.maintenance_original_dirs}
        if legacy:
            if set(self.w.maintenance_dirs)!={'tpk','osm','street','elevation'}:raise WorkError('수동 지도 초기화 경로가 없습니다. web과 worker를 함께 업데이트하세요.')
            result.update(self.w.maintenance_dirs)
        for key,path in result.items():
            self.io_context={'operation':'ensure-map-root','root':key}
            path=Path(path)
            if path.is_symlink() or path.resolve()==Path('/'):raise WorkError('Invalid maintenance root')
            path.mkdir(parents=True,exist_ok=True)
            if not path.is_dir() or not os.access(path,os.W_OK):raise WorkError('지도 전용 경로의 쓰기 권한·마운트를 확인하세요.')
            result[key]=path.resolve()
        for key,path in result.items():
            for other,other_path in result.items():
                if key==other:continue
                if key!='downloads' and other=='downloads' and other_path.is_relative_to(path):raise WorkError('지도 전용 경로가 다운로드 관리 경로를 포함합니다. 저장 경로를 분리하세요.')
                if key!='downloads' and other!='downloads' and path.is_relative_to(other_path):raise WorkError('지도 전용 저장 경로가 서로 겹칩니다. 경로를 분리하세요.')
        self.io_context={}
        return result
    def path(self,roots,entry,backup=False):
        key,name=entry['root'],entry['name'];root=roots.get(key)
        if root is None or not isinstance(name,str) or not name or name.startswith('/') or '\\' in name or any(p in ('','.','..') for p in name.split('/')):raise WorkError('Invalid maintenance path')
        path=root/('.map-trash/'+identity(entry['backupId']))/name if backup else root/name
        # Reject symlinks at every existing level; never follow a directory out of a mount.
        cursor=path
        while cursor!=root:
            if cursor.is_symlink():raise WorkError('심볼릭 링크 경로는 초기화하지 않습니다. 원본은 보존했습니다.')
            cursor=cursor.parent
        if not path.resolve().is_relative_to(root):raise WorkError('Maintenance path escapes its map root')
        return path
    def add(self,entries,key,name,id):
        if len(entries)>=1000:raise WorkError('초기화 항목 한도1000개 초과. 기존 파일을 보존했습니다.')
        entries.append({'root':key,'name':name,'backupId':id})
    def prepare(self,q):
        w=self.w;r=w.registry()
        if r['revision']!=q['registryRevision']:raise WorkError('등록 상태가 변경됐습니다. 다시 조회하고 삭제·초기화를 확인하세요.')
        id=identity(q['id']);op=q['operation']
        for path in (w.root/'jobs').glob('*.request.json'):
            job=read_json(path);sp=path.with_name(path.name.replace('.request.json','.state.json'));state=read_json(sp) if sp.exists() else {'id':identity(job['id']),'request':job,'createdAt':job['createdAt'],'state':'queued','items':{}}
            if state.get('state') in ('queued','running'):
                if op!='clear':raise WorkError('진행 중이거나 대기 중인 다운로드가 있습니다. 완료·취소 후 삭제/복원하세요.')
                state.update(state='cancelled',stage='전체 초기화로 취소',updatedAt=now());atomic(sp,state)
        before=copy.deepcopy(r);after=layers(r);entries=[]
        roots=self.roots(q.get('includeLegacy',False) if op=='clear' else False)
        if op=='delete':
            target=identity(q['targetId']);request=read_json(w.root/'jobs'/(target+'.request.json'))
            state_path=w.root/'jobs'/(target+'.state.json')
            if not state_path.exists():raise WorkError('대기 작업은 취소 후 삭제하세요.')
            state=read_json(state_path)
            if request.get('id')!=target or state.get('id')!=target:raise WorkError('작업 ID가 파일과 일치하지 않습니다.')
            if state.get('state') in ('running','queued'):raise WorkError('진행 중 작업은 취소 후 삭제하세요.')
            package=state.get('packageId');related={target}
            if package:
                identity(package)
                # Activation records share a package. Remove those records together.
                for path in (w.root/'jobs').glob('*.state.json'):
                    s=read_json(path)
                    if s.get('packageId')==package:
                        if s.get('state') in ('running','queued'):raise WorkError('연결된 작업이 진행 중입니다. 취소 후 삭제하세요.')
                        related.add(identity(s['id']))
                for kind in list(after['layers']):
                    if after['layers'][kind]==package:del after['layers'][kind]
                after['satellitePackages']=[p for p in after['satellitePackages'] if p!=package]
                if after['satellitePackages']:after['layers']['satellite']=after['satellitePackages'][-1]
                elif 'satelliteVisible' in after:after['satelliteVisible']=False
                self.add(entries,'downloads','packages/'+package,id);self.add(entries,'downloads','exports/'+package+'.zip',id)
            for job in sorted(related):
                for suffix in ('request.json','state.json','cancel.json'):self.add(entries,'downloads','jobs/'+job+'.'+suffix,id)
                self.add(entries,'downloads','staging/'+job+'.log',id)
                self.add(entries,'downloads','staging/'+job,id)
        elif op=='clear':
            after={'layers':{},'satellitePackages':[]}
            for key,root in roots.items():
                # Test/default roots may nest inside downloads. Its parent move already includes them.
                if key!='downloads' and root.is_relative_to(w.root):continue
                for p in sorted(root.iterdir()):
                    if p.name in (DOWNLOAD_KEEP if key=='downloads' else KEEP) or p.name.startswith('.env'):continue
                    if p.name=='source' and not p.is_symlink() and p.is_dir() and (p/'.gitkeep').exists():
                        for child in sorted(p.iterdir()):
                            if child.name not in KEEP:self.add(entries,key,'source/'+child.name,id)
                    else:self.add(entries,key,p.name,id)
        else:
            saved=read_json(self.base/(identity(q['backupId'])+'.journal.json'),1048576)
            if saved.get('phase')!='completed' or saved['request']['operation']=='restore' or saved.get('restoredBy'):raise WorkError('복원할 수 있는 완료 백업이 아닙니다.')
            if layers(r)!=saved['after']:raise WorkError('백업 이후 적용 상태가 변경됐습니다. 현재 자료를 보존하기 위해 복원을 중단합니다.')
            roots=self.roots(saved['request'].get('includeLegacy',False));entries=copy.deepcopy(saved['entries']);after=layers(saved['before'])
        existing=[]
        for entry in entries:
            src=self.path(roots,entry,backup=op=='restore');dst=self.path(roots,entry,backup=op!='restore')
            if not src.exists():
                if op=='restore':raise WorkError('백업 파일이 누락됐습니다. 기존 백업을 보존하고 복구하세요.')
                continue
            if dst.exists() and not vacant(dst):raise WorkError('복원/백업 위치에 파일이 있습니다. 현재 파일은 덮어쓰지 않습니다.')
            for name in ('MAP_DOWNLOAD_ARCGIS_TOKEN_FILE','MAP_DOWNLOAD_OPENTOPOGRAPHY_KEY_FILE'):
                secret=os.getenv(name)
                if secret and Path(secret).resolve().is_relative_to(src.resolve()):raise WorkError('지도 경로에 비밀 파일이 있습니다. 별도 비밀 경로로 분리한 후 초기화하세요.')
            existing.append(entry)
        if op=='restore':
            import package as packages
            selected=layers(saved['before']);ids=set(selected['layers'].values())|set(selected['satellitePackages'])
            for package_id in ids:
                identity(package_id);candidate=w.root/'packages'/package_id
                for entry in entries:
                    if entry['root']=='downloads' and entry['name']=='packages':candidate=self.path(roots,entry,True)/package_id
                    elif entry['root']=='downloads' and entry['name']=='packages/'+package_id:candidate=self.path(roots,entry,True)
                packages.validate(candidate,w)
        return {'version':1,'request':q,'before':before,'after':after,'entries':existing,'phase':'prepared','moved':0,'createdAt':now()}
    def apply(self,j):
        w=self.w;q=j['request'];op=q['operation'];id=identity(q['id']);jp=self.base/(id+'.journal.json')
        legacy=q.get('includeLegacy',False)
        if op=='restore':legacy=read_json(self.base/(q['backupId']+'.journal.json'),1048576)['request'].get('includeLegacy',False)
        roots=self.roots(legacy)
        # Verify every path before the first rename, including on restart.
        for e in j['entries']:self.path(roots,e);self.path(roots,e,True)
        if j['phase']=='prepared':
            r=w.registry()
            detached={'version':1,'revision':j['before']['revision']+1,**j['after']}
            if r!=j['before'] and (op=='restore' or r!=detached):raise WorkError('초기화 직전 등록 상태가 변경됐습니다. 파일을 보존했습니다.')
            # Detach first for delete/clear, publish restored selection only after its files exist.
            if op!='restore':atomic(w.root/'active.json',detached)
            j['phase']='moving';atomic(jp,j)
        if j['phase']=='moving':
            for i,e in enumerate(j['entries']):
                self.io_context={'operation':'inspect','root':e['root'],'entryIndex':i,'total':len(j['entries'])}
                src=self.path(roots,e,op=='restore');dst=self.path(roots,e,op!='restore')
                if i<j['moved']:
                    if not dst.exists():raise WorkError('완료된 백업 이동 파일이 누락됐습니다.')
                    continue
                if op!='restore' and src.exists() and dst.exists() and vacant(src):
                    # A restarted worker recreates its empty queue/staging directories.
                    pass
                elif src.exists():
                    if dst.exists():
                        if not vacant(dst):raise WorkError('백업 이동 충돌. 중간 자료를 보존했습니다. worker 재시작 후 상태를 확인하세요.')
                        self.io_context['operation']='remove-empty-backup';remove_empty(dst)
                    self.io_context['operation']='prepare-backup-directory';dst.parent.mkdir(parents=True,exist_ok=True)
                    self.io_context['operation']='rename';os.replace(src,dst)
                elif not dst.exists():raise WorkError('백업 파일이 누락됐습니다. 수동 복구 전 기존 백업을 보존하세요.')
                self.io_context['operation']='write-journal';j['moved']=i+1;atomic(jp,j);w.heartbeat()
            self.io_context={}
            if op=='restore':
                r=w.registry();expected=j['before']
                restored={'version':1,'revision':expected['revision']+1,**j['after']}
                if r!=expected and r!=restored:raise WorkError('복원 중 등록 충돌. 백업과 파일은 보존했습니다.')
                atomic(w.root/'active.json',restored)
                saved=read_json(self.base/(q['backupId']+'.journal.json'),1048576);saved['restoredBy']=id;atomic(self.base/(q['backupId']+'.journal.json'),saved)
            j['phase']='completed';atomic(jp,j)
        return j
    def run(self,q):
        q=validate(q);w=self.w;id=identity(q['id']);jp=self.base/(id+'.journal.json');state_path=self.base/(id+'.state.json')
        w.request=q;w.started=time.monotonic();w.committed=False;self.io_context={}
        state={'id':id,'request':q,'state':'running','stage':'지도 백업 이동·등록 정리','createdAt':q['createdAt'],'updatedAt':now()};atomic(state_path,state);w.heartbeat()
        try:
            j=read_json(jp,1048576) if jp.exists() else self.prepare(q)
            if not jp.exists():atomic(jp,j)
            if j.get('version')!=1 or j.get('request')!=q or j.get('phase') not in ('prepared','moving','completed'):raise WorkError('Invalid maintenance journal')
            self.apply(j)
            state.update(state='completed',stage='백업 복원 완료' if q['operation']=='restore' else '삭제·초기화 완료 (백업 보관)',backupId=None if q['operation']=='restore' else id)
        except Exception as e:
            state.update(state='failed',stage='정리 중단',error=str(e) if isinstance(e,WorkError) else '지도 파일 이동 실패. 백업과 저널을 보존했습니다.')
            if isinstance(e,OSError):
                state['failure']=filesystem_failure(e,self.io_context)
                print('MAP_MAINTENANCE_FILESYSTEM_ERROR='+json.dumps(state['failure']),flush=True)
            # A started move must be resumed under the same durable request; keep the read/write gate.
            if jp.exists():
                try:
                    journal=read_json(jp,1048576)
                    if journal.get('phase')=='moving' or journal.get('phase')=='prepared' and q['operation']!='restore' and w.registry()=={'version':1,'revision':journal['before']['revision']+1,**journal['after']}:state['recoveryRequired']=True
                except Exception:state['recoveryRequired']=True
        finally:
            state['updatedAt']=now();atomic(state_path,state)
            if not state.get('recoveryRequired'):marker(w.root).unlink(missing_ok=True)
            w.request=None;w.heartbeat()
        return state
