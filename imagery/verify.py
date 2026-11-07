import argparse
import json
from pathlib import Path
from download import checksum


def verify(root):
    manifest=json.loads((root/'manifest.json').read_text())
    acquisition=json.loads((root/'source/acquisition.json').read_text())
    records=[(row['file'],row['sha256']) for row in acquisition['tiles']]
    records.extend([('source/service.json',acquisition['service_metadata_sha256']),
                    ('source/acquisition.json',manifest['acquisition_sha256']),
                    (manifest['mbtiles'],manifest['mbtiles_sha256'])])
    for relative,expected in records:
        path=(root/relative).resolve()
        if not path.is_relative_to(root.resolve()) or checksum(path)!=expected: raise RuntimeError(f'Checksum mismatch: {relative}')
    print(f'Verified {len(records)} files. RGB archive is portable and reusable offline.')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path('/data/taean/esri'))
    verify(parser.parse_args().root)
