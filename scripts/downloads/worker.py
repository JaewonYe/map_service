#!/usr/bin/env python3
"""Single writer; durable request queue, staging/validation then atomic activation."""
import argparse, fcntl, os, shutil, signal, subprocess, sys, time
from pathlib import Path
from common import *
from providers import ADAPTERS, Network, probe
import package as packages
import maintenance

class Worker:
    def __init__(self,root,code=None,net=None,offline=False,imagery_dir=None,dem_dir=None,maintenance_dirs=None):
        self.root=Path(root).resolve();self.code=Path(code or Path(__file__).resolve().parents[2]);self.net=net or Network(self.root/'network-backoff.json');self.offline=offline;self.request=None;self.state=None;self.item=None;self.received=0;self.last_progress=0;self.last_heartbeat=0;self.committed=False
        self.maintenance_dirs={k:Path(v) for k,v in (maintenance_dirs or {}).items()};self.maintenance_failed=0;self.last_maintenance_check=0
        self.maintenance_original_dirs={'imagery':Path(imagery_dir) if imagery_dir else self.root/'originals/imagery','dem':Path(dem_dir) if dem_dir else self.root/'originals/dem'}
        self.original_dirs={'satellite':Path(imagery_dir).resolve() if imagery_dir else self.root/'originals/imagery','elevation':Path(dem_dir).resolve() if dem_dir else self.root/'originals/dem'}
        for folder in ('jobs','staging','packages','exports','incoming','history','maintenance'): (self.root/folder).mkdir(parents=True,exist_ok=True)
    def heartbeat(self):atomic(self.root/'worker.json',{'version':1,'updatedAt':now(),'singleWriter':True,'maintenanceVersion':1,'legacyReset':set(self.maintenance_dirs)=={'tpk','osm','street','elevation'},'currentJob':self.request['id'] if self.request else None});self.last_heartbeat=time.monotonic()
    def registry(self):
        p=self.root/'active.json'
        if not p.exists():return {'version':1,'revision':0,'layers':{}}
        v=read_json(p,8192)
        if v.get('version')!=1 or type(v.get('revision')) is not int or v['revision']<0 or not isinstance(v.get('layers'),dict):raise WorkError('Invalid active registry; preserve file and restore a backup')
        for kind,id in v['layers'].items():
            if kind not in KINDS:raise WorkError('Invalid registry kind')
            identity(id)
        if 'satellitePackages' in v:
            ids=v['satellitePackages']
            if not isinstance(ids,list) or len(ids)>32:raise WorkError('Invalid satellite package list')
            for id in ids:identity(id)
            if len(set(ids))!=len(ids) or (ids[-1] if ids else None)!=v['layers'].get('satellite'):raise WorkError('Invalid satellite package selection')
        return v
    def satellite_packages(self,r):return r.get('satellitePackages',[r['layers']['satellite']] if r['layers'].get('satellite') else [])
    def save(self):self.state['updatedAt']=now();atomic(self.root/'jobs'/(self.request['id']+'.state.json'),self.state);self.heartbeat()
    def run_maintenance(self):
        if not maintenance.marker(self.root).exists():return False
        request=read_json(maintenance.marker(self.root),16384)
        if request.get('ready') is not True:
            age=time.time()-__import__('datetime').datetime.fromisoformat(request['createdAt'].replace('Z','+00:00')).timestamp()
            if age>120:
                atomic(maintenance.folder(self.root)/(identity(request['id'])+'.state.json'),{'id':request['id'],'request':request,'createdAt':request['createdAt'],'state':'failed','stage':'파일 리더 종료 확인 시간 초과','error':'정리를 다시 요청하세요. 지도 파일은 변경하지 않았습니다.'});maintenance.marker(self.root).unlink()
            return True
        if time.monotonic()>=self.maintenance_failed:
            state=maintenance.Maintenance(self).run(read_json(maintenance.marker(self.root),16384));self.maintenance_failed=time.monotonic()+30 if state.get('recoveryRequired') else 0
        return True
    def check(self):
        if not self.committed and time.monotonic()-self.last_maintenance_check>.25:
            self.last_maintenance_check=time.monotonic()
            if maintenance.marker(self.root).exists() and read_json(maintenance.marker(self.root),16384).get('operation')=='clear':raise Cancelled('전체 초기화 요청으로 다운로드를 취소했습니다.')
        if time.monotonic()-self.last_heartbeat>5:self.heartbeat()
        if not self.committed and (self.root/'jobs'/(self.request['id']+'.cancel.json')).exists():raise Cancelled('작업을 취소했습니다. 기존 활성 지도는 유지합니다.')
        if self.request and time.monotonic()-self.started>7200:raise WorkError('전체 작업 제한2시간 초과')
    def sleep(self,seconds):
        end=time.monotonic()+seconds
        while time.monotonic()<end:self.check();self.heartbeat();time.sleep(min(.25,max(0,end-time.monotonic())))
    def stage(self,stage,description):
        self.check();self.state['stage']=description
        if self.item:self.state['items'][self.item].update(state='running',stage=stage,description=description)
        self.save()
    def progress(self,n,total):
        if time.monotonic()-self.last_progress<.25 and n!=total:return
        self.last_progress=time.monotonic()
        if self.item:self.state['items'][self.item].update(downloaded=n,total=total)
        self.save()
    def copy_file(self,source,target):
        target=Path(target);target.parent.mkdir(parents=True,exist_ok=True);temporary=target.with_name('.'+target.name+'.'+uuid.uuid4().hex+'.part')
        try:
            with Path(source).open('rb') as src,temporary.open('xb') as out:
                os.chmod(temporary,0o600)
                while chunk:=src.read(256*1024):
                    self.check()
                    if shutil.disk_usage(target.parent).free<len(chunk)+RESERVE:raise WorkError('원본 보존 디스크 부족')
                    out.write(chunk)
                out.flush();os.fsync(out.fileno())
            self.check();os.replace(temporary,target)
        finally:temporary.unlink(missing_ok=True)
    def command(self,args,timeout=1800):
        log=self.root/'staging'/(self.request['id']+'.log');log.parent.mkdir(exist_ok=True)
        with log.open('ab') as f:
            parent=os.getpid()
            def parent_death_signal():
                import ctypes
                ctypes.CDLL(None).prctl(1,signal.SIGTERM)
                if os.getppid()!=parent:os.kill(os.getpid(),signal.SIGTERM)
            child=subprocess.Popen(args,stdout=f,stderr=subprocess.STDOUT,start_new_session=True,preexec_fn=parent_death_signal)
            start=time.monotonic()
            try:
                while child.poll() is None:
                    self.sleep(.25)
                    if time.monotonic()-start>timeout or log.stat().st_size>2*1024**2:raise WorkError('준비 도구 시간/로그 한도 초과')
                if child.returncode:raise WorkError('준비 도구 실패 (exit '+str(child.returncode)+'). 작업 로그와 원본 형식을 확인하세요.')
            finally:
                if child.poll() is None:
                    os.killpg(child.pid,signal.SIGTERM)
                    try:child.wait(3)
                    except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
    def activate(self,id=None):
        self.check();r=self.registry()
        if r['revision']!=self.request['registryRevision']:raise WorkError('등록 revision 충돌. 준비 파일은 보존했습니다. 현재 등록 상태를 확인하고 명시적으로 다시 등록하세요.')
        layers={} if id is None else dict(r['layers'])
        satellites=[] if id is None else list(self.satellite_packages(r))
        if id:
            m=packages.validate(self.root/'packages'/identity(id),self)
            if 'satellite' in m['items']:
                satellites=[old for old in satellites if old!=id]+[id]
                if len(satellites)>32:raise WorkError('위성 패키지는 최대32개를 함께 표시할 수 있습니다. 기존 파일 기반 지도로 돌아간 뒤 필요한 패키지만 다시 등록하세요. 준비 파일은 보존했습니다.')
            layers.update({kind:id for kind in m['items']})
        atomic(self.root/'history'/f'{r["revision"]}.json',r)
        self.check();atomic(self.root/'active.json',{'version':1,'revision':r['revision']+1,'layers':layers,'satellitePackages':satellites});self.committed=True;self.state['registered']=True
    def recover(self):
        for p in (self.root/'jobs').glob('*.state.json'):
            s=read_json(p)
            if s.get('state')=='running':
                id=identity(s['id']);s.update(state='interrupted',stage='worker 재시작으로 중단됨',error='작업이 중단됐습니다. 기존 완료 파일을 보존하고 재시도하세요.',updatedAt=now())
                # Activation is a commit point: recover a published result even if the last state write was interrupted.
                r=self.registry()
                if s.get('packageId') and s['packageId'] in [*r['layers'].values(),*self.satellite_packages(r)]:s.update(state='partial' if any(i.get('state')!='completed' for i in s.get('items',{}).values()) else 'completed',stage='등록 결과 복구',registered=True)
                atomic(p,s);shutil.rmtree(self.root/'staging'/id,ignore_errors=True)
        for p in (self.root/'staging').glob('*.part'):p.unlink(missing_ok=True)
        # Only this locked worker writes export parts; incoming uploads may still be live in web.
        for p in (self.root/'exports').glob('*.zip.part'):p.unlink(missing_ok=True)
    def process(self,request):
        request=validate_request(request);self.request=request;self.started=time.monotonic();self.committed=False;self.received=0;self.item=None
        self.state={'version':1,'id':request['id'],'request':request,'state':'running','stage':'시작','createdAt':request['createdAt'],'updatedAt':now(),'items':{}};self.save();staging=self.root/'staging'/request['id']
        try:
            self.check()
            if request['type']=='reset':self.stage('register','기존 파일 기반 지도 선택');self.activate();self.state.update(state='completed',stage='기존 지도 선택 완료');return
            if request['type']=='activate':
                self.stage('verify','준비된 패키지 검사');self.state['packageId']=request['packageId'];self.save();self.activate(request['packageId']);self.state.update(state='completed',stage='등록 완료');return
            items={}
            if request['type']=='import':
                if request.get('confirmUsage') is not True:raise Blocked('이전 패키지의 사용 권한을 확인하세요.')
                self.stage('verify','이전 패키지 검사·해제');m=packages.unpack(self.root/'incoming'/(identity(request['uploadId'])+'.zip'),staging,self);items=m['items'];m.update(id=request['id'],importedAt=now(),sourcePackageId=m['id']);atomic(staging/'manifest.json',m)
                self.state['items']={k:{'state':'completed','stage':'verified','result':v} for k,v in items.items()}
            else:
                staging.mkdir(parents=True,exist_ok=False)
                for kind in request['kinds']:
                    self.item=kind;self.state['items'][kind]={'state':'running','stage':'download','downloaded':0,'total':None};self.save();out=staging/kind
                    try:
                        metadata=ADAPTERS[kind](self,out);items[kind]=metadata;self.state['items'][kind].update(state='completed',stage='prepared',result=metadata)
                    except Cancelled:raise
                    except Exception as e:
                        self.state['items'][kind].update(state='blocked' if isinstance(e,Blocked) else 'failed',stage='failed',reason=str(e) if isinstance(e,WorkError) else '원본 검사/변환에 실패했습니다. 작업 로그와 파일 형식을 확인하세요.');shutil.rmtree(out,ignore_errors=True)
                    self.save()
                self.item=None
                if not items:self.state.update(state='failed',stage='준비된 레이어 없음');return
                packages.manifest(staging,self,items)
            self.item=None;self.stage('verify','완료 데이터·파일 해시 검사');packages.validate(staging,self)
            self.stage('package','오프라인 이전 ZIP 준비');size=packages.export(staging,self.root/'exports'/(request['id']+'.zip'),self)
            self.check();destination=self.root/'packages'/request['id']
            if destination.exists():raise WorkError('패키지 이름 충돌. 기존 파일을 보존합니다.')
            os.replace(staging,destination);self.state.update(packageId=request['id'],archiveBytes=size);self.save();self.stage('register','검증된 지도 등록');self.activate(request['id'])
            self.state.update(state='completed' if all(i['state']=='completed' for i in self.state['items'].values()) else 'partial',stage='등록 완료')
        except Cancelled as e:self.state.update(state='cancelled',stage='취소',error=str(e))
        except Exception as e:self.state.update(state='partial' if self.state.get('packageId') else 'failed',stage='중단',error=str(e) if isinstance(e,WorkError) else '작업 처리 실패. 원본·이전 활성 데이터는 보존했습니다.')
        finally:
            self.item=None;self.save();shutil.rmtree(staging,ignore_errors=True)
            if self.state['state']=='completed':(self.root/'staging'/(request['id']+'.log')).unlink(missing_ok=True)
            if not self.state.get('packageId'):(self.root/'exports'/(request['id']+'.zip')).unlink(missing_ok=True)
            if request.get('uploadId'):(self.root/'incoming'/(identity(request['uploadId'])+'.zip')).unlink(missing_ok=True)
            self.request=None;self.heartbeat()
    def run(self,once=False):
        with (self.root/'worker.lock').open('a') as lock:
            try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:raise WorkerBusy('한 데이터 폴더에는 worker 한 개만 실행할 수 있습니다.')
            self.recover();self.heartbeat();atomic(self.root/'providers.json',{'version':1,'satellite':{'state':'blocked','reason':'오프라인 worker: 원본 다운로드는 비활성입니다. 이전/복원은 사용할 수 있습니다.','lods':{}}} if self.offline else probe(self.net,self.heartbeat))
            while True:
                self.heartbeat()
                if self.run_maintenance():
                    if once:return
                    time.sleep(1);continue
                requests=sorted((self.root/'jobs').glob('*.request.json'),key=lambda p:p.stat().st_mtime_ns)
                for p in requests:
                    if maintenance.marker(self.root).exists():break
                    id=identity(p.name[:-13])
                    if not (self.root/'jobs'/(id+'.state.json')).exists():
                        try:
                            request=read_json(p,16384)
                            if request.get('id')!=id:raise WorkError('작업 파일과 ID가 다릅니다.')
                            if self.offline and request.get('type')=='download':raise WorkError('Offline worker cannot download')
                            self.process(request)
                        except Exception:atomic(self.root/'jobs'/(id+'.state.json'),{'version':1,'id':id,'state':'failed','stage':'잘못된 작업 요청','createdAt':now(),'updatedAt':now(),'items':{}})
                if maintenance.marker(self.root).exists():self.run_maintenance()
                if once:return
                time.sleep(1)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--directory',default=os.getenv('MAP_DOWNLOADS_DIR','data/downloads'));p.add_argument('--once',action='store_true');p.add_argument('--offline',action='store_true',default=os.getenv('MAP_DOWNLOADS_OFFLINE')=='true');a=p.parse_args()
    try:Worker(a.directory,offline=a.offline,imagery_dir=os.getenv('MAP_IMAGERY_DIR','data/imagery'),dem_dir=os.getenv('MAP_DEM_DIR','data/dem'),maintenance_dirs={k:os.environ['MAP_MAINTENANCE_'+k.upper()+'_DIR'] for k in ('tpk','osm','street','elevation') if os.getenv('MAP_MAINTENANCE_'+k.upper()+'_DIR')}).run(a.once)
    except WorkerBusy as e:print(str(e),file=sys.stderr);sys.exit(75)
    except WorkError as e:print(str(e),file=sys.stderr);sys.exit(1)
