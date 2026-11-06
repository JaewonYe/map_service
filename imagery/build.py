"""Build RGB, near-infrared false-color and NDVI tiles from retained S2 bands, offline."""
import argparse
from contextlib import ExitStack
import io
import json
import math
from pathlib import Path
import sqlite3
import tempfile

import numpy as np
from PIL import Image
import rasterio
from rasterio.enums import Resampling
from rasterio.merge import merge
from rasterio.transform import from_bounds
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_bounds
from download import checksum

EXTENT = 20037508.342789244


def tile_bounds(z, x, y):
    span = EXTENT * 2 / 2**z
    return (-EXTENT+x*span, EXTENT-(y+1)*span, -EXTENT+(x+1)*span, EXTENT-y*span)


def tile_range(bbox, z):
    def coordinate(lon, lat):
        return ((lon+180)/360*2**z, (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z)
    left, bottom = coordinate(bbox[0], bbox[1])
    right, top = coordinate(bbox[2], bbox[3])
    return range(max(0,math.floor(left)),min(2**z,math.ceil(right))), range(max(0,math.floor(top)),min(2**z,math.ceil(bottom)))


def render(bands):
    """Reflectance in physical units; do not calculate NDVI from display RGB."""
    red, green, blue, nir = [bands[key] for key in ('red','green','blue','nir')]
    valid = np.logical_and.reduce([np.isfinite(value) for value in bands.values()])
    def stretch(value):
        return (np.clip(value/0.3,0,1)**(1/2.2)*255).astype('uint8')
    with np.errstate(invalid='ignore', divide='ignore'):
        natural = np.stack([stretch(np.nan_to_num(value)) for value in (red,green,blue)])
        infrared = np.stack([stretch(np.nan_to_num(value)) for value in (nir,red,green)])
        index = np.where(valid & ((nir+red)>0), (nir-red)/(nir+red), np.nan)
    stops = [-1,0,0.2,0.5,1]
    colors = np.array([[35,75,150],[210,190,155],[230,220,150],[85,155,60],[0,80,35]])
    ndvi = np.stack([np.interp(np.nan_to_num(index),stops,colors[:,channel]) for channel in range(3)]).astype('uint8')
    alpha = valid.astype('uint8')*255
    return {
        'rgb': np.concatenate([natural,alpha[None,...]]),
        'infrared': np.concatenate([infrared,alpha[None,...]]),
        'ndvi': np.concatenate([ndvi,(np.isfinite(index).astype('uint8')*255)[None,...]])
    }


def write_tiles(path, rgba, transform, bbox, minzoom, maxzoom, attribution):
    mosaic_path = path.with_suffix('.tif')
    with rasterio.open(mosaic_path,'w',driver='GTiff',width=rgba.shape[2],height=rgba.shape[1],count=4,
                       dtype='uint8',crs='EPSG:3857',transform=transform) as mosaic:
        mosaic.write(rgba)
    count = 0
    with sqlite3.connect(path) as db, rasterio.open(mosaic_path) as mosaic:
        db.execute('CREATE TABLE metadata (name TEXT PRIMARY KEY,value TEXT)')
        db.execute('CREATE TABLE tiles (zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB,PRIMARY KEY(zoom_level,tile_column,tile_row))')
        for name,value in {'format':'png','minzoom':str(minzoom),'maxzoom':str(maxzoom),
                           'bounds':','.join(map(str,bbox)),'attribution':attribution}.items():
            db.execute('INSERT INTO metadata VALUES (?,?)',(name,value))
        for z in range(minzoom,maxzoom+1):
            xs,ys=tile_range(bbox,z)
            for x in xs:
                for y in ys:
                    with WarpedVRT(mosaic,crs='EPSG:3857',transform=from_bounds(*tile_bounds(z,x,y),256,256),
                                   width=256,height=256,resampling=Resampling.bilinear) as vrt:
                        tile=vrt.read()
                    if not tile[3].any(): continue
                    output=io.BytesIO()
                    Image.fromarray(np.moveaxis(tile,0,-1)).save(output,format='PNG')
                    db.execute('INSERT INTO tiles VALUES (?,?,?,?)',(z,x,2**z-1-y,output.getvalue()))
                    count+=1
            print(f'{path.stem}: built z{z}',flush=True)
    if not count: raise RuntimeError('No imagery tiles')
    return count


def build(root,minzoom=6,maxzoom=14):
    if not 0<=minzoom<=maxzoom<=14: raise ValueError('Supported imagery zoom range: 0..14')
    acquisition=json.loads((root/'source/acquisition.json').read_text())
    processed=root/'processed';processed.mkdir(parents=True,exist_ok=True)
    bbox=acquisition['bbox']
    bounds=transform_bounds('EPSG:4326','EPSG:3857',*bbox)
    resolution=2*EXTENT/(256*2**maxzoom)
    with tempfile.TemporaryDirectory(prefix='.build-',dir=processed) as temporary, ExitStack() as stack:
        temp=Path(temporary);bands={};transform=None
        if not acquisition['scenes']: raise RuntimeError('No source scenes')
        for band in ('red','green','blue','nir'):
            sources=[];calibration=None
            for scene in acquisition['scenes']:
                asset=scene['bands'][band];path=(root/asset['file']).resolve()
                if not path.is_relative_to(root.resolve()) or checksum(path)!=asset['sha256']:
                    raise RuntimeError('Source path or SHA256 mismatch; existing tiles are preserved.')
                current=(float(asset['scale']),float(asset['offset']))
                if calibration is not None and current!=calibration:
                    raise RuntimeError('Scenes have different radiometric calibration; use a consistent scene set.')
                calibration=current
                dataset=stack.enter_context(rasterio.open(path))
                if dataset.count!=1: raise RuntimeError('Expected individual reflectance bands, not display RGB.')
                sources.append(stack.enter_context(WarpedVRT(dataset,crs='EPSG:3857',resampling=Resampling.bilinear,nodata=0)))
            mosaic,transform=merge(sources,indexes=[1],bounds=bounds,res=resolution,nodata=0,method='first',masked=True)
            bands[band]=mosaic[0].astype('float32').filled(np.nan)*calibration[0]+calibration[1]
        coverage=float(np.logical_and.reduce([np.isfinite(value) for value in bands.values()]).mean())
        if coverage<0.98: raise RuntimeError(f'Only {coverage:.1%} pixel coverage; missing scenes. Existing tiles preserved.')
        dates=sorted({scene['datetime'][:10] for scene in acquisition['scenes']})
        attribution=f'Contains modified Copernicus Sentinel data ({", ".join(sorted({date[:4] for date in dates}))})'
        variants={}
        for identity,rgba in render(bands).items():
            target=temp/f'{identity}.mbtiles'
            count=write_tiles(target,rgba,transform,bbox,minzoom,maxzoom,attribution)
            digest=checksum(target);filename=f'{identity}-{digest[:16]}.mbtiles'
            variants[identity]={'mbtiles':f'processed/{filename}','sha256':digest,'tiles':count}
            target.replace(processed/filename)
        manifest={**acquisition,'ready':True,'minzoom':minzoom,'maxzoom':maxzoom,'dates':dates,
                  'attribution':attribution,'coverage':coverage,'variants':variants,'nominal_resolution_m':10,
                  'acquisition_sha256':checksum(root/'source/acquisition.json'),
                  'display':{'stretch_reflectance':[0,0.3],'gamma':2.2,'infrared_bands':['nir','red','green'],
                             'ndvi_formula':'(nir-red)/(nir+red)','ndvi_range':[-1,1]},
                  'note':'Same calibrated scenes for RGB/NIR/NDVI; clouds may remain. Visualization, not a validated vegetation assessment.'}
        (temp/'manifest.json').write_text(json.dumps(manifest,indent=2))
        (temp/'manifest.json').replace(root/'manifest.json')
        print('Published RGB, infrared and NDVI; raw bands remain in source/.')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=Path('/data/taean/sentinel2'))
    parser.add_argument('--minzoom',type=int,default=6)
    parser.add_argument('--maxzoom',type=int,default=14)
    args=parser.parse_args();build(args.root,args.minzoom,args.maxzoom)
