"""Small read-only XYZ vector tile server backed by tilemaker's MBTiles (TMS)."""
import json
import os
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import sqlite3

DB = Path(os.environ.get('MBTILES_PATH', '/data/region.mbtiles')).resolve()


def connect():
    return sqlite3.connect(DB.as_uri() + '?mode=ro', uri=True)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        with closing(connect()) as db:
            if path == '/metadata.json':
                metadata = dict(db.execute('SELECT name, value FROM metadata'))
                body = json.dumps(metadata).encode()
                self.respond(200, body, 'application/json')
                return
            match = re.fullmatch(r'/tile/(\d+)/(\d+)/(\d+)\.pbf', path)
            if not match:
                self.respond(404)
                return
            z, x, y = map(int, match.groups())
            if not 0 <= z <= 14 or not 0 <= x < 2**z or not 0 <= y < 2**z:
                self.respond(400)
                return
            row = db.execute('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?',
                             (z, x, (2**z - 1) - y)).fetchone()
            if row is None:
                self.respond(204)
                return
            self.respond(200, row[0], 'application/vnd.mapbox-vector-tile')

    def respond(self, code, body=b'', content_type=None):
        self.send_response(code)
        if content_type:
            self.send_header('Content-Type', content_type)
        if body[:2] == b'\x1f\x8b':
            self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    # Fail clearly instead of accidentally creating an empty SQLite database.
    with closing(connect()) as db:
        if not db.execute('SELECT 1 FROM tiles LIMIT 1').fetchone():
            raise RuntimeError('No vector tiles. Run the import service first.')
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '80'))), Handler).serve_forever()
