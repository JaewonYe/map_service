"""Run in the prepare-osm image with /tests mounted read-only."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from types import SimpleNamespace
from shapely.geometry import LineString,Point,Polygon
from osm_fixture import write_fixture

SCRIPT=Path(os.getenv('OSM_PREPARE_SCRIPT',str(Path(__file__).resolve().parents[1]/'scripts/osm/prepare.py')))
spec=importlib.util.spec_from_file_location('osm_prepare',SCRIPT)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class OsmPreparation(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.source=self.root/'south-korea.osm.pbf';write_fixture(self.source)
        self.digest=hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.args=SimpleNamespace(directory=self.root,file=self.source.name,force=False)

    def test_actual_pbf_import_and_reuse_preserve_original(self):
        module.prepare(self.args)
        m=json.loads((self.root/'metadata.json').read_text())
        self.assertEqual(m['sourceSha256'],self.digest);self.assertTrue(m['coastlineFill'])
        self.assertEqual(m['sourceMtimeMs'],self.source.stat().st_mtime_ns//1000000)
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(),self.digest)
        db=sqlite3.connect(self.root/m['database'])
        self.addCleanup(db.close)
        kinds={r[0] for r in db.execute('SELECT kind FROM features')}
        self.assertTrue({'road','building','green','water','place','land','coastline'}<=kinds,kinds)
        names=[r[0] for r in db.execute("SELECT name FROM features WHERE kind='place'")]
        self.assertIn('태안 시험지명',names)
        self.assertEqual(db.execute('PRAGMA quick_check').fetchone()[0],'ok')
        module.prepare(self.args)
        self.assertEqual(json.loads((self.root/'metadata.json').read_text())['database'],m['database'])
        self.args.force=True;module.prepare(self.args)
        self.assertNotEqual(json.loads((self.root/'metadata.json').read_text())['database'],m['database'])
        self.assertTrue((self.root/m['database']).is_file())

    def test_failed_import_keeps_published_dataset_and_cleans_staging(self):
        module.prepare(self.args);before=(self.root/'metadata.json').read_bytes()
        self.source.write_bytes(b'not an OSM PBF')
        with self.assertRaises((ValueError,RuntimeError)):
            module.prepare(self.args)
        self.assertEqual((self.root/'metadata.json').read_bytes(),before)
        self.assertEqual(len(list((self.root/'sets').iterdir())),1)

    def test_open_country_coastline_closes_at_extent_and_has_land_on_left(self):
        index=module.Index(self.root/'coast.sqlite');self.addCleanup(index.db.close)
        index.add(Point(100,100),'place','town','test',10)
        # Southbound west coast, then eastbound south coast, then northbound east coast.
        coast=LineString([(0,100),(0,0),(100,0),(100,100)])
        index.coast=[coast];index.add(coast,'coastline','coastline','',9)
        filled,connections=index.land()
        self.assertTrue(filled);self.assertEqual(connections,2)
        land=[module.shape(json.loads(row[0])) for row in index.db.execute("SELECT g3 FROM features WHERE kind='land'")]
        self.assertTrue(any(p.contains(Point(50,50)) for p in land))
        self.assertFalse(any(p.contains(Point(-100,50)) for p in land))

    def test_no_coastline_and_invalid_filename_are_handled(self):
        index=module.Index(self.root/'empty.sqlite');self.addCleanup(index.db.close)
        self.assertEqual(index.land(),(False,0))
        for name in ('../secret.osm.pbf','x\\secret.osm.pbf','test.tif'):
            self.args.file=name
            with self.assertRaises(ValueError):module.prepare(self.args)

if __name__=='__main__':unittest.main()
