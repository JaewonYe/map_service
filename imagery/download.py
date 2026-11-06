"""Download and retain calibrated public Sentinel-2 spectral COG bands; no tiled basemap scraping."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

CATALOG = 'https://earth-search.aws.element84.com/v1'
BBOX = [125.45, 36.35, 126.55, 37.08]  # Includes western offshore islands; rectangular fallback


def checksum(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def get_json(url):
    with urlopen(Request(url, headers={'User-Agent': 'map-service-imagery/1.0'}), timeout=60) as response:
        return json.load(response)


def choose_scenes(items, max_cloud):
    best = {}
    for item in items:
        properties = item['properties']
        if properties.get('eo:cloud_cover', 100) > max_cloud:
            continue
        grid = properties.get('grid:code')
        if not grid:
            grid = '-'.join(str(properties[k]) for k in ('mgrs:utm_zone', 'mgrs:latitude_band', 'mgrs:grid_square'))
        previous = best.get(grid)
        if previous is None or properties['eo:cloud_cover'] < previous['properties']['eo:cloud_cover']:
            best[grid] = item
    if not best or len(best) > 6:
        raise RuntimeError('No suitable scenes or more than 6 grids. Adjust date/cloud limits and inspect catalog.')
    return sorted(best.values(), key=lambda item: item['properties']['eo:cloud_cover'])


def download(root, date_range, max_cloud):
    source = root / 'source'
    source.mkdir(parents=True, exist_ok=True)
    bbox = BBOX
    boundary_path = Path('/region/taean.boundary.geojson')
    if boundary_path.is_file():
        boundary = json.loads(boundary_path.read_text())
        points = []
        def coordinates(value):
            if len(value) >= 2 and isinstance(value[0], (int, float)):
                points.append(value[:2])
            else:
                for child in value:
                    coordinates(child)
        for feature in boundary['features']:
            coordinates(feature['geometry']['coordinates'])
        if not points:
            raise RuntimeError('Empty Taean boundary')
        bbox = [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]
        (source/'region.boundary.geojson').write_text(json.dumps(boundary))
    params = {'collections': 'sentinel-2-l2a', 'bbox': ','.join(map(str, bbox)),
              'datetime': date_range, 'limit': 100}
    url = CATALOG + '/search?' + urlencode(params)
    items = []
    for _ in range(10):
        page = get_json(url)
        items.extend(page.get('features', []))
        links = [link for link in page.get('links', []) if link.get('rel') == 'next']
        if not links:
            break
        url = links[0]['href']
        if not url.startswith(CATALOG + '/') or links[0].get('method', 'GET') != 'GET':
            raise RuntimeError('Unsupported catalog pagination; narrow the date range.')
    else:
        raise RuntimeError('Too many catalog pages; narrow the date range.')
    selected = choose_scenes(items, max_cloud)
    records = []
    for item in selected:
        identity = item['id']
        if not identity.replace('_', '').replace('-', '').isalnum():
            raise RuntimeError('Unexpected scene identifier')
        metadata_file = source / f'{identity}.stac.json'
        bands = {}
        for band in ('red', 'green', 'blue', 'nir'):
            asset = item['assets'][band]
            calibration = asset.get('raster:bands', [{}])[0]
            if 'scale' not in calibration or 'offset' not in calibration:
                raise RuntimeError(f'{identity}/{band}: missing explicit reflectance scale/offset in STAC; refusing to guess NDVI calibration.')
            href = asset['href']
            parsed = urlparse(href)
            if parsed.scheme != 'https' or parsed.hostname != 'sentinel-cogs.s3.us-west-2.amazonaws.com' or parsed.query or parsed.username:
                raise RuntimeError('Unexpected imagery host or signed URL; inspect catalog before downloading.')
            target = source / f'{identity}-{band}.tif'
            receipt = target.with_suffix('.sha256')
            if not (target.is_file() and receipt.is_file() and checksum(target) == receipt.read_text().strip()):
                partial = target.with_suffix('.part')
                try:
                    print(f'Downloading {identity}/{band}', flush=True)
                    with urlopen(href, timeout=120) as response, partial.open('wb') as output:
                        while block := response.read(1024 * 1024):
                            output.write(block)
                    if partial.stat().st_size == 0:
                        raise RuntimeError('Empty image')
                    partial.replace(target)
                    receipt.write_text(checksum(target) + '\n')
                finally:
                    partial.unlink(missing_ok=True)
            bands[band] = {'file': target.relative_to(root).as_posix(), 'sha256': checksum(target), 'url': href,
                           'scale': calibration['scale'], 'offset': calibration['offset']}
        metadata_file.write_text(json.dumps(item, indent=2))
        records.append({'id': identity, 'bands': bands,
                        'metadata_file': metadata_file.relative_to(root).as_posix(), 'metadata_sha256': checksum(metadata_file),
                        'datetime': item['properties']['datetime'], 'cloud_cover': item['properties']['eo:cloud_cover']})
    acquisition = {'provider': 'Copernicus Sentinel-2 / Element 84 Earth Search',
                   'license': 'Copernicus Sentinel data terms',
                   'license_url': 'https://dataspace.copernicus.eu/terms-and-conditions',
                   'catalog': CATALOG, 'bbox': bbox, 'date_range': date_range,
                   'downloaded_at': datetime.now(timezone.utc).isoformat(), 'scenes': records}
    temporary = source / 'acquisition.next.json'
    temporary.write_text(json.dumps(acquisition, indent=2))
    temporary.replace(source / 'acquisition.json')
    print(f'Retained {len(records)} scene(s); run imagery-build next. Cloud cover is scene-wide, not a guarantee for Taean.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('/data/taean/sentinel2'))
    parser.add_argument('--dates', default='2025-10-01T00:00:00Z/2025-10-31T23:59:59Z')
    parser.add_argument('--max-cloud', type=float, default=15)
    args = parser.parse_args()
    download(args.root, args.dates, args.max_cloud)
