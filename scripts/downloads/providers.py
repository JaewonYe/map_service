"""Official source adapters. No public tile scraping or arbitrary URL/command input."""
import json, math, os, re, shutil, sqlite3, struct, time, urllib.parse, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
from common import *
import originals
import export_result
OPENTOPO='https://portal.opentopography.org/API/globaldem'
ARCGIS='https://tiledbasemaps.arcgis.com/arcgis/rest/services/World_Imagery/MapServer'
DEM_ROOT='https://copernicus-dem-30m.s3.amazonaws.com'
WORLD=20037508.342789244

def secret(file_name,variable,label):
    direct=os.getenv(variable)
    if direct:
        if len(direct)>16384 or any(c.isspace() for c in direct):raise Blocked(label+' 환경변수 형식이 잘못되었습니다.')
        return direct
    file=os.getenv(file_name)
    if not file:return None
    p=Path(file)
    try:
        if not p.is_file() or p.stat().st_size>16384:raise OSError()
        token=p.read_text().strip()
    except (OSError,UnicodeError):raise Blocked(label+' 비밀 파일을 읽을 수 없습니다. 명시한 파일 경로·worker 마운트·읽기 권한을 확인하세요.') from None
    if not token or any(c.isspace() for c in token):raise Blocked(label+' 비밀 파일 형식이 잘못되었습니다.')
    return token

def credentials():return secret('MAP_DOWNLOAD_ARCGIS_TOKEN_FILE','ARCGIS_TOKEN','ArcGIS 토큰')

def arc(net,path='',params=None,token=None,post=False):
    q={'f':'json',**(params or {})}
    if token:q['token']=token
    value=net.json(ARCGIS+path,q) if post else net.json(ARCGIS+path+'?'+urllib.parse.urlencode(q))
    if 'error' in value:
        code=value['error'].get('code')
        if code==498:raise Blocked('ArcGIS 서비스가 토큰을 유효하지 않다고 응답했습니다 (code 498). 토큰 발급 조직 URL·만료·client/referer 조건과 worker의 ARCGIS_REFERER를 확인하세요.')
        if code==499:raise Blocked('ArcGIS 서비스 인증 토큰이 필요합니다 (code 499). 현재 worker의 토큰 설정을 확인하세요.')
        if code in (401,403):raise Blocked(f'ArcGIS 요청이 인증·권한 검사에서 거부됐습니다 (code {code}). 해당 계정과 서비스의 허용 범위를 확인하세요.')
        raise WorkError(f'ArcGIS 요청이 거부되었습니다 (code {code}); 제공처 제한을 확인하세요.')
    return value

def capabilities(net,token=None):
    m=arc(net,token=token)
    if m.get('exportTilesAllowed') is not True:raise Blocked('이 World Imagery 서비스는 공식 exportTiles를 허용하지 않습니다.')
    t=m.get('tileInfo',{});s=t.get('spatialReference',{})
    if s.get('latestWkid',s.get('wkid')) not in (3857,102100,102113) or t.get('rows')!=256 or t.get('cols')!=256:raise WorkError('지원하지 않는 위성 타일 좌표계/크기')
    lods={}
    for l in t.get('lods',[]):
        resolution=l.get('resolution',0)
        if not isinstance(resolution,(int,float)) or resolution<=0:continue
        z=round(math.log2(156543.03392804097/resolution))
        if 0<=z<=19 and abs(resolution-156543.03392804097/2**z)<resolution*1e-5:lods[str(z)]=l['level']
    maximum=m.get('maxExportTilesCount')
    if not lods or type(maximum) is not int or maximum<1:raise WorkError('서비스의 실제 LOD/export 타일 한도를 확인할 수 없습니다.')
    return {'state':'ready','lods':lods,'maxTiles':min(maximum,10000),'source':ARCGIS,'checkedAt':now(),'attribution':'Esri, Maxar, Earthstar Geographics, and the GIS User Community'}

