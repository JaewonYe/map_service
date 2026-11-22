"""Operator-owned raw imagery/DEM archives, separate from active prepared sets."""
import copy, json, re
from common import *

def request_key(ctx,kind):
    public={'bounds':ctx.request['bounds'],'provider':'world-imagery-export' if kind=='satellite' else ctx.request.get('demProvider','opentopography'),'dataset':'World_Imagery' if kind=='satellite' else 'COP30'}
    if kind=='satellite':public['levels']=ctx.request['levels']['satellite']
    return hashlib.sha256(json.dumps(public,sort_keys=True,separators=(',',':')).encode()).hexdigest(),public

def cached(ctx,kind,validate):
    if ctx.request.get('refresh'):return None
    key,_=request_key(ctx,kind);index=ctx.root/'originals-index'/kind/(key+'.json')
    if not index.exists():return None
    record=read_json(index,65536);name=record.get('file','')
    if record.get('version')!=1 or not re.fullmatch(r'taean-[a-f0-9]{16}-[a-f0-9]{16}\.(tpk|tif)',name):raise WorkError('원본 재사용 기록이 손상됐습니다. 기존 파일을 보존하고 복구하세요.')
    file=ctx.original_dirs[kind]/name
    if file.is_symlink() or not file.is_file() or file.stat().st_size!=record.get('bytes') or digest(file)!=record.get('sha256'):raise WorkError('기존 다운로드 파일의 해시가 바뀌었습니다. 파일을 보존하고 명시적 다시 받기를 선택하세요.')
    ctx.stage('verify','동일 요청의 기존 원본 해시·형식 검사');validate(file);ctx.progress(0,0)
    metadata=copy.deepcopy(record['metadata']);metadata['download']={**metadata.get('download',{}),'bytes':record['bytes'],'networkBytes':0,'reusedVerifiedChecksum':True,'sha256':record['sha256']};metadata['reuseNotice']='기존 요청과 같은 검증된 원본입니다. 제공처의 최신 데이터인지 확인한 것은 아닙니다. 명시적 다시 받기로 갱신하세요.'
    return file,metadata

def store(ctx,kind,file,metadata):
    key,params=request_key(ctx,kind);sha=digest(file);extension='.tpk' if kind=='satellite' else '.tif';name='taean-'+key[:16]+'-'+sha[:16]+extension;directory=ctx.original_dirs[kind];directory.mkdir(parents=True,exist_ok=True);target=directory/name
    if target.exists():
        if target.is_symlink() or digest(target)!=sha:raise WorkError('기존 원본 파일 이름 충돌. 덮어쓰지 않습니다.')
    else:ctx.copy_file(file,target)
    metadata['originalFile']=name;metadata['originalStorage']='imagery' if kind=='satellite' else 'dem'
    atomic(ctx.root/'originals-index'/kind/(key+'.json'),{'version':1,'parameters':params,'file':name,'bytes':file.stat().st_size,'sha256':sha,'downloadedAt':now(),'metadata':metadata})
