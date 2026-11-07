"""Archive a bounded Esri RGB tile set locally. Credentials are never archived."""
import argparse
import hashlib
import html
import io
import json
import math
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen
from PIL import Image

SERVICE = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
BBOX = [125.45, 36.35, 126.55, 37.08]


def checksum(path):
    digest=hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda:source.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()


def atomic_json(path, value):
    partial = path.with_suffix('.next.json')
    partial.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    partial.replace(path)


def request(path, token):
    params = {'f':'json'} if not path.startswith('/tile/') else {}
    if token: params['token'] = token
    url = SERVICE + path + (('?' + urlencode(params)) if params else '')
    time.sleep(0.2)  # At most five sequential service requests per second.
    try:
        with urlopen(url, timeout=90) as response: return response.read()
    except HTTPError as error:
        raise RuntimeError(f'Esri HTTP {error.code}; check account permissions, token, limits and network. Existing files retained.') from None
    except URLError:
        raise RuntimeError('Esri connection failed. Check network/proxy access. Existing files retained.') from None


def tiles(bbox, minzoom, maxzoom):
    west,south,east,north = bbox
    if not (-180 <= west < east <= 180 and -85 <= south < north <= 85): raise ValueError('Invalid bbox')
    for z in range(minzoom,maxzoom+1):
        def position(lon,lat):
            return ((lon+180)/360*2**z,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z)
        left,bottom=position(west,south);right,top=position(east,north)
        for x in range(math.floor(left),math.ceil(right)):
            for y in range(math.floor(top),math.ceil(bottom)): yield z,x,y


def download(root,bbox=BBOX,minzoom=6,maxzoom=15,max_tiles=15000):
    if not 0 <= minzoom <= maxzoom <= 19: raise ValueError('Invalid zoom range (0..19)')
    wanted=list(tiles(bbox,minzoom,maxzoom))
    if len(wanted)>max_tiles: raise RuntimeError(f'{len(wanted)} tiles exceed limit {max_tiles}; reduce area/zoom or explicitly increase --max-tiles.')
    token=os.environ.get('ESRI_API_KEY','').strip()
    metadata=json.loads(request('',token))
    if 'error' in metadata: raise RuntimeError(f"Esri service error {metadata['error'].get('code')}; account authentication may be required.")
    info=metadata.get('tileInfo',{})
    if info.get('spatialReference',{}).get('wkid') not in (3857,102100,102113) or info.get('rows')!=256 or info.get('cols')!=256:
        raise RuntimeError('Expected 256px Web Mercator tiles.')
    origin=info.get('origin',{})
    if abs(origin.get('x',0)+20037508.342789244)>1 or abs(origin.get('y',0)-20037508.342789244)>1:
        raise RuntimeError('Unexpected Esri tile origin.')
    levels={lod['level'] for lod in info['lods']}
    if any(z not in levels for z in range(minzoom,maxzoom+1)): raise RuntimeError('Requested zoom level is not supported by service.')
    source=root/'source';source.mkdir(parents=True,exist_ok=True)
    atomic_json(source/'service.json',metadata)
    records=[]
    for i,(z,x,y) in enumerate(wanted):
        target=source/'tiles'/str(z)/str(x)/f'{y}.tile'
        receipt=target.with_suffix('.sha256')
        target.parent.mkdir(parents=True,exist_ok=True)
        if not (target.is_file() and receipt.is_file() and checksum(target)==receipt.read_text().strip()):
            body=request(f'/tile/{z}/{y}/{x}',token)  # Esri uses z / row / column.
            with Image.open(io.BytesIO(body)) as image:
                if image.size!=(256,256) or image.format not in ('JPEG','PNG'): raise RuntimeError('Unexpected RGB tile response.')
                image.verify()
            temporary=target.with_suffix('.part');temporary.write_bytes(body);temporary.replace(target)
            receipt.write_text(checksum(target)+'\n')
        records.append({'z':z,'x':x,'y':y,'file':target.relative_to(root).as_posix(),'sha256':checksum(target)})
        if i%100==0: print(f'{i+1}/{len(wanted)} tiles archived',flush=True)
    acquisition={'source':'Esri World Imagery','service':SERVICE,'bbox':bbox,'minzoom':minzoom,'maxzoom':maxzoom,
                 'attribution':html.escape(metadata.get('copyrightText') or 'Esri and its data providers'),
                 'service_metadata_sha256':checksum(source/'service.json'),'tiles':records,
                 'note':'RGB tiles, not spectral bands. Native resolution and imagery dates vary by location. Use under your applicable service permissions.'}
    atomic_json(source/'acquisition.json',acquisition)
    print('RGB archive complete. Run imagery-build; keep source/ for future reuse.')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=Path('/data/taean/esri'))
    parser.add_argument('--bbox',type=float,nargs=4,default=BBOX)
    parser.add_argument('--minzoom',type=int,default=6)
    parser.add_argument('--maxzoom',type=int,default=15)
    parser.add_argument('--max-tiles',type=int,default=15000)
    args=parser.parse_args();download(args.root,args.bbox,args.minzoom,args.maxzoom,args.max_tiles)
