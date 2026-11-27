"""Local, offline retry of an existing journal; diagnostics exclude paths and secrets."""
import errno, json, os, sys
from pathlib import Path
sys.path.insert(0,'/app/scripts/downloads')
from common import identity

PREFIX='MAP_MAINTENANCE_DIAGNOSTIC='
ROOTS={'downloads','imagery','dem','tpk','osm','street','elevation'}
root=Path(os.getenv('MAP_DOWNLOADS_DIR','/data/downloads'))
last_error=None

def read(path):
    try:return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:return {}

def snapshot():
    q=read(root/'maintenance.pending.json')
    if not q:return {'pending':False}
    id=identity(q.get('id'));state=read(root/'maintenance'/(id+'.state.json'));j=read(root/'maintenance'/(id+'.journal.json'))
    moved=j.get('moved');entries=j.get('entries',[]);valid=type(moved) is int and isinstance(entries,list) and 0<=moved<=len(entries)<=1000
    entry=entries[moved] if valid and moved<len(entries) else {}
    result={'pending':True,'ready':q.get('ready') is True,'phase':j.get('phase') if j.get('phase') in ('prepared','moving','completed') else 'unknown','state':state.get('state') if state.get('state') in ('running','failed','completed') else 'unknown','moved':moved if valid else None,'total':len(entries) if valid else None}
    if entry.get('root') in ROOTS:result['root']=entry['root']
    if last_error:result['failure']=last_error
    return result

def emit(value):print(PREFIX+json.dumps(value),flush=True)

try:
    before=snapshot()
    if os.getenv('MAP_MAINTENANCE_DIAGNOSTIC_MODE')!='retry' or not before['pending']:
        emit(before);sys.exit(0)
    if not before['ready'] or before['phase'] not in ('prepared','moving','completed'):
        emit({**before,'runnerError':'JournalNotReady'});sys.exit(2)
    def trace(function,operation):
        def call(*args,**kwargs):
            global last_error
            try:return function(*args,**kwargs)
            except OSError as error:
                if not (operation=='mkdir' and error.errno in (errno.EEXIST,errno.ENOENT)):
                    number=error.errno if type(error.errno) is int else None
                    last_error={'code':errno.errorcode.get(number,'OS_ERROR'),'errno':number,'operation':operation}
                raise
        return call
    os.replace=trace(os.replace,'replace')
    os.mkdir=trace(os.mkdir,'mkdir')
    os.rmdir=trace(os.rmdir,'rmdir')
    from maintenance import Maintenance
    original_run=Maintenance.run
    def observed_run(self,request):
        global last_error
        last_error=None
        return original_run(self,request)
    Maintenance.run=observed_run
    from worker import Worker
    legacy={key:Path(os.environ[name]) for key,name in [('tpk','MAP_MAINTENANCE_TPK_DIR'),('osm','MAP_MAINTENANCE_OSM_DIR'),('street','MAP_MAINTENANCE_STREET_DIR'),('elevation','MAP_MAINTENANCE_ELEVATION_DIR')] if os.getenv(name)}
    worker=Worker(root,offline=True,imagery_dir=os.getenv('MAP_IMAGERY_DIR'),dem_dir=os.getenv('MAP_DEM_DIR'),maintenance_dirs=legacy)
    worker.run(once=True)
    after=snapshot();emit(after);sys.exit(2 if after['pending'] else 0)
except Exception as error:
    # Exception messages and filenames can contain sensitive local values.
    emit({'runnerError':type(error).__name__ if type(error).__name__ in ('WorkerBusy','PermissionError','FileNotFoundError','JSONDecodeError','WorkError') else 'RunnerFailed',**({'failure':last_error} if last_error else {})});sys.exit(2)
