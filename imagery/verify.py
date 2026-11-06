"""Verify a copied imagery folder without network access."""
import argparse
import json
from pathlib import Path
from download import checksum


def verify(root):
    manifest=json.loads((root/'manifest.json').read_text())
    records=[]
    for scene in manifest['scenes']:
        records.extend((asset['file'],asset['sha256']) for asset in scene['bands'].values())
        if 'metadata_file' in scene: records.append((scene['metadata_file'],scene['metadata_sha256']))
    if manifest.get('boundary_record'):
        boundary=manifest['boundary_record'];records.append((boundary['file'],boundary['sha256']))
    records.append(('source/acquisition.json',manifest['acquisition_sha256']))
    records.extend((variant['mbtiles'],variant['sha256']) for variant in manifest['variants'].values())
    for relative,expected in records:
        path=(root/relative).resolve()
        if not path.is_relative_to(root.resolve()) or checksum(path)!=expected:
            raise RuntimeError(f'Checksum mismatch: {relative}')
    print(f'Verified {len(records)} files; original bands and all three views are reusable offline.')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,default=Path('/data/taean/sentinel2'))
    verify(parser.parse_args().root)
