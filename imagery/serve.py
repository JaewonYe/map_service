"""Serve only prepared local imagery; never fetch upstream while serving."""
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import sqlite3

ROOT = Path(os.environ.get('IMAGERY_ROOT', '/data/taean'))


def dataset(identity):
    try:
        if identity not in PRESETS:
            return None
        folder = ROOT/'sentinel2'
        manifest = json.loads((folder/'manifest.json').read_text())
        path = (folder/manifest['variants'][identity]['mbtiles']).resolve()
        if not path.is_relative_to(folder.resolve()) or not path.is_file() or not manifest.get('ready'):
            return None
        return manifest, path
    except (OSError, ValueError, KeyError):
        return None


PRESETS = {
    'rgb': {'label': '자연색 RGB', 'nominal_resolution_m': 10},
    'infrared': {'label': '근적외선 강조', 'nominal_resolution_m': 10},
    'ndvi': {'label': '식생지수 NDVI', 'nominal_resolution_m': 10}
}


def metadata():
    result = []
    for identity, preset in PRESETS.items():
        current = dataset(identity)
        entry = {'id': identity, **preset, 'ready': False}
        if current:
            manifest, _ = current
            keys = ('ready', 'bbox', 'minzoom', 'maxzoom', 'dates', 'attribution', 'nominal_resolution_m', 'note')
            entry.update({key: manifest[key] for key in keys if key in manifest})
        result.append(entry)
    return {'datasets': result}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/metadata.json':
            self.respond(200, json.dumps(metadata()).encode(), 'application/json')
            return
        match = re.fullmatch(r'/tile/(rgb|infrared|ndvi)/(\d+)/(\d+)/(\d+)\.png', path)
        if not match:
            self.respond(404)
            return
        identity, *coordinates = match.groups()
        z, x, y = map(int, coordinates)
        if not 0 <= z <= 14 or not 0 <= x < 2**z or not 0 <= y < 2**z:
            self.respond(400)
            return
        current = dataset(identity)
        if current is None:
            self.respond(503)
            return
        try:
            with closing(sqlite3.connect(current[1].as_uri()+'?mode=ro', uri=True)) as db:
                row = db.execute('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?',
                                 (z, x, 2**z-1-y)).fetchone()
            self.respond(200, row[0], 'image/png') if row else self.respond(204)
        except sqlite3.Error:
            self.respond(503)

    def respond(self, code, body=b'', content_type=None):
        self.send_response(code)
        if content_type:
            self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '80'))), Handler).serve_forever()