def probe(net,heartbeat=lambda:None):
    try:satellite=capabilities(net,credentials())
    except WorkError as e:satellite={'state':'blocked','reason':str(e),'lods':{},'checkedAt':now(),'source':ARCGIS}
    region_sizes={}
    for key,(_,part,_) in REGIONS.items():
        heartbeat()
        try:
            with net.open('https://download.geofabrik.de/'+part+'-latest.osm.pbf',method='HEAD') as r:region_sizes[key]={'bytes':int(r.headers['Content-Length']) if r.headers.get('Content-Length') else None,'lastModified':r.headers.get('Last-Modified'),'checkedAt':now()}
        except Exception:region_sizes[key]={'bytes':None,'reason':'제공처 크기를 확인하지 못했습니다. 네트워크·응답을 확인하세요.','checkedAt':now()}
    return {'version':1,'satellite':satellite,'osm':{'source':'https://download.geofabrik.de/','format':'OSM PBF','license':'ODbL-1.0','download':'지역 원본 전체 → 로컬 bbox 추출','renderZooms':[0,19],'regions':region_sizes},'elevation':{'providers':{'opentopography':{'source':'https://portal.opentopography.org/API/globaldem','authentication':'OPENTOPOGRAPHY_API_KEY or private worker key file; personal/Enterprise conditions apply','download':'선택 사각형 COP30 GeoTIFF'},'aws':{'source':DEM_ROOT,'authentication':'anonymous','download':'필요한1도 원본 전체 → 모자이크/clip'}},'source':DEM_ROOT,'format':'Float32 COG GeoTIFF','resolution':'nominal 30m (1 arc-second; latitude-dependent spacing)','verticalDatum':'EGM2008 orthometric height','units':'m','license':'Copernicus DEM GLO-30 Public license','download':'필요한1도 원본 전체 → 모자이크/clip'}}

