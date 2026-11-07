"""Synthetic Esri-protocol fixtures; no real imagery is downloaded here."""
import http.client
import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'imagery'))
import download
from build import build
from verify import verify
import serve

class RGBTest(unittest.TestCase):
    def test_archive_pack_copy_serve_and_integrity(self):
        output=io.BytesIO();Image.new('RGB',(256,256),(70,110,60)).save(output,format='JPEG');jpeg=output.getvalue()
        service={'copyrightText':'Esri test fixture','tileInfo':{'spatialReference':{'wkid':3857},'rows':256,'cols':256,
                 'origin':{'x':-20037508.342789244,'y':20037508.342789244},'lods':[{'level':15}]}}
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)/'esri'
            with patch.object(download,'request',side_effect=lambda path,token:jpeg if path.startswith('/tile/') else json.dumps(service).encode()):
                download.download(folder,[126.299,36.699,126.300,36.700],15,15,10)
            acquisition=json.loads((folder/'source/acquisition.json').read_text())
            self.assertGreater(len(acquisition['tiles']),0)
            with patch.object(download,'request',side_effect=lambda path,token:json.dumps(service).encode() if not path else self.fail('cached RGB tile must not be downloaded again')):
                download.download(folder,[126.299,36.699,126.300,36.700],15,15,10)
            build(folder);verify(folder)
            with tempfile.TemporaryDirectory() as destination:
                moved=Path(destination)/'esri';shutil.copytree(folder,moved);verify(moved)
            serve.ROOT=Path(tmp)
            self.assertEqual([d['id'] for d in serve.metadata()['datasets']],['rgb'])
            self.assertTrue(serve.metadata()['datasets'][0]['ready'])
            httpd=serve.ThreadingHTTPServer(('127.0.0.1',0),serve.Handler)
            thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
            try:
                tile=acquisition['tiles'][0];client=http.client.HTTPConnection('127.0.0.1',httpd.server_port)
                client.request('GET',f"/tile/rgb/{tile['z']}/{tile['x']}/{tile['y']}.jpg")
                response=client.getresponse();self.assertEqual(response.status,200)
                self.assertEqual(response.getheader('Content-Type'),'image/jpeg');self.assertEqual(response.read(),jpeg);client.close()
            finally:httpd.shutdown();httpd.server_close();thread.join()
            before=(folder/'manifest.json').read_bytes()
            (folder/acquisition['tiles'][0]['file']).write_bytes(b'corrupt')
            with self.assertRaises(RuntimeError):verify(folder)
            with self.assertRaises(RuntimeError):build(folder)
            self.assertEqual((folder/'manifest.json').read_bytes(),before)

    def test_request_limit_prevents_network_calls(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(download,'request') as request:
            with self.assertRaisesRegex(RuntimeError,'exceed limit'):
                download.download(Path(tmp),download.BBOX,6,17,10)
            request.assert_not_called()

    def test_no_archive_no_ready_layer(self):
        with tempfile.TemporaryDirectory() as tmp:
            serve.ROOT=Path(tmp)
            self.assertEqual(serve.metadata()['datasets'],[{'id':'rgb','label':'Esri RGB','ready':False}])
