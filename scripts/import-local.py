"""Use local ZIPs with the pinned OSM Carto importer; preserve existing OSM data on resume."""
import pathlib
import shutil
import subprocess
import sys
import zipfile
from urllib.parse import urlparse

import yaml  # Supplied by overv/openstreetmap-tile-server:2.3.0


def prepare(style, backup, archives):
    config_path = style / 'external-data.yml'
    source_config = config_path if config_path.exists() else backup / 'external-data.yml'
    config = yaml.safe_load(source_config.read_text())
    # Validate every archive before changing style files or touching the database.
    for source in config['sources'].values():
        name = pathlib.PurePosixPath(urlparse(source['url']).path).name
        archive = archives / name
        if not archive.is_file():
            raise RuntimeError(f'Missing ZIP: {archive}')
        with zipfile.ZipFile(archive) as zip_file:
            missing = set(source['archive']['files']) - set(zip_file.namelist())
            if missing:
                raise RuntimeError(f'{name}: missing archive members: {sorted(missing)}')
            bad = zip_file.testzip()
            if bad:
                raise RuntimeError(f'{name}: invalid ZIP checksum: {bad}')
        source['url'] = f'http://external-data:8000/{name}'
    style.mkdir(parents=True, exist_ok=True)
    if not config_path.exists():
        shutil.copytree(backup, style, dirs_exist_ok=True)
    config_path.write_text(yaml.safe_dump(config))


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def main():
    mode = sys.argv[1] if len(sys.argv) == 2 else ''
    if mode not in ('import', 'resume-external'):
        raise RuntimeError('Expected import or resume-external')
    style = pathlib.Path('/data/style')
    prepare(style, pathlib.Path('/home/renderer/src/openstreetmap-carto-backup'), pathlib.Path('/external-data'))
    if mode == 'import':
        run('/bin/bash', '/run.sh', 'import')
        return
    if not pathlib.Path('/data/database/postgres/PG_VERSION').is_file():
        raise RuntimeError('No existing database. Run import for a fresh database first.')
    # Do not run createuser/createdb/osm2pgsql again in recovery mode.
    run('service', 'postgresql', 'start')
    try:
        tables = run('sudo', '-u', 'postgres', 'psql', '-d', 'gis', '-Atc',
                     "SELECT to_regclass('public.planet_osm_point') IS NOT NULL "
                     "AND to_regclass('public.planet_osm_line') IS NOT NULL "
                     "AND to_regclass('public.planet_osm_polygon') IS NOT NULL "
                     "AND to_regclass('public.planet_osm_roads') IS NOT NULL",
                     capture_output=True, text=True)
        if tables.stdout.strip() != 't':
            raise RuntimeError('Core OSM tables missing; external-only recovery is not applicable.')
        if not (style / 'mapnik.xml').exists():
            with (style / 'mapnik.xml').open('w') as output:
                run('carto', 'project.mml', cwd=style, stdout=output)
        run('chown', '-R', 'renderer:', str(style))
        run('sudo', '-E', '-u', 'renderer', 'python3', str(style / 'scripts/get-external-data.py'),
            '-c', str(style / 'external-data.yml'), '-D', str(style / 'data'))
        run('sudo', '-u', 'renderer', 'touch', '/data/database/planet-import-complete')
    finally:
        run('service', 'postgresql', 'stop')


if __name__ == '__main__':
    main()
