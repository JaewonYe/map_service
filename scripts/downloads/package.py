"""Portable data-only packages: exact allowlisted files, hashes and relative paths."""
import json, os, re, shutil, stat, zipfile
from pathlib import Path, PurePosixPath
from common import *
from providers import validate_osm, validate_elevation, validate_tpk
MAX_MEMBERS=50000

def relative_path(value):
    if not isinstance(value,str) or len(value)>240 or not re.fullmatch(r'[A-Za-z0-9_./-]+',value) or value.startswith('/') or any(x in ('','.','..') for x in value.split('/')):raise WorkError('패키지 경로 탈출/잘못된 상대 경로')
    if value.split('/')[0] not in KINDS:raise WorkError('패키지에 지도 데이터 외 파일이 포함됐습니다.')
    return value

def no_secrets(v):
    if isinstance(v,dict):
        for k,x in v.items():
            if re.search(r'(^|_)(token|password|cookie|authorization|secret|api_key|apikey|access_key)($|_)',k,re.I):raise WorkError('패키지에 비밀 설정이 포함됐습니다.')
            no_secrets(x)
    elif isinstance(v,list):
        for x in v:no_secrets(x)
    elif isinstance(v,str):
        if len(v)>8000:raise WorkError('과도한 패키지 메타데이터를 거부합니다.')
        if v.startswith(('https://','http://')):
            u=urllib.parse.urlsplit(v)
            public_item=u.scheme=='https' and u.hostname=='www.arcgis.com' and u.path=='/home/item.html' and bool(re.fullmatch(r'id=[a-f0-9]{32}',u.query))
            if u.username or u.password or u.fragment or u.query and not public_item:raise WorkError('토큰/서명 URL을 패키지에 넣을 수 없습니다.')

def validate(root,ctx):
    root=Path(root);m=read_json(root/'manifest.json',8*1024**2)
    if m.get('version')!=1:raise WorkError('지원하지 않는 이전 패키지 버전')
    identity(m.get('id'));no_secrets(m)
    if not isinstance(m.get('items'),dict) or not m['items'] or any(k not in KINDS for k in m['items']):raise WorkError('패키지 레이어 목록 오류')
    files=m.get('files');seen=set();total=0
    if not isinstance(files,list) or not files or len(files)>MAX_MEMBERS:raise WorkError('패키지 파일 수 한도 초과/비어 있음')
    for item in files:
        ctx.check();name=relative_path(item.get('path'));key=name.casefold()
        if key in seen:raise WorkError('중복 패키지 경로')
        seen.add(key);file=root/name
        if file.is_symlink() or not file.is_file() or file.stat().st_size!=item.get('bytes') or not re.fullmatch(r'[a-f0-9]{64}',str(item.get('sha256'))) or digest(file)!=item['sha256']:raise WorkError('패키지 파일 checksum/크기 검증 실패')
        total+=file.stat().st_size
        if total>MAX_BYTES:raise WorkError('패키지 해제 용량4GiB 초과')
    actual=set()
    for f in root.rglob('*'):
        if f.is_symlink():raise WorkError('패키지 심볼릭 링크 거부')
        if f.is_file() and f.name!='manifest.json':actual.add(f.relative_to(root).as_posix().casefold())
    if actual!=seen:raise WorkError('manifest 파일 목록과 실제 파일이 다릅니다.')
    for kind,item in m['items'].items():
        if item.get('usageConfirmed') is not True or not isinstance(item.get('provider'),str) or not isinstance(item.get('attribution'),str) or not isinstance(item.get('license'),str):raise WorkError('원본 이용 조건·출처 확인 누락')
        if kind=='osm':validate_osm(root/kind)
        elif kind=='elevation':validate_elevation(root/kind)
        else:
            metadata=validate_tpk(root/kind/'map.tpk',ctx.check);maps=read_json(root/kind/'maps.json',65536)
            sources=maps.get('sources',[])
            if maps.get('version')!=1 or len(sources)!=1 or sources[0].get('file')!='map.tpk' or sources[0].get('role')!='base' or sources[0].get('usageConfirmed') is not True or sources[0].get('enabled',True) is not True:raise WorkError('지원하지 않는 위성 catalog 설정')
            source=sources[0]
            if not isinstance(source.get('id'),str) or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,63}',source['id']) or type(source.get('priority',0)) is not int or not -100000<=source.get('priority',0)<=100000:raise WorkError('위성 catalog ID/우선순위 오류')
            if 'bounds' in source:bounds(source['bounds'])
            if any(type(sources[0].get(k)) is not int for k in ('minZoom','maxZoom')) or not 0<=sources[0]['minZoom']<=sources[0]['maxZoom']<=19 or not any(sources[0]['minZoom']<=z<=sources[0]['maxZoom'] for z in metadata['zoomLevels']):raise WorkError('위성 catalog 실제LOD 불일치')
    return m

