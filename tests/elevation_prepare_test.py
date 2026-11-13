"""GDAL conversion integration tests. /usr/bin/python3 -m unittest discover -s tests -p '*_test.py'"""
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
import numpy as np
from osgeo import gdal, osr

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/'scripts/elevation/prepare.py'
spec = importlib.util.spec_from_file_location('prepare_dem', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ElevationPreparation(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root/'source.tif'
        dataset = gdal.GetDriverByName('GTiff').Create(str(self.source),64,64,1,gdal.GDT_Float32)
        dataset.SetGeoTransform((126.235,.0001,0,36.602,0,-.0001))
        srs = osr.SpatialReference(); srs.ImportFromEPSG(4326); dataset.SetProjection(srs.ExportToWkt())
        values = np.full((64,64),123.5,dtype=np.float32)
        values[:10,:10] = -9999
        dataset.GetRasterBand(1).SetNoDataValue(-9999)
        dataset.GetRasterBand(1).WriteArray(values)
        dataset = None
        self.digest = hashlib.sha256(self.source.read_bytes()).hexdigest()

    def run_tool(self,*args):
        return subprocess.run(['/usr/bin/python3',str(SCRIPT),str(self.source),'--output',str(self.root/'output'),
                               '--min-zoom','13','--max-zoom','14',*args],capture_output=True,text=True)

    def test_inspection_permission_and_original_preservation(self):
        result = self.run_tool('--inspect')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(json.loads(result.stdout)['minElevation'],123.5)
        self.assertFalse((self.root/'output').exists())
        result = self.run_tool()
        self.assertNotEqual(result.returncode,0)
        self.assertIn('--confirm-usage',result.stderr)
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(),self.digest)
        self.assertFalse(self.source.with_suffix('.tif.aux.xml').exists())

    def test_conversion_metadata_native_height_and_atomic_replacement(self):
        result = self.run_tool('--confirm-usage','--vertical-datum','Test datum')
        self.assertEqual(result.returncode,0,result.stderr)
        metadata = json.loads((self.root/'output/metadata.json').read_text())
        self.assertEqual(metadata['sourceSha256'],self.digest)
        self.assertTrue(metadata['usageConfirmed']); self.assertEqual(metadata['verticalDatum'],'Test datum')
        self.assertEqual(metadata['bounds']['west'],126.235)
        folder = self.root/'output'/metadata['tiles']
        self.assertGreater(metadata['tileCount'],0)
        for path in folder.glob('height/*/*/*.png'):
            image = gdal.Open(str(path)); self.assertEqual(image.RasterCount,4)
            image = image.ReadAsArray()
            values = image[0].astype(float)*256+image[1]+image[2]/256-32768
            self.assertTrue(np.allclose(values[image[3]>0],123.5,atol=.004))
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(),self.digest)
        # Failed preparation leaves the published metadata and prior immutable set intact.
        result = self.run_tool('--confirm-usage','--max-tiles','0')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(json.loads((self.root/'output/metadata.json').read_text()),metadata)
        self.assertTrue(folder.is_dir())

    def test_color_and_height_preserve_zero_negative_and_nodata(self):
        heights = np.zeros((258,258),dtype=np.float32); heights[1:130,:] = -12.5
        valid = np.ones_like(heights,dtype=bool); valid[100,100] = False
        color,numeric = module.render(heights,valid,-12.5,100,10)
        decoded=numeric[:,:,0].astype(float)*256+numeric[:,:,1]+numeric[:,:,2]/256-32768
        self.assertEqual(decoded[20,20],-12.5); self.assertEqual(decoded[200,200],0)
        self.assertEqual(numeric[99,99,3],0); self.assertEqual(color[99,99,3],0)

if __name__ == '__main__':
    unittest.main()
