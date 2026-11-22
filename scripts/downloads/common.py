"""Bounded file/network primitives. Production accepts only named HTTPS providers."""
import datetime, email.utils, hashlib, json, math, os, re, shutil, time, urllib.error, urllib.parse, urllib.request, uuid
from pathlib import Path
KINDS=('satellite','osm','elevation')
HOSTS={'download.geofabrik.de','copernicus-dem-30m.s3.amazonaws.com','tiledbasemaps.arcgis.com','portal.opentopography.org'}
REGIONS={'south-korea':('대한민국','asia/south-korea',dict(west=124,south=33,east=132,north=39.5)), 'monaco':('Monaco','europe/monaco',dict(west=7.4,south=43.72,east=7.45,north=43.76))}
MAX_FILE=2*1024**3
MAX_BYTES=4*1024**3
RESERVE=512*1024**2
class WorkError(Exception):pass
class Blocked(WorkError):pass
class Cancelled(WorkError):pass
class WorkerBusy(WorkError):pass
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
def identity(value):
    if not isinstance(value,str) or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',value):raise WorkError('Invalid job/package identity')
    return value
def atomic(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);temporary=path.with_name('.'+path.name+'.'+uuid.uuid4().hex+'.tmp')
    try:
        with temporary.open('x') as f:os.chmod(temporary,0o600);json.dump(value,f,ensure_ascii=False,allow_nan=False);f.write('\n');f.flush();os.fsync(f.fileno())
        os.replace(temporary,path)
    finally:temporary.unlink(missing_ok=True)
def read_json(path,limit=262144):
    path=Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size>limit:raise WorkError('Invalid state file')
    return json.loads(path.read_text())
def digest(path,algorithm='sha256'):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,algorithm).hexdigest()
def bounds(v):
    if not isinstance(v,dict) or any(isinstance(v.get(k),bool) or not isinstance(v.get(k),(int,float)) or not math.isfinite(v[k]) for k in ('west','south','east','north')):raise WorkError('Invalid bbox')
    if not -180<=v['west']<v['east']<=180 or not -85<=v['south']<v['north']<=85 or v['east']-v['west']>15 or v['north']-v['south']>15:raise WorkError('Invalid/oversized bbox')
    return {k:round(v[k],7) for k in ('west','south','east','north')}