def manifest(root,ctx,items):
    files=[];total=0
    for kind in items:
        for f in sorted((root/kind).rglob('*')):
            ctx.check()
            if f.is_symlink():raise WorkError('패키지 심볼릭 링크 거부')
            if not f.is_file():continue
            name=relative_path(f.relative_to(root).as_posix());size=f.stat().st_size;total+=size
            if size>MAX_FILE or total>MAX_BYTES or len(files)>=MAX_MEMBERS:raise WorkError('이전 패키지 파일/용량 한도 초과')
            files.append({'path':name,'bytes':size,'sha256':digest(f)})
    m={'version':1,'id':ctx.request['id'],'name':ctx.request.get('name','가져온 지도'),'createdAt':now(),'requestedBounds':ctx.request.get('bounds'),'items':items,'files':files,'notice':'서버 준비 완료 데이터만 포함합니다. 원본 지역 PBF/DEM 캐시는 서버 source-cache에 별도 보관합니다. 사용자 시설·OSM 로컬 수정·계정·도구 이미지는 포함하지 않습니다.'}
    no_secrets(m);atomic(root/'manifest.json',m);return m

def export(root,target,ctx):
    m=validate(root,ctx);part=target.with_suffix('.zip.part');target.parent.mkdir(parents=True,exist_ok=True)
    try:
        with zipfile.ZipFile(part,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as archive:
            for name in ['manifest.json']+[f['path'] for f in m['files']]:
                ctx.check()
                info=zipfile.ZipInfo(name);info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(stat.S_IFREG|0o644)<<16
                with (root/name).open('rb') as src,archive.open(info,'w',force_zip64=True) as out:
                    while chunk:=src.read(256*1024):ctx.check();out.write(chunk)
                if part.stat().st_size>MAX_FILE or shutil.disk_usage(target.parent).free<RESERVE:raise WorkError('ZIP 이전 파일/디스크 한도 초과')
        ctx.check();os.replace(part,target)
    finally:part.unlink(missing_ok=True)
    return target.stat().st_size

def unpack(source,destination,ctx):
    if source.is_symlink() or not source.is_file() or not 0<source.stat().st_size<=MAX_FILE:raise WorkError('이전 ZIP 크기/파일 오류')
    destination.mkdir(parents=True,exist_ok=False);total=0;seen=set()
    try:
        with zipfile.ZipFile(source) as archive:
            entries=archive.infolist()
            if not entries or len(entries)>MAX_MEMBERS+1:raise WorkError('이전 ZIP 파일 수 제한 초과')
            for i in entries:
                ctx.check();name=i.filename
                if name!='manifest.json':relative_path(name)
                key=name.casefold();mode=i.external_attr>>16
                if key in seen or i.is_dir() or stat.S_ISLNK(mode) or stat.S_IFMT(mode) not in (0,stat.S_IFREG) or i.flag_bits&1 or i.compress_type not in (0,8):raise WorkError('중복/심볼릭 링크/지원하지 않는 ZIP 항목')
                seen.add(key);total+=i.file_size
                if total>MAX_BYTES or i.file_size>MAX_FILE or i.file_size>max(i.compress_size,1)*1000:raise WorkError('ZIP 해제 크기/압축률 제한 초과')
                if shutil.disk_usage(destination).free<i.file_size+RESERVE:raise WorkError('이전 패키지 해제 디스크 부족')
                target=destination/name;target.parent.mkdir(parents=True,exist_ok=True);written=0
                with archive.open(i) as src,target.open('xb') as out:
                    while chunk:=src.read(256*1024):
                        ctx.check();written+=len(chunk)
                        if written>i.file_size:raise WorkError('ZIP 항목 크기 불일치')
                        out.write(chunk)
                if written!=i.file_size:raise WorkError('ZIP 항목 다운로드/해제 중단')
        return validate(destination,ctx)
    except BaseException:
        shutil.rmtree(destination,ignore_errors=True);raise
