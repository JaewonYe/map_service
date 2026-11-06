"""Synthetic integration tests; these do not validate real Taean data coverage."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('extractor', root / 'extract/extract.py')
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


class BoundarySelectionTest(unittest.TestCase):
    def test_missing_boundary_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'found 0'):
            extractor.select_boundary({'features': []})

    def test_duplicate_boundary_is_rejected(self):
        feature = {'properties': {'name': '태안군', 'boundary': 'administrative', 'admin_level': '6'},
                   'geometry': {'type': 'Polygon', 'coordinates': []}}
        with self.assertRaisesRegex(RuntimeError, 'found 2'):
            extractor.select_boundary({'features': [feature, feature]})

    @unittest.skipUnless(shutil.which('osmium'), 'requires osmium-tool (extract image)')
    def test_polygon_extraction_provenance_and_failed_update(self):
        with tempfile.TemporaryDirectory() as t:
            temp = Path(t)
            source, output = temp / 'korea.osm.pbf', temp / 'taean.osm.pbf'
            fixture = root / 'tests/extract/taean.osm'
            subprocess.run(['osmium', 'cat', str(fixture), '-o', str(source)], check=True)
            source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
            extractor.extract(source, output)
            objects = subprocess.check_output(['osmium', 'cat', str(output), '-f', 'opl'], text=True)
            self.assertIn('w200 ', objects)  # Road inside county
            self.assertIn('w201 ', objects)  # Building inside county
            self.assertNotIn('w300 ', objects)  # Road outside county
            manifest = json.loads((temp / 'taean.manifest.json').read_text())
            self.assertEqual(manifest['source_sha256'], source_hash)
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), source_hash)
            good = output.read_bytes()
            self.assertEqual(manifest['output_sha256'], hashlib.sha256(good).hexdigest())
            wrong = temp / 'wrong.osm'
            wrong.write_text(fixture.read_text().replace('태안군', '다른군'))
            other = temp / 'other.osm.pbf'
            subprocess.run(['osmium', 'cat', str(wrong), '-o', str(other)], check=True)
            with self.assertRaisesRegex(RuntimeError, 'found 0'):
                extractor.extract(other, output)
            self.assertEqual(output.read_bytes(), good)
