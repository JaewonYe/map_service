"""Extract Taean's administrative polygon and complete ways from a Korea PBF."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile


def run(*args):
    subprocess.run(args, check=True)


def select_boundary(collection):
    candidates = []
    for feature in collection.get('features', []):
        tags = feature.get('properties') or {}
        if (tags.get('name') == '태안군' or tags.get('name:ko') == '태안군') and tags.get('boundary') == 'administrative' and tags.get('admin_level') == '6':
            geometry = feature.get('geometry') or {}
            if geometry.get('type') in ('Polygon', 'MultiPolygon'):
                candidates.append(feature)
    if len(candidates) != 1:
        raise RuntimeError(f'Expected one Taean county admin_level=6 polygon; found {len(candidates)}. Check source boundary completeness; no bounding-box fallback is applied.')
    return {'type': 'FeatureCollection', 'features': candidates}


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def extract(source, output):
    if not source.is_file():
        raise RuntimeError(f'Missing source PBF: {source}')
    if source.resolve() == output.resolve():
        raise RuntimeError('Input and output must be different files.')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Work on the same filesystem, publish only after all commands succeed.
    with tempfile.TemporaryDirectory(prefix='.taean-', dir=output.parent) as temp:
        work = Path(temp)
        relations = work / 'boundary.osm.pbf'
        exported = work / 'boundaries.geojson'
        polygon = work / 'taean.geojson'
        next_pbf = work / 'taean.osm.pbf'
        run('osmium', 'tags-filter', str(source), 'r/name=태안군', 'r/name:ko=태안군', '-o', str(relations))
        run('osmium', 'export', str(relations), '--geometry-types=polygon', '-o', str(exported))
        boundary = select_boundary(json.loads(exported.read_text()))
        polygon.write_text(json.dumps(boundary, ensure_ascii=False))
        run('osmium', 'extract', '--polygon', str(polygon), '--strategy', 'complete_ways', str(source), '-o', str(next_pbf))
        info = subprocess.check_output(['osmium', 'fileinfo', '-e', '-j', str(next_pbf)], text=True)
        counts = json.loads(info)['data']['count']
        if counts.get('nodes', 0) == 0 or counts.get('ways', 0) == 0:
            raise RuntimeError('Extraction produced no usable nodes/ways; existing output is preserved.')
        manifest = {
            'region': '태안군', 'boundary': 'OSM administrative level 6',
            'source_file': source.name, 'source_sha256': sha256(source),
            'output_sha256': sha256(next_pbf), 'counts': counts,
            'strategy': 'complete_ways',
            'note': 'Ways crossing the county boundary are retained whole; relations may be incomplete at the edge.'
        }
        # Retain provenance and boundary for reproducibility.
        output.with_name(output.name.removesuffix('.osm.pbf') + '.boundary.geojson').write_text(json.dumps(boundary, ensure_ascii=False, indent=2))
        output.with_name(output.name.removesuffix('.osm.pbf') + '.manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
        next_pbf.replace(output)
        print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, default=Path('/data/south-korea.osm.pbf'))
    parser.add_argument('--output', type=Path, default=Path('/data/taean.osm.pbf'))
    args = parser.parse_args()
    extract(args.input, args.output)