def validate_tpk(path,check=lambda:None):
    """Match the current XML Compact V1/V2 reader; inspect nonempty bundle pointers."""
    with zipfile.ZipFile(path) as archive:
        entries={};expanded=0
        for i in archive.infolist():
            check();expanded+=i.file_size
            key=i.filename.replace('\\','/').lower()
            if len(entries)>=250000 or expanded>MAX_BYTES or i.file_size>MAX_FILE or key.startswith('/') or ':' in key or '..' in key.split('/') or key in entries or i.flag_bits&1 or i.compress_type not in (0,8):raise WorkError('지원하지 않는 TPK ZIP 구조/해제 크기')
            entries[key]=i
        for i in entries.values():
            with archive.open(i) as member:
                while member.read(256*1024):check()
        conf=[k for k in entries if k=='conf.xml' or k.endswith('/conf.xml')]
        if len(conf)!=1:raise WorkError('현재 리더는 XML TPK만 지원합니다. TPKX/JSON-only는 등록하지 않습니다.')
        prefix=conf[0][:-8]
        def xml(name):
            i=entries.get(name)
            if not i or i.file_size>2*1024**2:raise WorkError('TPK 메타데이터 누락/크기 초과')
            b=archive.read(i)
            if b'<!DOCTYPE' in b.upper() or b'<!ENTITY' in b.upper():raise WorkError('TPK XML entity 선언 거부')
            if re.search(rb'(?:[?&]token=|API_Key=|"access_token"\s*:)',b,re.I):raise WorkError('TPK 메타데이터에 인증 URL이 포함돼 등록하지 않습니다.')
            root=ET.fromstring(b)
            for e in root.iter():e.tag=e.tag.split('}')[-1]
            return root
        c=xml(conf[0]);get=lambda tag,root=c:next((e.text for e in root.iter(tag)),None)
        sr=c.find('.//TileCacheInfo/SpatialReference')
        wkid=get('LatestWKID',sr) or get('WKID',sr) if sr is not None else None
        storage=get('StorageFormat')
        if int(wkid or 0) not in (3857,102100,102113) or get('TileCols')!='256' or get('TileRows')!='256' or get('PacketSize')!='128' or storage not in ('esriMapCacheStorageModeCompact','esriMapCacheStorageModeCompactV2'):raise WorkError('지원하지 않는 TPK 좌표계/타일/저장 형식')
        origin=c.find('.//TileOrigin')
        if origin is None or abs(float(origin.findtext('X'))+WORLD)>1 or abs(float(origin.findtext('Y'))-WORLD)>1:raise WorkError('지원하지 않는 TPK 원점')
        levels=[];samples=0;bundle_count=0;tile_records=0
        for lod in c.findall('.//LODInfo'):
            resolution=float(lod.findtext('Resolution'));z=round(math.log2(156543.03392804097/resolution));level=int(lod.findtext('LevelID'))
            if not 0<=z<=19 or abs(resolution-156543.03392804097/2**z)>resolution*1e-5:raise WorkError('지원하지 않는 TPK LOD')
            bundles=[(k,i) for k,i in entries.items() if re.search(r'/l0*'+str(level)+r'/r[0-9a-f]+c[0-9a-f]+\.bundle$',k) and k.startswith(prefix+'_alllayers/')]
            if not bundles:continue
            levels.append(z)
            for key,i in bundles:
                bundle_count+=1
                if i.file_size>512*1024**2:raise WorkError('TPK bundle 크기 제한 초과')
                with archive.open(i) as f:
                    header=f.read(64)
                    if len(header)!=64:raise WorkError('손상된 TPK bundle')
                    if storage.endswith('V2'):
                        if struct.unpack_from('<II',header)!=(3,16384):raise WorkError('잘못된 Compact V2 header')
                        index=f.read(16384*8)
                        if len(index)!=16384*8:raise WorkError('손상된 TPK V2 index')
                        refs=[(v&((1<<40)-1),v>>40) for (v,) in struct.iter_unpack('<Q',index) if v>>40]
                    else:
                        index_entry=entries.get(key[:-7]+'.bundlx')
                        if not index_entry or index_entry.file_size!=16+16384*5+16:raise WorkError('손상된 TPK V1 index')
                        raw=archive.read(index_entry)[16:-16];refs=[]
                        for j in range(16384):
                            off=int.from_bytes(raw[j*5:j*5+5],'little')
                            if off:
                                if off<64 or off+4>i.file_size:raise WorkError('TPK V1 offset 범위 오류')
                                f.seek(off);size=struct.unpack('<I',f.read(4))[0]
                                if size:refs.append((off+4,size))
                    for off,size in refs:
                        if off<(64+16384*8 if storage.endswith('V2') else 64) or size>20*1024**2 or off+size>i.file_size:raise WorkError('TPK tile offset/size 범위 오류')
                    tile_records+=len(refs)
                    if refs:
                        off,size=refs[0];f.seek(off);magic=f.read(min(size,24))
                        if not (magic.startswith(b'\xff\xd8\xff') or magic.startswith(b'\x89PNG\r\n\x1a\n')):raise WorkError('TPK tile image 형식 오류')
                        samples+=1
        if not levels or not samples:raise WorkError('실제 타일이 없는 TPK')
        e=xml(prefix+'conf.cdi');number=lambda k:float(get(k,e));xmin,xmax,ymin,ymax=map(number,('XMin','XMax','YMin','YMax'))
        ewkid=get('LatestWKID',e) or get('WKID',e)
        if ewkid not in (None,'4326','3857','102100','102113'):raise WorkError('지원하지 않는 TPK extent 좌표계')
        if xmin>=xmax or ymin>=ymax or max(map(abs,(xmin,xmax,ymin,ymax)))>WORLD+1:raise WorkError('잘못된 TPK extent')
        lat=lambda y:math.degrees(math.atan(math.sinh(y/WORLD*math.pi)))
        b=dict(west=xmin,east=xmax,south=ymin,north=ymax) if ewkid=='4326' else dict(west=xmin/WORLD*180,east=xmax/WORLD*180,south=lat(ymin),north=lat(ymax))
        if not -180<=b['west']<b['east']<=180 or not -85.052<=b['south']<b['north']<=85.052:raise WorkError('잘못된 TPK 지리 범위')
        return {'bounds':b,'zoomLevels':sorted(set(levels)),'format':'TPK CompactV2' if storage.endswith('V2') else 'TPK CompactV1','sampledBundles':samples,'bundleCount':bundle_count,'nonEmptyTileRecords':tile_records}

