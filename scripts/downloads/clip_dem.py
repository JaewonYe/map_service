"""Local-only GDAL mosaic/clip child so the worker can cancel and keep its heartbeat."""
import argparse
from pathlib import Path
from osgeo import gdal

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--bounds',nargs=4,type=float,required=True);p.add_argument('--output',required=True);p.add_argument('inputs',nargs='+');a=p.parse_args()
    if any(not Path(f).is_file() or Path(f).is_symlink() for f in a.inputs):raise ValueError('Local DEM files required')
    gdal.UseExceptions();gdal.SetConfigOption('GDAL_PAM_ENABLED','NO');vrt=gdal.BuildVRT('',a.inputs)
    if not vrt:raise ValueError('DEM mosaic failed')
    result=gdal.Warp(a.output,vrt,format='GTiff',dstSRS='EPSG:4326',outputBounds=a.bounds,xRes=1/3600,yRes=1/3600,resampleAlg='bilinear',dstNodata=-32767,outputType=gdal.GDT_Float32,warpMemoryLimit=128*1024**2,copyMetadata=False,creationOptions=['COMPRESS=DEFLATE','TILED=YES'])
    if not result:raise ValueError('DEM clip failed')
    result=None;vrt=None