def tile_count(b,lo,hi):
    ntiles=0
    for z in range(lo,hi+1):
        n=2**z;x=lambda lon:max(0,min(n-1,math.floor((lon+180)/360*n)));y=lambda lat:max(0,min(n-1,math.floor((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n)))
        ntiles+=(x(b['east'])-x(b['west'])+1)*(y(b['south'])-y(b['north'])+1)
    return ntiles
def validate_request(v):
    if not isinstance(v,dict) or v.get('version')!=1:raise WorkError('Unsupported request version')
    identity(v.get('id'))
    if type(v.get('registryRevision')) is not int or v['registryRevision']<0:raise WorkError('Invalid registry revision')
    if v.get('type') in ('activate','reset','import'):
        if v['type']=='activate':identity(v.get('packageId'))
        return v
    if v.get('type')!='download':raise WorkError('Unsupported task type')
    b=bounds(v.get('bounds'));v['bounds']=b
    if not isinstance(v.get('name'),str) or not 1<=len(v['name'].strip())<=80:raise WorkError('Invalid job name')
    if not isinstance(v.get('kinds'),list) or not 1<=len(v['kinds'])<=3 or len(set(v['kinds']))!=len(v['kinds']) or any(k not in KINDS for k in v['kinds']):raise WorkError('Invalid layer kinds')
    if v.get('region') not in REGIONS:raise WorkError('Unsupported PBF region')
    v.setdefault('demProvider','opentopography');v['refresh']=v.get('refresh') is True
    if v['demProvider'] not in ('opentopography','aws'):raise WorkError('Unsupported DEM provider')
    for kind,maximum in [('satellite',19),('elevation',15)]:
        l=v.get('levels',{}).get(kind,{})
        if type(l.get('min')) is not int or type(l.get('max')) is not int or not 0<=l['min']<=l['max']<=maximum:raise WorkError('Unsupported display LOD')
        if kind in v['kinds'] and tile_count(b,l['min'],l['max'])>10000:raise WorkError('Too many display tiles (10,000 limit)')
    if 'elevation' in v['kinds'] and v['demProvider']=='aws' and (math.ceil(b['east'])-math.floor(b['west'])>4 or math.ceil(b['north'])-math.floor(b['south'])>4):raise WorkError('DEM limited to 4 by 4 source tiles')
    area=6371.0088**2*abs(math.radians(b['east']-b['west'])*(math.sin(math.radians(b['north']))-math.sin(math.radians(b['south']))))
    if 'elevation' in v['kinds'] and v['demProvider']=='opentopography' and area>1000:raise WorkError('이 앱의 OpenTopography 작업 한도는1,000km²입니다.')
    if any(v.get('accepted',{}).get(k) is not True for k in v['kinds']):raise Blocked('각 제공처 이용·오프라인 이전 조건을 먼저 확인하세요.')
    if type(v.get('registryRevision')) is not int or v['registryRevision']<0:raise WorkError('Invalid registry revision')
    return v
def safe_url(url):
    u=urllib.parse.urlsplit(url)
    if u.scheme!='https' or u.hostname not in HOSTS or u.port not in (None,443) or u.username or u.password or u.fragment:raise WorkError('Unapproved provider/redirect URL')
    return url
class Redirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return super().redirect_request(req,fp,code,msg,headers,safe_url(newurl))
class Network:
    def __init__(self,backoff_file=None):self.opener=urllib.request.build_opener(Redirect());self.backoff_file=backoff_file
    def open(self,url,data=None,method=None):
        safe_url(url)
        host=urllib.parse.urlsplit(url).hostname;backoff={}
        if self.backoff_file and self.backoff_file.exists():
            backoff=read_json(self.backoff_file,8192)
            if not isinstance(backoff,dict) or any(k not in HOSTS or not isinstance(v,(int,float)) or not math.isfinite(v) for k,v in backoff.items()):raise WorkError('제공처 재시도 상태 파일이 손상됐습니다. 보존 후 복구하세요.')
        if backoff.get(host,0)>time.time():raise Blocked('제공처 Retry-After 대기 중입니다. '+datetime.datetime.fromtimestamp(backoff[host],datetime.timezone.utc).isoformat()+' 이후 재시도하세요.')
        try:return self.opener.open(urllib.request.Request(url,data=data,method=method,headers={'User-Agent':'MapServiceOfflineManager/1.0','Accept-Encoding':'identity'}),timeout=20)
        except urllib.error.HTTPError as e:
            if e.code==429 and self.backoff_file:
                raw=e.headers.get('Retry-After','60')
                try:delay=float(raw) if raw.isdigit() else email.utils.parsedate_to_datetime(raw).timestamp()-time.time()
                except Exception:delay=60
                backoff[host]=time.time()+max(1,delay);atomic(self.backoff_file,backoff)
            if e.code in (401,403,429):raise Blocked(f'제공처 HTTP {e.code}: 권한·사용량/접속 제한을 확인하세요.') from None
            raise WorkError(f'제공처 HTTP {e.code}; 완료 파일은 등록하지 않았습니다.') from None
        except urllib.error.URLError:raise Blocked('다운로드 서버 연결이 차단되었거나 실패했습니다. 프록시·호스트 허용 상태를 확인하세요. 계정 권한은 별도 확인이 필요합니다.') from None
    def json(self,url,params=None):
        data=None if params is None else urllib.parse.urlencode(params).encode()
        with self.open(url,data=data) as r:
            raw=r.read(1024*1024+1)
            if len(raw)>1024*1024:raise WorkError('Provider JSON exceeds 1MiB')
            return json.loads(raw)
    def download(self,url,target,check,progress,maximum=MAX_FILE,checksum=None,algorithm='sha256'):
        target=Path(target);target.parent.mkdir(parents=True,exist_ok=True);part=target.with_suffix(target.suffix+'.part');part.unlink(missing_ok=True)
        start=time.monotonic();received=0;expected=None
        try:
            with self.open(url) as r,part.open('xb') as out:
                expected=int(r.headers['Content-Length']) if r.headers.get('Content-Length') else None
                if expected is not None and (expected<=0 or expected>maximum):raise WorkError('원본 크기가 작업당 다운로드 한도를 초과합니다.')
                if expected and shutil.disk_usage(target.parent).free<expected+RESERVE:raise WorkError('디스크 여유가 부족합니다. 원본은 등록하지 않았습니다.')
                while True:
                    check()
                    if time.monotonic()-start>1800:raise WorkError('다운로드 제한 시간30분을 초과했습니다.')
                    chunk=getattr(r,'read1',r.read)(256*1024)
                    if not chunk:break
                    received+=len(chunk)
                    if received>maximum or shutil.disk_usage(target.parent).free<len(chunk)+RESERVE:raise WorkError('다운로드/디스크 한도 초과')
                    out.write(chunk);progress(received,expected)
                out.flush();os.fsync(out.fileno())
            if received==0 or expected is not None and received!=expected:raise WorkError('다운로드가 중단됐습니다. 부분 파일을 폐기하고 다시 시도하세요.')
            if checksum and digest(part,algorithm)!=checksum:raise WorkError('제공처 checksum 불일치')
            check();os.replace(part,target)
            return {'bytes':received,'sha256':digest(target),'etag':r.headers.get('ETag'),'lastModified':r.headers.get('Last-Modified'),'checksum':{'algorithm':algorithm,'verified':True} if checksum else None}
        finally:part.unlink(missing_ok=True)
