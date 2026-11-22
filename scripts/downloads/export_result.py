"""Resolve a single official ArcGIS TPK without persisting authenticated URLs."""
import json, urllib.parse
from html.parser import HTMLParser
from common import WorkError, Blocked, safe_url

HOST='tiledbasemaps.arcgis.com'
ROOTS=('/arcgis/rest/directories/arcgisoutput/','/arcgis/rest/directories/arcgisjobs/')
UNSUPPORTED='현재 리더가 지원하지 않는 TPKX 형식입니다. 확장자를 바꾸지 않고 중단합니다.'

def checked(url):
    try:
        if not isinstance(url,str) or len(url)>8192 or any(ord(c)<33 or ord(c)>126 for c in url):raise ValueError()
        safe_url(url);u=urllib.parse.urlsplit(url);path=urllib.parse.unquote(u.path,errors='strict')
        if u.hostname!=HOST or '\\' in path or '%' in path or any(ord(c)<32 or ord(c)==127 for c in path) or any(p in ('.','..') for p in path.split('/')):raise ValueError()
        return u,path
    except (ValueError,UnicodeError,WorkError):raise WorkError('지원하지 않는 ArcGIS export 결과 URL입니다.') from None

def authenticated(url,token,listing=False):
    u,_=checked(url);q=urllib.parse.parse_qsl(u.query,keep_blank_values=True)
    if not listing and (not token or any(k.lower()=='token' and v for k,v in q)):return url
    if listing:q=[(k,v) for k,v in q if k.lower()!='f']+[('f','json')]
    if token and not any(k.lower()=='token' and v for k,v in q):q=[(k,v) for k,v in q if k.lower()!='token']+[('token',token)]
    return urllib.parse.urlunsplit(u._replace(query=urllib.parse.urlencode(q)))

class Links(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag.lower()=='a':
            for key,value in attrs:
                if key.lower()=='href' and value is not None:
                    self.links.append(value)
                    if len(self.links)>256:raise WorkError('ArcGIS export 파일 목록이 256개를 초과합니다.')

def resolve(net,value,token,check=lambda:None):
    values=value if isinstance(value,list) else [value]
    urls=[v.get('url') if isinstance(v,dict) else v for v in values]
    if len(urls)!=1 or not isinstance(urls[0],str):raise WorkError('한 개 TPK 또는 결과 디렉터리가 아닌 export 결과입니다.')
    url=urls[0];u,path=checked(url)
    if path.lower().endswith('.tpk'):return authenticated(url,token)
    if path.lower().endswith('.tpkx'):raise WorkError(UNSUPPORTED)
    if not path.startswith(ROOTS) or path.rstrip('/') in tuple(r.rstrip('/') for r in ROOTS):raise WorkError('지원하지 않는 ArcGIS export 결과 디렉터리입니다.')
    check();raw=net.document(authenticated(url,token,listing=True));check()
    try:body=raw.decode('utf-8-sig')
    except UnicodeError:raise WorkError('ArcGIS export 파일 목록의 인코딩이 잘못됐습니다.') from None
    if body.lstrip().startswith(('{','[')):
        try:listing=json.loads(body)
        except ValueError:raise WorkError('ArcGIS export 파일 목록 JSON이 잘못됐습니다.') from None
        if isinstance(listing,dict) and isinstance(listing.get('error'),dict):
            code=listing['error'].get('code')
            if code in (498,499,401,403):raise Blocked('ArcGIS export 파일 목록 인증·권한 오류입니다. 토큰 만료·ARCGIS_REFERER를 확인하세요.')
            raise WorkError('ArcGIS export 파일 목록 요청이 거부됐습니다.')
        if not isinstance(listing,dict) or not isinstance(listing.get('files'),list):raise WorkError('ArcGIS export 파일 목록 형식을 확인할 수 없습니다.')
        links=[]
        for entry in listing['files']:
            href=entry.get('url') or entry.get('name') if isinstance(entry,dict) else entry
            if not isinstance(href,str):raise WorkError('ArcGIS export 파일 항목이 잘못됐습니다.')
            links.append(href)
    elif body.lstrip().lower().startswith(('<!doctype html','<html','<head','<body')):
        parser=Links();parser.feed(body);parser.close();links=parser.links
    else:raise WorkError('ArcGIS export 파일 목록 응답을 확인할 수 없습니다.')
    if len(links)>256:raise WorkError('ArcGIS export 파일 목록이 256개를 초과합니다.')
    base=urllib.parse.urlunsplit(u._replace(path=u.path.rstrip('/')+'/',query=''));parent=path.rstrip('/')+'/';files={};tpkx=False
    for href in links:
        # Navigation and unrelated directory assets are never fetched.
        try:link_path=urllib.parse.urlsplit(href).path
        except ValueError:raise WorkError('ArcGIS export 파일 링크가 잘못됐습니다.') from None
        if not link_path.lower().endswith(('.tpk','.tpkx')):continue
        if any(p in ('.','..') for p in urllib.parse.unquote(link_path).split('/')):raise WorkError('ArcGIS export 파일 경로 이동은 허용하지 않습니다.')
        candidate=urllib.parse.urljoin(base,href);child,child_path=checked(candidate)
        if child_path.rsplit('/',1)[0]+'/'!=parent:raise WorkError('ArcGIS export 파일이 결과 디렉터리 밖을 가리킵니다.')
        if child_path.lower().endswith('.tpkx'):tpkx=True;continue
        if child_path in files and files[child_path]!=candidate:raise WorkError('동일 ArcGIS export 파일의 URL이 서로 다릅니다.')
        files[child_path]=candidate
    if not files and tpkx:raise WorkError(UNSUPPORTED)
    if not files:raise WorkError('ArcGIS export 결과 디렉터리에 TPK 파일이 없습니다.')
    if len(files)!=1:raise WorkError('ArcGIS export 결과에 TPK 파일이 여러 개 있어 선택하지 않았습니다.')
    return authenticated(next(iter(files.values())),token)