def source_file(ctx,url,name,checksum=None,algorithm='sha256'):
    cache=ctx.root/'source-cache';cache.mkdir(exist_ok=True)
    target=cache/name;meta=target.with_suffix(target.suffix+'.json')
    if not ctx.request.get('refresh') and checksum and target.is_file() and not target.is_symlink() and digest(target,algorithm)==checksum:
        info=read_json(meta) if meta.exists() else {'sha256':digest(target),'bytes':target.stat().st_size}
        ctx.progress(0,0);return target,{**info,'reusedVerifiedChecksum':True,'networkBytes':0}
    if not ctx.request.get('refresh') and not checksum and target.is_file() and not target.is_symlink() and meta.is_file():
        cached=read_json(meta)
        try:
            with ctx.net.open(url,method='HEAD') as r:etag=r.headers.get('ETag');length=r.headers.get('Content-Length')
            if etag and not etag.startswith('W/') and etag==cached.get('etag') and length and int(length)==target.stat().st_size and digest(target)==cached.get('sha256'):
                ctx.progress(0,0);return target,{**cached,'reusedVerifiedChecksum':True,'networkBytes':0}
        except Exception:pass
    info=ctx.net.download(url,target,ctx.check,ctx.progress,maximum=min(MAX_FILE,MAX_BYTES-ctx.received),checksum=checksum,algorithm=algorithm)
    ctx.received+=info['bytes'];info['networkBytes']=info['bytes'];atomic(meta,info);return target,info

def osm(ctx,out):
    request=ctx.request;b=request['bounds'];name,part,coverage=REGIONS[request['region']]
    if b['west']<coverage['west'] or b['east']>coverage['east'] or b['south']<coverage['south'] or b['north']>coverage['north']:raise WorkError('선택 영역이 선택한 Geofabrik 지역 범위를 벗어납니다. 지역·사각형을 다시 선택하세요.')
    url='https://download.geofabrik.de/'+part+'-latest.osm.pbf'
    with ctx.net.open(url+'.md5') as r:raw=r.read(256).decode('ascii')
    match=re.fullmatch(r'([a-fA-F0-9]{32})\s+\*?[^\r\n]+\s*',raw)
    if not match:raise WorkError('Geofabrik MD5 검증 정보를 읽을 수 없습니다.')
    checksum=match[1].lower();ctx.stage('download','지역 PBF 전체 다운로드')
    source,download=source_file(ctx,url,part.split('/')[-1]+'-'+checksum+'.osm.pbf',checksum,'md5')
    ctx.stage('prepare','PBF 영역 추출·공간 색인 준비');out.mkdir(parents=True)
    selected=out/'area.osm.pbf';bbox=','.join(str(b[k]) for k in ('west','south','east','north'))
    ctx.command(['osmium','extract','--strategy=complete_ways','--set-bounds','-b',bbox,'-o',str(selected),str(source)])
    ctx.command(['/usr/bin/python3',str(ctx.code/'scripts/osm/prepare.py'),'--directory',str(out),'--file','area.osm.pbf','--force'])
    m=read_json(out/'metadata.json');validate_osm(out)
    return {'provider':'Geofabrik','sourceURL':url,'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors; extract by Geofabrik','sourceRegion':name,'download':download,'requestedBounds':b,'bounds':m['bounds'],'minZoom':0,'maxZoom':19,'originalResolution':'vector; no download zoom','format':'OSM PBF → SQLite schema2','notice':'전체 지역 PBF 수신 후 complete_ways 사각형 추출. 경계에 걸친 way는 영역 밖까지 포함될 수 있습니다. 바다·누락 지형은 원본 그대로입니다.','usageConfirmed':True}

def validate_dem_source(file):
    from osgeo import gdal
    gdal.UseExceptions()
    try:
        ds=gdal.OpenEx(str(file),gdal.OF_RASTER,allowed_drivers=['GTiff'])
        if not ds or ds.RasterCount!=1 or ds.GetRasterBand(1).DataType in (gdal.GDT_Byte,gdal.GDT_Unknown) or not ds.GetProjection() or ds.RasterXSize<1 or ds.RasterYSize<1:raise WorkError('수치 DEM GeoTIFF가 아닙니다. RGB 영상/오류 응답은 등록하지 않습니다.')
        ds=None
    except RuntimeError:raise WorkError('다운로드 결과가 유효한 DEM GeoTIFF가 아닙니다.') from None

