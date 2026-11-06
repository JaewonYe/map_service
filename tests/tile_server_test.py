import gzip
import http.client
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

spec = importlib.util.spec_from_file_location('tile_server', Path(__file__).resolve().parents[1] / 'tile-server/server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class TileServerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        server.DB = Path(self.temp.name) / 'test.mbtiles'
        self.tile = gzip.compress((Path(__file__).parent / 'fixtures/tile.pbf').read_bytes())
        with sqlite3.connect(server.DB) as db:
            db.execute('CREATE TABLE tiles (zoom_level, tile_column, tile_row, tile_data)')
            db.execute('CREATE TABLE metadata (name, value)')
            # XYZ 14/8529/5974 maps to TMS row 10409, not 5974.
            db.execute('INSERT INTO tiles VALUES (14,8529,10409,?)', (self.tile,))
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path):
        client = http.client.HTTPConnection('127.0.0.1', self.http.server_port)
        client.request('GET', path)
        response = client.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        client.close()
        return result

    def test_xyz_to_tms_and_gzip(self):
        code, headers, body = self.request('/tile/14/8529/5974.pbf')
        self.assertEqual(code, 200)
        self.assertEqual(headers['Content-Encoding'], 'gzip')
        self.assertEqual(body, self.tile)

    def test_empty_invalid_and_missing_paths(self):
        self.assertEqual(self.request('/tile/14/0/0.pbf')[0], 204)
        self.assertEqual(self.request('/tile/14/16384/0.pbf')[0], 400)
        self.assertEqual(self.request('/tile/99/0/0.pbf')[0], 400)
        self.assertEqual(self.request('/tile/not-a-tile')[0], 404)

    def test_missing_database_is_not_created(self):
        server.DB = Path(self.temp.name) / 'missing.mbtiles'
        with self.assertRaises(sqlite3.OperationalError):
            server.connect()
        self.assertFalse(server.DB.exists())
