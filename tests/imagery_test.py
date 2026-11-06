"""Synthetic calibrated-band tests, never presented as actual satellite imagery."""
from contextlib import closing
import http.client
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import threading
import unittest

from PIL import Image
import io
import numpy as np
import rasterio
from rasterio.transform import from_bounds

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'imagery'))
from build import build, render
from download import checksum, choose_scenes
from verify import verify
import serve


class ImageryTest(unittest.TestCase):
    def test_cloud_selection(self):
        def scene(i,cloud,grid): return {'id':i,'properties':{'eo:cloud_cover':cloud,'grid:code':grid}}
        self.assertEqual([item['id'] for item in choose_scenes([scene('a',12,'x'),scene('b',3,'x'),scene('c',4,'y')],15)],['b','c'])
        with self.assertRaises(RuntimeError): choose_scenes([],15)

    def test_ndvi_uses_nir_and_red_not_display_rgb(self):
        bands={key:np.array([[value,np.nan]],dtype='float32') for key,value in {'red':0.1,'green':0.2,'blue':0.05,'nir':0.3}.items()}
        result=render(bands)
        self.assertEqual(set(result),{'rgb','infrared','ndvi'})
        # NDVI = (0.3-0.1)/(0.3+0.1) = 0.5, green palette knot.
        np.testing.assert_allclose(result['ndvi'][:3,0,0],[85,155,60],atol=1)
        self.assertEqual(result['ndvi'][3,0,1],0)
        self.assertFalse(np.array_equal(result['rgb'][:3,0,0],result['infrared'][:3,0,0]))

    def test_offline_build_serve_copy_and_corruption(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary)/'sentinel2';(folder/'source').mkdir(parents=True)
            bbox=[126.29,36.74,126.31,36.75];assets={}
            for band,dn in {'red':2000,'green':3000,'blue':1500,'nir':4000}.items():
                tif=folder/f'source/{band}.tif'
                with rasterio.open(tif,'w',driver='GTiff',width=64,height=64,count=1,dtype='uint16',crs='EPSG:4326',transform=from_bounds(*bbox,64,64)) as raster:
                    raster.write(np.full((1,64,64),dn,dtype='uint16'))
                assets[band]={'file':f'source/{band}.tif','sha256':checksum(tif),'scale':0.0001,'offset':-0.1}
            acquisition={'bbox':bbox,'scenes':[{'bands':assets,'datetime':'2025-10-15T00:00:00Z'}]}
            (folder/'source/acquisition.json').write_text(json.dumps(acquisition))
            build(folder,13,14);verify(folder)
            with tempfile.TemporaryDirectory() as destination:
                copied=Path(destination)/'sentinel2';shutil.copytree(folder,copied);verify(copied)
            serve.ROOT=folder.parent
            manifest=json.loads((folder/'manifest.json').read_text())
            self.assertEqual(set(manifest['variants']),{'rgb','infrared','ndvi'})
            self.assertTrue(all(entry['ready'] for entry in serve.metadata()['datasets']))
            httpd=serve.ThreadingHTTPServer(('127.0.0.1',0),serve.Handler)
            thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
            try:
                for identity,variant in manifest['variants'].items():
                    with closing(sqlite3.connect(folder/variant['mbtiles'])) as db:
                        z,x,tms,data=db.execute('SELECT zoom_level,tile_column,tile_row,tile_data FROM tiles LIMIT 1').fetchone()
                    client=http.client.HTTPConnection('127.0.0.1',httpd.server_port)
                    client.request('GET',f'/tile/{identity}/{z}/{x}/{2**z-1-tms}.png');response=client.getresponse()
                    self.assertEqual(response.status,200);self.assertEqual(response.read(),data);client.close()
                    if identity=='ndvi':
                        pixels=np.array(Image.open(io.BytesIO(data)))
                        opaque=pixels[pixels[:,:,3]==255]
                        self.assertTrue(len(opaque)>0)
                        np.testing.assert_allclose(opaque[0,:3],[85,155,60],atol=1)
            finally: httpd.shutdown();httpd.server_close();thread.join()
            before=(folder/'manifest.json').read_bytes()
            # Introduce a real nodata strip; strict mode must preserve the old version.
            for asset in assets.values():
                path=folder/asset['file']
                with rasterio.open(path,'r+') as raster:
                    pixels=raster.read();pixels[:,:,:4]=0;raster.write(pixels)
                asset['sha256']=checksum(path)
            (folder/'source/acquisition.json').write_text(json.dumps(acquisition))
            with self.assertRaisesRegex(RuntimeError,'--allow-partial'):
                build(folder,13,14)
            self.assertEqual((folder/'manifest.json').read_bytes(),before)
            build(folder,13,14,allow_partial=True)
            partial=json.loads((folder/'manifest.json').read_text())
            self.assertTrue(partial['partial']);self.assertLess(partial['coverage'],0.98)
            verify(folder)
            before=(folder/'manifest.json').read_bytes()
            (folder/'source/red.tif').write_bytes(b'corrupted')
            with self.assertRaises(RuntimeError):verify(folder)
            with self.assertRaises(RuntimeError):build(folder,13,14)
            self.assertEqual((folder/'manifest.json').read_bytes(),before)

    def test_missing_data_is_not_ready(self):
        with tempfile.TemporaryDirectory() as folder:
            serve.ROOT=Path(folder)
            self.assertTrue(all(not entry['ready'] for entry in serve.metadata()['datasets']))

class CoverageTest(unittest.TestCase):
    def test_boundary_excludes_missing_pixels_outside_county(self):
        from build import assess_coverage
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'source').mkdir()
            boundary={'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{
                'type':'Polygon','coordinates':[[[0,0],[0.5,0],[0.5,1],[0,1],[0,0]]]}}]}
            (root/'source/region.boundary.geojson').write_text(json.dumps(boundary))
            from rasterio.warp import transform_bounds
            transform=from_bounds(*transform_bounds('EPSG:4326','EPSG:3857',0,0,1,1),10,10)
            valid=np.zeros((10,10),dtype=bool);valid[:,:5]=True
            result=assess_coverage(valid,transform,root)
            self.assertEqual(result['coverage'],1)
            self.assertEqual(result['bbox_coverage'],0.5)
            self.assertFalse(result['partial'])

    def test_partial_requires_explicit_opt_in_and_does_not_fill_gaps(self):
        from build import assess_coverage
        with tempfile.TemporaryDirectory() as folder:
            valid=np.ones((10,10),dtype=bool);valid[0,:]=False
            transform=from_bounds(0,0,100,100,10,10)
            with self.assertRaisesRegex(RuntimeError,'--allow-partial'):
                assess_coverage(valid,transform,Path(folder))
            result=assess_coverage(valid,transform,Path(folder),True)
            self.assertTrue(result['partial']);self.assertEqual(result['coverage'],0.9)
            self.assertEqual(valid.sum(),90)
            with self.assertRaisesRegex(RuntimeError,'No valid imagery'):
                assess_coverage(np.zeros((10,10),dtype=bool),transform,Path(folder),True)
