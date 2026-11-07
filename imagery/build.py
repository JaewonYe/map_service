"""Package the retained RGB archive for offline serving without additional download."""
import argparse
import io
import json
from pathlib import Path
import sqlite3
import tempfile
from PIL import Image
from download import checksum, atomic_json


def build(root):
    acquisition=json.loads((root/'source/acquisition.json').read_text())
    processed=root/'processed';processed.mkdir(parents=True,exist_ok=True)
    if not acquisition['tiles']: raise RuntimeError('No RGB tiles')
    if checksum(root/'source/service.json')!=acquisition['service_metadata_sha256']: raise RuntimeError('Service metadata checksum mismatch')
    with tempfile.TemporaryDirectory(dir=processed) as folder:
        result=Path(folder)/'rgb.mbtiles'
        with sqlite3.connect(result) as db:
            db.execute('CREATE TABLE tiles (zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB,PRIMARY KEY(zoom_level,tile_column,tile_row))')
            for record in acquisition['tiles']:
                source=(root/record['file']).resolve()
                if not source.is_relative_to(root.resolve()) or checksum(source)!=record['sha256']: raise RuntimeError('Source RGB checksum mismatch; existing output preserved')
                with Image.open(source) as image:
                    if image.size!=(256,256): raise RuntimeError('Unexpected tile dimensions')
                    output=io.BytesIO()
                    if image.format=='JPEG':
                        image.verify();output.write(source.read_bytes())
                    else:
                        image.convert('RGB').save(output,format='JPEG',quality=95)
                z,x,y=record['z'],record['x'],record['y']
                db.execute('INSERT INTO tiles VALUES (?,?,?,?)',(z,x,2**z-1-y,output.getvalue()))
        digest=checksum(result);name=f'esri-rgb-{digest[:16]}.mbtiles'
        result.replace(processed/name)
        manifest={key:value for key,value in acquisition.items() if key!='tiles'}
        manifest.update(ready=True,mbtiles=f'processed/{name}',mbtiles_sha256=digest,
                        acquisition_sha256=checksum(root/'source/acquisition.json'),tile_count=len(acquisition['tiles']))
        atomic_json(root/'manifest.json',manifest)
        print('Esri RGB ready. Original downloaded tiles remain in source/.')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path('/data/taean/esri'))
    build(parser.parse_args().root)