def elevation(ctx,out):
    b=ctx.request['bounds'];out.mkdir(parents=True);sources=[];records=[];provider=ctx.request.get('demProvider','opentopography')
    cached=originals.cached(ctx,'elevation',validate_dem_source)
    if cached:
        file,previous=cached;sources=[str(file)];records=previous.get('sources',[])
    elif provider=='opentopography':
        key=secret('MAP_DOWNLOAD_OPENTOPOGRAPHY_KEY_FILE','OPENTOPOGRAPHY_API_KEY','OpenTopography API Key')
        if not key:raise Blocked('OpenTopography API Key를 worker 전용 환경변수 또는 비밀 파일로 설정하세요. 개인 키의 공유/상업 서비스 이용 범위도 확인하세요.')
        params={'demtype':'COP30','outputFormat':'GTiff',**{k:str(b[k]) for k in ('south','north','west','east')}}
        ctx.stage('download','OpenTopography COP30 영역 GeoTIFF 다운로드')
        cache=ctx.root/'source-cache';cache.mkdir(exist_ok=True);name=originals.request_key(ctx,'elevation')[0]+'.tif';file=cache/name
        info=ctx.net.download(OPENTOPO+'?'+urllib.parse.urlencode({**params,'API_Key':key}),file,ctx.check,ctx.progress,maximum=min(MAX_FILE,MAX_BYTES-ctx.received));ctx.received+=info['bytes'];info['networkBytes']=info['bytes'];validate_dem_source(file);sources=[str(file)];records=[{'sourceURL':OPENTOPO,'parameters':params,**info}]
    else:
        for lat in range(math.floor(b['south']),math.ceil(b['north'])):
            for lon in range(math.floor(b['west']),math.ceil(b['east'])):
                tile=f'Copernicus_DSM_COG_10_{"N" if lat>=0 else "S"}{abs(lat):02}_00_{"E" if lon>=0 else "W"}{abs(lon):03}_00_DEM';url=f'{DEM_ROOT}/{tile}/{tile}.tif'
                ctx.stage('download',f'GLO-30 원본 {lat}, {lon}')
                file,record=source_file(ctx,url,tile+'.tif');validate_dem_source(file);sources.append(str(file));records.append({'sourceURL':url,**record})
    ctx.stage('prepare','DEM 모자이크·사각형 clip·타일 준비')
    source=out/'source';source.mkdir();dem=source/'dem.tif'
    ctx.command(['/usr/bin/python3',str(ctx.code/'scripts/downloads/clip_dem.py'),'--output',str(dem),'--bounds',*[str(b[k]) for k in ('west','south','east','north')],*sources]);ctx.check();levels=ctx.request['levels']['elevation']
    attribution='Copernicus WorldDEM-30 기반 제작; © DLR e.V. 2010–2014 / © Airbus Defence and Space GmbH 2014–2018; European Union·ESA의 COPERNICUS 제공. 모든 권리 보유. 제공 기관은 이 자료의 사용에 책임을 지지 않습니다.'
    if provider=='opentopography':attribution+=' OpenTopography API 제공: NSF awards 2410799, 2410800, 2410801.'
    metadata={'provider':'OpenTopography COP30' if provider=='opentopography' else 'Copernicus DEM GLO-30 / AWS Open Data','sourceURL':OPENTOPO if provider=='opentopography' else DEM_ROOT,'license':'Copernicus GLO-30 Public license'+('; OpenTopography API Agreement (account-specific)' if provider=='opentopography' else ''),'licenseURL':'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM','apiTermsURL':'https://opentopography.org/usageterms' if provider=='opentopography' else 'https://registry.opendata.aws/copernicus-dem/','attribution':attribution,'sources':records,'requestedBounds':b,'bounds':b,'originalResolution':'nominal 30m / 1 arc-second; spacing varies with latitude','verticalDatum':'EGM2008 orthometric height','units':'m','format':'Float32 GeoTIFF DSM → Terrarium height/RGBA color','notice':'표면 고도(건물·식생 포함)입니다. 표시 줌을 높여도 원본 정확도는 증가하지 않으며 NoData를 유지합니다.','usageConfirmed':True}
    metadata['download']=previous['download'] if cached else {'bytes':sum(r['bytes'] for r in records),'networkBytes':sum(r.get('networkBytes',r['bytes']) for r in records),'sha256':digest(dem)}
    if cached:metadata.update(originalFile=previous['originalFile'],originalStorage='dem',reuseNotice=previous['reuseNotice'])
    else:originals.store(ctx,'elevation',file if provider=='opentopography' else dem,metadata)
    ctx.command(['/usr/bin/python3',str(ctx.code/'scripts/elevation/prepare.py'),str(dem),'--output',str(out),'--min-zoom',str(levels['min']),'--max-zoom',str(levels['max']),'--max-tiles','10000','--source','Copernicus DEM GLO-30 DSM','--attribution',attribution,'--vertical-datum','EGM2008 orthometric height','--confirm-usage'])
    m=validate_elevation(out);metadata.update(bounds=m['bounds'],minZoom=m['minZoom'],maxZoom=m['maxZoom']);return metadata

