#!/usr/bin/env python3
"""Prepare an immutable local DEM dataset. Requires GDAL + NumPy; no runtime server.
Input is a single-band GeoTIFF in metres. Original data is never modified.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import uuid

import numpy as np
from osgeo import gdal, osr

gdal.UseExceptions()
RADIUS = 20037508.342789244
NODATA = -9999999.0


def inspect_source(filename):
    source = gdal.Open(str(filename), gdal.GA_ReadOnly)
    if not source or source.RasterCount != 1 or not source.GetProjection():
        raise ValueError('A georeferenced, single-band DEM GeoTIFF is required')
    if source.GetDriver().ShortName != 'GTiff':
        raise ValueError('Input must be a GeoTIFF (.tif)')
    band = source.GetRasterBand(1)
    if band.GetScale() not in (None, 1.0) or band.GetOffset() not in (None, 0.0):
        raise ValueError('First apply DEM scale/offset with gdal_translate -unscale -ot Float32')
    if band.GetUnitType().lower() not in ('', 'm', 'metre', 'meter', 'metres', 'meters'):
        raise ValueError('DEM values must be in metres; convert vertical units before preparing tiles')
    original = osr.SpatialReference(wkt=source.GetProjection())
    geographic = osr.SpatialReference()
    geographic.ImportFromEPSG(4326)
    for srs in (original, geographic):
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(original, geographic)
    gt = source.GetGeoTransform()
    points = []
    # Densify every edge; projected DEM edges may be curved in EPSG:4326.
    for i in range(65):
        a = i / 64
        for x, y in ((a*source.RasterXSize, 0), (a*source.RasterXSize, source.RasterYSize),
                     (0, a*source.RasterYSize), (source.RasterXSize, a*source.RasterYSize)):
            points.append(transform.TransformPoint(gt[0]+x*gt[1]+y*gt[2], gt[3]+x*gt[4]+y*gt[5]))
    bounds = dict(west=min(p[0] for p in points), east=max(p[0] for p in points),
                  south=max(-85.05112878, min(p[1] for p in points)),
                  north=min(85.05112878, max(p[1] for p in points)))
    if not (-180 <= bounds['west'] < bounds['east'] <= 180 and bounds['south'] < bounds['north']):
        raise ValueError('Unsupported DEM bounds (antimeridian and polar regions are not supported)')
    # Disable PAM so inspection cannot create a .aux.xml beside the original.
    minimum, maximum = band.ComputeRasterMinMax(False)
    if not (math.isfinite(minimum) and math.isfinite(maximum) and -32768 <= minimum <= maximum < 32768):
        raise ValueError('DEM must contain valid heights within Terrarium range [-32768, 32768) metres')
    return source, bounds, float(minimum), float(maximum)


def tile_xy(lon, lat, z):
    n = 2**z
    return (min(n-1, max(0, int((lon+180)/360*n))),
            min(n-1, max(0, int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n))))


def save_png(path, pixels):
    path.parent.mkdir(parents=True, exist_ok=True)
    memory = gdal.GetDriverByName('MEM').Create('', 256, 256, 4, gdal.GDT_Byte)
    for i in range(4):
        memory.GetRasterBand(i+1).WriteArray(pixels[:, :, i])
        memory.GetRasterBand(i+1).SetColorInterpretation((gdal.GCI_RedBand,gdal.GCI_GreenBand,gdal.GCI_BlueBand,gdal.GCI_AlphaBand)[i])
    output = gdal.GetDriverByName('PNG').CreateCopy(str(path), memory)
    output = None


def render(array, valid, minimum, maximum, metres_per_pixel):
    height = array[1:-1, 1:-1]
    mask = valid[1:-1, 1:-1]
    encoded = np.rint((np.where(mask, height, 0).astype(np.float64) + 32768) * 256).astype(np.int64)
    encoded = np.clip(encoded, 0, 16777215)
    numeric = np.stack(((encoded >> 16) & 255, (encoded >> 8) & 255, encoded & 255, mask*255), axis=-1).astype(np.uint8)
    t = np.clip((height-minimum)/max(1,maximum-minimum), 0, 1)
    stops = [0, .4, .75, 1]
    colors = np.array([[65,143,108],[218,193,123],[128,84,50],[250,246,235]])
    rgb = np.stack([np.interp(t, stops, colors[:,i]) for i in range(3)], axis=-1)
    left = np.where(valid[1:-1,:-2], array[1:-1,:-2], height)
    right = np.where(valid[1:-1,2:], array[1:-1,2:], height)
    up = np.where(valid[:-2,1:-1], array[:-2,1:-1], height)
    down = np.where(valid[2:,1:-1], array[2:,1:-1], height)
    dx, dy = (right-left)/(2*metres_per_pixel), (up-down)/(2*metres_per_pixel)
    # Unit normal dot a north-west light at 45 degrees elevation.
    shade = np.clip((.5*dx-.5*dy+math.sqrt(.5))/np.sqrt(dx*dx+dy*dy+1), 0, 1)
    color = np.concatenate((np.clip(rgb*(.45+.55*shade[:,:,None]),0,255).astype(np.uint8),
                            (mask*255).astype(np.uint8)[:,:,None]), axis=-1)
    return color, numeric


def prepare(args):
    gdal.SetConfigOption('GDAL_PAM_ENABLED', 'NO')
    source, bounds, minimum, maximum = inspect_source(args.input)
    metadata = dict(version=1, projection='EPSG:3857', tileSize=256, encoding='terrarium', units='m',
                    bounds=bounds, minZoom=args.min_zoom, maxZoom=args.max_zoom,
                    minElevation=round(minimum,2), maxElevation=round(maximum,2),
                    source=args.source, attribution=args.attribution, verticalDatum=args.vertical_datum,
                    usageConfirmed=False)
    if args.inspect:
        print(json.dumps(metadata, ensure_ascii=False, indent=2))
        return
    if not args.confirm_usage:
        raise ValueError('Only metadata inspection is allowed until --confirm-usage (or ELEVATION_USAGE_CONFIRMED=true)')
    if not 0 <= args.min_zoom <= args.max_zoom <= 19:
        raise ValueError('Require 0 <= min-zoom <= max-zoom <= 19')
    ranges = []
    count = 0
    for z in range(args.min_zoom, args.max_zoom+1):
        x0,y0 = tile_xy(bounds['west'], bounds['north'], z)
        x1,y1 = tile_xy(bounds['east'], bounds['south'], z)
        ranges.append((z,x0,y0,x1,y1))
        count += (x1-x0+1)*(y1-y0+1)
    if count > args.max_tiles:
        raise ValueError(f'{count} candidate tiles exceed --max-tiles {args.max_tiles}; lower zoom or crop the DEM')
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    dataset = 'sets/'+uuid.uuid4().hex
    staging = output/dataset
    staging.mkdir(parents=True)
    written = 0
    try:
        for z,x0,y0,x1,y1 in ranges:
            span = 2*RADIUS/(2**z)
            resolution = span/256
            for x in range(x0,x1+1):
                for y in range(y0,y1+1):
                    west, north = -RADIUS+x*span, RADIUS-y*span
                    warped = gdal.Warp('', source, format='MEM', dstSRS='EPSG:3857',
                                       outputBounds=(west-resolution,north-span-resolution,west+span+resolution,north+resolution),
                                       width=258,height=258,outputType=gdal.GDT_Float32,dstNodata=NODATA,resampleAlg='bilinear',
                                       multithread=False,warpMemoryLimit=64)
                    array = warped.GetRasterBand(1).ReadAsArray()
                    valid = np.isfinite(array) & (array != NODATA)
                    if not valid[1:-1,1:-1].any():
                        continue
                    latitude = math.atan(math.sinh(math.pi*(1-2*(y+.5)/(2**z))))
                    color,numeric = render(array,valid,minimum,maximum,resolution*math.cos(latitude))
                    save_png(staging/'color'/str(z)/str(x)/f'{y}.png',color)
                    save_png(staging/'height'/str(z)/str(x)/f'{y}.png',numeric)
                    written += 1
            print(f'Zoom {z}: {written} tiles prepared', flush=True)
        if not written:
            raise ValueError('No valid DEM pixels were found')
        # Hash the original for an auditable, portable dataset manifest.
        with open(args.input,'rb') as original:
            digest = hashlib.file_digest(original,'sha256').hexdigest()
        metadata.update(tiles=dataset,usageConfirmed=True,sourceSha256=digest,tileCount=written)
        temporary = output/f'.metadata-{uuid.uuid4().hex}.json'
        temporary.write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        os.replace(temporary,output/'metadata.json')
    except BaseException:
        shutil.rmtree(staging,ignore_errors=True)
        raise
    print(f'Complete: {output / "metadata.json"}. Restart the map service.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', nargs='?', default='/data/elevation/source/dem.tif')
    parser.add_argument('--output', default='/data/elevation')
    parser.add_argument('--min-zoom',type=int,default=int(os.getenv('DEM_MIN_ZOOM','8')))
    parser.add_argument('--max-zoom',type=int,default=int(os.getenv('DEM_MAX_ZOOM','13')))
    parser.add_argument('--max-tiles',type=int,default=20000)
    parser.add_argument('--source',default=os.getenv('DEM_SOURCE','Local DEM'))
    parser.add_argument('--attribution',default=os.getenv('DEM_ATTRIBUTION','Local DEM; see source licence'))
    parser.add_argument('--vertical-datum',default=os.getenv('DEM_VERTICAL_DATUM','Unknown vertical datum'))
    parser.add_argument('--confirm-usage',action='store_true',default=os.getenv('ELEVATION_USAGE_CONFIRMED')=='true')
    parser.add_argument('--inspect',action='store_true')
    try:
        prepare(parser.parse_args())
    except (ValueError,RuntimeError,FileNotFoundError) as error:
        parser.exit(1,f'DEM preparation failed: {error}\n')
