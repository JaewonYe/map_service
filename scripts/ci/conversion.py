"""Run existing production conversion tests or summarize their small stdout reports."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import traceback
import unittest

SUITES = {'dem': ('elevation_prepare_test.py', 3), 'osm': ('osm_prepare_test.py', 7)}
MARKER = 'CONVERSION_RESULT '


def counts(result, expected):
    failures, errors, skipped = len(result.failures), len(result.errors), len(result.skipped)
    expected_failures, unexpected = len(result.expectedFailures), len(result.unexpectedSuccesses)
    passed = result.testsRun - failures - errors - skipped - expected_failures - unexpected
    return dict(tests=result.testsRun, executed=result.testsRun-skipped, passed=passed,
                failures=failures, errors=errors, skipped=skipped,
                expectedFailures=expected_failures, unexpectedSuccesses=unexpected,
                valid=(result.testsRun == expected and passed == expected and result.wasSuccessful()))


def preflight(kind, root):
    if Path(sys.executable).resolve() != Path('/usr/bin/python3').resolve():
        raise RuntimeError('Use the image /usr/bin/python3 with its system GDAL bindings')
    import numpy
    from osgeo import gdal
    versions = dict(python=sys.version.split()[0], executable=sys.executable,
                    gdal=gdal.VersionInfo('RELEASE_NAME'), numpy=numpy.__version__)
    required_drivers = ['GTiff', 'PNG'] + (['OSM'] if kind == 'osm' else [])
    if not all(gdal.GetDriverByName(name) for name in required_drivers):
        raise RuntimeError(f'Missing GDAL drivers: {required_drivers}')
    versions['drivers'] = required_drivers
    packages = ['python3', 'python3-gdal', 'libgdal32', 'python3-numpy']
    if kind == 'osm':
        import shapely
        versions['shapely'] = shapely.__version__
        packages.append('python3-shapely')
    versions['packages'] = subprocess.check_output(
        ['/usr/bin/dpkg-query', '-W', '-f=${binary:Package}=${Version}\n', *packages], text=True).splitlines()
    folder = 'elevation' if kind == 'dem' else 'osm'
    # DEM tests resolve this repository-relative script. Check that it is the image's production copy too.
    hashes = {}
    for name in ['prepare.py'] + (['schema.sql'] if kind == 'osm' else []):
        source, baked = root/'scripts'/folder/name, Path('/tools')/name
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if hashlib.sha256(baked.read_bytes()).hexdigest() != digest:
            raise RuntimeError(f'Image is stale: rebuild {folder} ({name} differs)')
        hashes[name] = digest
    if kind == 'osm':
        os.environ['OSM_PREPARE_SCRIPT'] = '/tools/prepare.py'
    return dict(versions=versions, productionSha256=hashes)


def run(kind):
    root = Path(__file__).resolve().parents[2]
    pattern, expected = SUITES[kind]
    report = dict(kind=kind, expected=expected, valid=False)
    try:
        report.update(preflight(kind, root))
        print('CONVERSION_ENVIRONMENT ' + json.dumps(report, sort_keys=True), flush=True)
        # unittest reports import errors as errors; they are never skipped or accepted as success.
        suite = unittest.TestLoader().discover(str(root/'tests'), pattern=pattern)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        report.update(counts(result, expected))
    except Exception as error:
        traceback.print_exc()
        report.update(setupError=f'{type(error).__name__}: {error}', tests=0, executed=0, passed=0,
                      failures=0, errors=1, skipped=0)
    print(MARKER + json.dumps(report, sort_keys=True), flush=True)
    return 0 if report['valid'] else 1


def read_report(path):
    try:
        lines = [line[len(MARKER):] for line in path.read_text().splitlines() if line.startswith(MARKER)]
        return json.loads(lines[-1]) if lines else None
    except (OSError, ValueError):
        return None


def summary():
    rows = ['## Conversion regression', '', f"Commit: {os.getenv('GITHUB_SHA', 'local')}", '',
            '| Suite | Expected | Run | Executed | Passed | Failures | Errors | Skipped | Evidence |',
            '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    valid = True
    versions = []
    for kind, (_, expected) in SUITES.items():
        report = read_report(Path('.cache/ci/conversion')/f'{kind}.log')
        if not report or report.get('kind') != kind:
            valid = False
            rows.append(f'| {kind} | {expected} | not run | unknown | unknown | unknown | unknown | unknown | missing report |')
            continue
        ok = report.get('valid') is True and report.get('passed') == expected and report.get('tests') == expected
        valid = valid and ok
        values = [str(report.get(key, 'unknown')) for key in ['tests', 'executed', 'passed', 'failures', 'errors', 'skipped']]
        rows.append(f"| {kind} | {expected} | " + ' | '.join(values) + f" | {'passed' if ok else 'FAILED'} |")
        if 'versions' in report:
            versions.extend(['', f"{kind} dependencies: `{json.dumps(report['versions'], sort_keys=True)}`", ''])
    rows.extend(versions)
    rows.extend(['', 'Synthetic GeoTIFF/PBF only; existing production converters. No real user map data, OS desktop, authentication/operations or approved platform contract verification.',
                 '', f"Evidence gate: {'passed' if valid else 'FAILED (missing/empty/skipped/error execution)'}", ''])
    text = '\n'.join(rows)
    print(text)
    if os.getenv('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write(text)
    return 0 if valid else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['summary', *SUITES])
    args = parser.parse_args()
    sys.exit(summary() if args.mode == 'summary' else run(args.mode))