def satellite(ctx,out):
    cached=originals.cached(ctx,'satellite',lambda f:validate_tpk(f,ctx.check))
    if cached:
        source,metadata=cached;out.mkdir(parents=True);ctx.copy_file(source,out/'map.tpk');levels=ctx.request['levels']['satellite'];atomic(out/'maps.json',{'version':1,'sources':[{'id':'downloaded','name':ctx.request['name'],'file':'map.tpk','role':'base','priority':0,'minZoom':levels['min'],'maxZoom':levels['max'],'usageConfirmed':True,'enabled':True}]});return metadata
    token=credentials()
    if not token:raise Blocked('현재 worker에 ArcGIS 토큰이 없습니다. 다운로드를 실행하는 터미널의 ARCGIS_TOKEN 또는 명시적으로 마운트한 비밀 파일을 설정하세요.')
    c=capabilities(ctx.net,token)
    levels=ctx.request['levels']['satellite'];b=ctx.request['bounds'];selected=list(range(levels['min'],levels['max']+1))
    if any(str(z) not in c['lods'] for z in selected):raise WorkError('선택 level은 서비스가 실제 지원하는 LOD가 아닙니다.')
    if tile_count(b,levels['min'],levels['max'])>c['maxTiles']:raise WorkError('서비스 export 타일 수 제한 초과')
    ctx.stage('download','공식 exportTiles 작업 제출')
    response=arc(ctx.net,'/exportTiles',{'tilePackage':'true','storageFormatType':'esriMapCacheStorageModeCompact','exportBy':'LevelID','levels':','.join(str(c['lods'][str(z)]) for z in selected),'exportExtent':json.dumps({'xmin':b['west']/180*WORLD,'ymin':math.log(math.tan(math.pi/4+math.radians(b['south'])/2))*WORLD/math.pi,'xmax':b['east']/180*WORLD,'ymax':math.log(math.tan(math.pi/4+math.radians(b['north'])/2))*WORLD/math.pi,'spatialReference':{'wkid':3857}})},token,post=True)
    job=response.get('jobId')
    if not isinstance(job,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',job):raise WorkError('잘못된 ArcGIS export 작업 응답')
    started=time.monotonic()
    try:
        while True:
            ctx.check()
            if time.monotonic()-started>1800:raise WorkError('위성 export 대기30분 초과')
            result=arc(ctx.net,'/jobs/'+job,token=token);state=result.get('jobStatus')
            if state=='esriJobSucceeded':break
            if state in ('esriJobFailed','esriJobCancelled','esriJobTimedOut'):raise WorkError('공식 위성 export 실패/취소. 권한·제공처 한도를 확인하세요.')
            ctx.sleep(2)
        results=result.get('results',{})
        if not isinstance(results,dict):raise WorkError('지원하지 않는 export 결과 형식')
        entry=results.get('out_service_url') if 'out_service_url' in results else next(iter(results.values())) if len(results)==1 else None
        parameter=entry.get('paramUrl') if isinstance(entry,dict) else None
        if not isinstance(parameter,str) or not re.fullmatch(r'results/[A-Za-z0-9_]+',parameter):raise WorkError('지원하지 않는 export 결과 형식')
        value=arc(ctx.net,'/jobs/'+job+'/'+parameter,token=token).get('value')
        ctx.stage('verify','공식 export 결과 파일 목록 확인')
        url=export_result.resolve(ctx.net,value,token,ctx.check)
        ctx.stage('download','위성 TPK 다운로드')
        out.mkdir(parents=True);file=out/'map.tpk'
        info=ctx.net.download(url,file,ctx.check,ctx.progress,maximum=min(MAX_FILE,MAX_BYTES-ctx.received));ctx.received+=info['bytes'];ctx.stage('verify','위성 TPK 형식·실제 bundle 검사');metadata=validate_tpk(file,ctx.check)
        if any(z not in metadata['zoomLevels'] for z in selected):raise WorkError('export 결과에 요청한 실제 LOD가 누락됐습니다. 등록하지 않았습니다.')
        atomic(out/'maps.json',{'version':1,'sources':[{'id':'downloaded','name':ctx.request['name'],'file':'map.tpk','role':'base','priority':0,'minZoom':min(selected),'maxZoom':max(selected),'usageConfirmed':True,'enabled':True}]})
        metadata={'provider':'World Imagery official exportTiles','sourceURL':ARCGIS,'license':'Esri World Imagery export terms; account-specific offline/transfer rights','licenseURL':'https://www.arcgis.com/home/item.html?id=226d23f076da478bba4589e7eae95952','attribution':c['attribution'],'download':info,'requestedBounds':b,**metadata,'minZoom':min(metadata['zoomLevels']),'maxZoom':max(metadata['zoomLevels']),'originalResolution':'varies by location and source date; selected LOD is not a ground-accuracy guarantee','notice':f"실제 {metadata['nonEmptyTileRecords']} 타일 레코드와 LOD를 검사했습니다. 원본에 영상이 없는 일부 타일은 표시되지 않습니다. 촬영 시점/지상 정확도는 지역별로 다르며 이 다운로드 시점을 촬영일로 보지 마세요.",'usageConfirmed':True}
        originals.store(ctx,'satellite',file,metadata);return metadata
    except BaseException:
        try:arc(ctx.net,'/jobs/'+job+'/cancel',token=token)
        except Exception:pass
        raise

def validate_osm(root):
    m=read_json(root/'metadata.json',65536)
    if m.get('type')!='osm-sqlite' or m.get('version')!=1 or m.get('usageConfirmed') is not True or not re.fullmatch(r'sets/[a-zA-Z0-9_-]+/map\.sqlite',m.get('database','')):raise WorkError('Invalid prepared OSM metadata')
    b=m.get('bounds');bounds(b)
    path=root/m['database']
    if not path.is_file() or path.is_symlink():raise WorkError('OSM index missing')
    with sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True) as db:
        db.execute('PRAGMA trusted_schema=OFF')
        if db.execute('PRAGMA user_version').fetchone()[0]!=2 or db.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise WorkError('Invalid OSM index')
        for table in ('features','feature_index'):db.execute('SELECT * FROM '+table+' LIMIT 1').fetchone()
        db.execute('SELECT source_key,fingerprint,readonly_reason FROM features LIMIT 1').fetchone()
    return m

def validate_elevation(root):
    m=read_json(root/'metadata.json',65536)
    if m.get('version')!=1 or m.get('projection')!='EPSG:3857' or m.get('encoding')!='terrarium' or m.get('tileSize')!=256 or m.get('units')!='m' or m.get('usageConfirmed') is not True or not re.fullmatch(r'sets/[a-zA-Z0-9_-]+',m.get('tiles','')):raise WorkError('Invalid prepared DEM metadata')
    bounds(m.get('bounds'))
    if not 0<=m.get('minZoom',-1)<=m.get('maxZoom',20)<=19 or not all(isinstance(m.get(k),(int,float)) and math.isfinite(m[k]) for k in ('minElevation','maxElevation')) or m['minElevation']>m['maxElevation']:raise WorkError('Invalid DEM values/LOD')
    counts={}
    for kind in ('height','color'):
        files=list((root/m['tiles']/kind).glob('*/*/*.png'));counts[kind]=len(files)
        if not files or len(files)>10000:raise WorkError('DEM tile count invalid')
        for f in files:
            if f.is_symlink() or f.stat().st_size>2*1024**2:raise WorkError('DEM tile file invalid')
            with f.open('rb') as stream:header=stream.read(26)
            if header[:8]!=b'\x89PNG\r\n\x1a\n' or struct.unpack('>II',header[16:24])!=(256,256) or header[24]!=8 or header[25]!=6:raise WorkError('DEM tile format invalid')
    if counts['height']!=counts['color']:raise WorkError('DEM height/color mismatch')
    return m
ADAPTERS={'osm':osm,'elevation':elevation,'satellite':satellite}
