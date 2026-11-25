"""Synthetic localhost transport tests; NOT real provider permission/download evidence."""
import copy, hashlib, http.server, io, json, os, pathlib, shutil, signal, socketserver, sqlite3, stat, struct, subprocess, sys, tempfile, threading, time, unittest, urllib.request, uuid, zipfile
from unittest.mock import patch
ROOT=pathlib.Path(os.getenv('DOWNLOAD_CODE_ROOT',pathlib.Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(ROOT/'scripts/downloads'));sys.path.insert(0,str(ROOT/'tests'))
from common import *
from worker import Worker
from providers import validate_tpk, secret, capabilities
import export_result
import package as portable
from osm_fixture import write_fixture
from osgeo import gdal,osr

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        size=int(self.headers.get('Content-Length','0'));self.server.last_form=urllib.parse.parse_qs(self.rfile.read(size).decode());self.do_GET()
    def do_HEAD(self):self.do_GET()
    def do_GET(self):
        name=self.path.split('?')[0]
        self.server.seen_headers.append((name,self.headers.get('Referer')))
        self.server.seen_queries.append((name,urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)))
        if self.server.required_export_token and (name==self.server.export_directory or name.endswith('.tpk')) and urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('token')!=[self.server.required_export_token]:data=b'{"error":{"code":499}}'
        elif self.server.required_referer and (name.startswith('/arcgis/') or name.endswith('.tpk')) and self.headers.get('Referer')!=self.server.required_referer:data=b'{"error":{"code":498}}'
        elif self.server.export_enabled and name.endswith('/MapServer'):data=json.dumps({'exportTilesAllowed':True,'maxExportTilesCount':self.server.export_max_tiles,'tileInfo':{'rows':256,'cols':256,'spatialReference':{'wkid':3857},'lods':self.server.export_lods}}).encode()
        elif self.server.export_enabled and name.endswith('/exportTiles'):data=b'{"jobId":"fixture-job","jobStatus":"esriJobSubmitted"}'
        elif self.server.export_enabled and name.endswith('/jobs/fixture-job'):data=json.dumps({'jobStatus':'esriJobSucceeded','results':self.server.export_results}).encode()
        elif self.server.export_enabled and name.endswith('/results/out'):data=json.dumps({'value':self.server.export_value or {'url':'https://tiledbasemaps.arcgis.com/export/map.'+self.server.export_extension}}).encode()
        elif name==self.server.export_directory:data=self.server.export_listing
        elif name.endswith('.tpk'):data=self.server.tpk
        elif name.endswith('.md5'):data=(self.server.checksum+'  region.osm.pbf\n').encode()
        elif name.endswith('.osm.pbf'):data=self.server.pbf
        elif name.endswith('.tif') or name=='/API/globaldem':
            self.server.last_dem_query=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query);data=self.server.dem
        else:data=b'{"error":{"code":499}}'
        self.send_response(200);self.send_header('Content-Length',str(len(data)+(20 if self.server.truncate and name.endswith('.osm.pbf') else 0)));self.send_header('ETag','"'+hashlib.md5(data).hexdigest()+'"');self.end_headers();
        if self.command!='HEAD':
            gate=getattr(self.server,'gate',None)
            if gate and name.endswith('.osm.pbf'):
                cursor=0
                while not gate.exists() and cursor<len(data)-1:self.wfile.write(data[cursor:cursor+1]);self.wfile.flush();cursor+=1;time.sleep(.5)
                self.wfile.write(data[cursor:])
            else:self.wfile.write(data)
    def log_message(self,*args):pass
class FixtureOpener:
    def __init__(self,server):self.server=server
    def open(self,request,timeout=5):
        safe_url(request.full_url);u=urllib.parse.urlsplit(request.full_url)
        return urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{self.server.server_address[1]}'+u.path+('?' + u.query if u.query else ''),data=request.data,method=request.get_method(),headers=dict(request.header_items())),timeout=min(timeout,5))
class Transport(Network):
    """Only the socket target changes; production URL checks, headers and errors run."""
    def __init__(self,server):super().__init__();self.opener=FixtureOpener(server)
class NoNetwork:
    def __getattr__(self,key):raise AssertionError('Offline import tried network: '+key)
class Context:
    def check(self):pass

class DownloadsWorker(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.directory=pathlib.Path(cls.tmp.name);p=cls.directory/'tiny.osm.pbf';write_fixture(p);cls.pbf=p.read_bytes()
        dem=cls.directory/'dem.tif';ds=gdal.GetDriverByName('GTiff').Create(str(dem),144,144,1,gdal.GDT_Float32);ds.SetGeoTransform((126.22,.04/144,0,36.62,0,-.04/144));s=osr.SpatialReference();s.ImportFromEPSG(4326);ds.SetProjection(s.ExportToWkt());band=ds.GetRasterBand(1);band.Fill(42.5);band.SetNoDataValue(-32767);ds=None
        jpg=(ROOT/'tests/fixtures/satellite.jpg').read_bytes();header=bytearray(64+16384*8);struct.pack_into('<II',header,0,3,16384);offset=len(header)+4;x=math.floor((126.240136+180)/360*2**16);y=math.floor((1-math.asinh(math.tan(math.radians(36.597889)))/math.pi)/2*2**16);struct.pack_into('<Q',header,64+((y%128)*128+x%128)*8,(len(jpg)<<40)|offset);bundle=bytes(header)+struct.pack('<I',len(jpg))+jpg
        xml='<CacheInfo><TileCacheInfo><SpatialReference><WKID>3857</WKID></SpatialReference><TileCols>256</TileCols><TileRows>256</TileRows><TileOrigin><X>-20037508.342789244</X><Y>20037508.342789244</Y></TileOrigin><LODInfos><LODInfo><LevelID>0</LevelID><Resolution>'+str(156543.03392804097/2**16)+'</Resolution></LODInfo></LODInfos></TileCacheInfo><StorageFormat>esriMapCacheStorageModeCompactV2</StorageFormat><PacketSize>128</PacketSize></CacheInfo>'
        tpk=io.BytesIO()
        with zipfile.ZipFile(tpk,'w') as z:z.writestr('Layers/conf.xml',xml);z.writestr('Layers/conf.cdi','<EnvelopeN><WKID>4326</WKID><XMin>126.22</XMin><XMax>126.26</XMax><YMin>36.58</YMin><YMax>36.62</YMax></EnvelopeN>');z.writestr(f'Layers/_alllayers/L00/R{y//128*128:04x}C{x//128*128:04x}.bundle',bundle)
        cls.tpk_bytes=tpk.getvalue()
        cls.server=socketserver.TCPServer(('127.0.0.1',0),Handler);cls.server.pbf=cls.pbf;cls.server.dem=dem.read_bytes();cls.server.tpk=tpk.getvalue();cls.server.export_enabled=False;cls.server.required_referer=None;cls.server.seen_headers=[];cls.server.export_extension='tpk';cls.server.checksum=hashlib.md5(cls.pbf).hexdigest();cls.server.truncate=False
        cls.server.export_value=None;cls.server.export_directory='/arcgis/rest/directories/arcgisoutput/World_Imagery_MapServer/_agsfixture';cls.server.export_listing=b'';cls.server.required_export_token=None;cls.server.seen_queries=[]
        cls.server.export_results={'out':{'paramUrl':'results/out'}}
        cls.server.export_max_tiles=1000;cls.server.export_lods=[{'level':0,'resolution':156543.03392804097/2**16}]
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.tmp.cleanup()
    def setUp(self):
        secrets_patch=patch.dict(os.environ,{'ARCGIS_TOKEN':'','OPENTOPOGRAPHY_API_KEY':'','MAP_DOWNLOAD_ARCGIS_TOKEN_FILE':'','MAP_DOWNLOAD_OPENTOPOGRAPHY_KEY_FILE':'','ARCGIS_REFERER':''});secrets_patch.start();self.addCleanup(secrets_patch.stop)
        self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name);self.addCleanup(self.temp.cleanup);self.worker=Worker(self.root/'downloads',ROOT,Transport(self.server));self.server.checksum=hashlib.md5(self.pbf).hexdigest();self.server.truncate=False;self.server.export_enabled=False;self.server.required_referer=None;self.server.seen_headers=[];self.server.export_extension='tpk'
        self.server.export_value=None;self.server.export_directory='/arcgis/rest/directories/arcgisoutput/World_Imagery_MapServer/_agsfixture';self.server.export_listing=b'';self.server.required_export_token=None;self.server.seen_queries=[]
        self.server.export_results={'out':{'paramUrl':'results/out'}}
        self.server.export_max_tiles=1000;self.server.export_lods=[{'level':0,'resolution':156543.03392804097/2**16}]
        self.server.tpk=self.tpk_bytes
    def request(self,kinds=('osm','elevation'),**extra):
        return {'version':1,'type':'download','id':str(uuid.uuid4()),'createdAt':now(),'name':'CC0 다운로드 검사','bounds':{'west':126.23,'south':36.59,'east':126.25,'north':36.61},'kinds':list(kinds),'region':'south-korea','demProvider':'aws','levels':{'satellite':{'min':0,'max':13},'elevation':{'min':12,'max':13}},'accepted':dict.fromkeys(kinds,True),'registryRevision':0,**extra}
    def status(self,request):return read_json(self.worker.root/'jobs'/(request['id']+'.state.json'))
    def run_job(self,request):self.worker.process(request);return self.status(request)
    def v1_fixture(self,empty_records=True):
        """CC0 pixels: 60-byte V1 header, optional nonzero zero-length pointers."""
        x=math.floor((126.240136+180)/360*2**16);y=math.floor((1-math.asinh(math.tan(math.radians(36.597889)))/math.pi)/2*2**16)
        header=bytearray(60+(16384*4 if empty_records else 0));struct.pack_into('<II',header,0,3,16384)
        index=bytearray(16+16384*5+16)
        if empty_records:
            for i in range(16384):index[16+i*5:21+i*5]=(60+i*4).to_bytes(5,'little')
        record=(x%128)*128+y%128;index[16+record*5:21+record*5]=len(header).to_bytes(5,'little')
        jpg=(ROOT/'tests/fixtures/satellite.jpg').read_bytes();bundle=bytes(header)+struct.pack('<I',len(jpg))+jpg
        output=io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(self.tpk_bytes)) as source,zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as target:
            for entry in source.infolist():
                data=source.read(entry)
                if entry.filename.endswith('conf.xml'):data=data.replace(b'esriMapCacheStorageModeCompactV2',b'esriMapCacheStorageModeCompact')
                if entry.filename.endswith('.bundle'):
                    data=bundle;target.writestr(entry.filename[:-7]+'.bundlx',index)
                target.writestr(entry.filename,data)
        return output.getvalue(),record
    def test_01_real_fixture_download_prepare_activate_and_isolated_offline_import(self):
        r=self.request();s=self.run_job(r);self.assertEqual(s['state'],'completed',s);self.assertTrue(s['registered']);self.assertEqual(set(self.worker.registry()['layers']),{'osm','elevation'})
        source=self.worker.root/'packages'/s['packageId'];manifest=portable.validate(source,Context());self.assertEqual(manifest['items']['elevation']['units'],'m');self.assertEqual(manifest['items']['elevation']['verticalDatum'],'EGM2008 orthometric height')
        metadata=read_json(source/'osm/metadata.json')
        with sqlite3.connect(source/'osm'/metadata['database']) as db:self.assertIn(('node:24',),db.execute('SELECT source_key FROM features').fetchall())
        other=Worker(self.root/'isolated',ROOT,NoNetwork(),offline=True);upload=str(uuid.uuid4());shutil.copyfile(self.worker.root/'exports'/(r['id']+'.zip'),other.root/'incoming'/(upload+'.zip'))
        q={'version':1,'id':str(uuid.uuid4()),'type':'import','createdAt':now(),'uploadId':upload,'confirmUsage':True,'registryRevision':0};other.process(q);second=read_json(other.root/'jobs'/(q['id']+'.state.json'));self.assertEqual(second['state'],'completed',second)
        restored=other.root/'packages'/q['id'];again=portable.validate(restored,Context());self.assertEqual(manifest['files'],again['files']);self.assertTrue((restored/'osm'/metadata['database']).is_file())
    def test_02_partial_blocked_satellite_keeps_other_download_and_old_files(self):
        old=self.root/'legacy';old.mkdir();files={name:os.urandom(120) for name in ('source.pbf','base.sqlite','satellite.tpk','dem.tif','facility-boundary.json','edits.json')}
        for n,b in files.items():(old/n).write_bytes(b)
        r=self.request(('satellite','osm'));s=self.run_job(r);self.assertEqual(s['state'],'partial',s);self.assertEqual(s['items']['satellite']['state'],'blocked');self.assertEqual(self.worker.registry()['layers'],{'osm':r['id']})
        for n,b in files.items():self.assertEqual((old/n).read_bytes(),b)
    def test_03_checksum_error_never_activates_and_removes_partial(self):
        self.server.checksum='0'*32;r=self.request(('osm',));s=self.run_job(r);self.assertEqual(s['state'],'failed',s);self.assertEqual(self.worker.registry()['revision'],0);self.assertFalse(list(self.worker.root.rglob('*.part')))
    def test_04_download_cancellation_keeps_registry_and_cleans_partial(self):
        r=self.request(('osm',));original=self.worker.progress
        def cancel(n,total):original(n,total);atomic(self.worker.root/'jobs'/(r['id']+'.cancel.json'),{})
        self.worker.progress=cancel;s=self.run_job(r);self.assertEqual(s['state'],'cancelled',s);self.assertEqual(self.worker.registry()['revision'],0);self.assertFalse(list(self.worker.root.rglob('*.part')))
    def test_05_truncated_transfer_never_becomes_registered(self):
        self.server.truncate=True;r=self.request(('osm',));s=self.run_job(r);self.assertEqual(s['state'],'failed',s);self.assertEqual(self.worker.registry()['layers'],{});self.assertFalse(list(self.worker.root.rglob('*.part')))
    def test_06_activation_conflict_retains_package_for_explicit_register_and_reset(self):
        r=self.request(('osm',));r['registryRevision']=9;s=self.run_job(r);self.assertEqual(s['state'],'partial',s);self.assertFalse(s.get('registered',False));self.assertTrue(s['packageId']);self.assertEqual(self.worker.registry()['revision'],0)
        q={'version':1,'id':str(uuid.uuid4()),'type':'activate','createdAt':now(),'packageId':s['packageId'],'registryRevision':0};self.assertEqual(self.run_job(q)['state'],'completed');self.assertEqual(self.worker.registry()['layers']['osm'],r['id'])
        q={'version':1,'id':str(uuid.uuid4()),'type':'reset','createdAt':now(),'registryRevision':1};self.assertEqual(self.run_job(q)['state'],'completed');self.assertEqual(self.worker.registry()['layers'],{});self.assertTrue((self.worker.root/'packages'/r['id']).exists())
    def test_07_portable_checksum_and_path_escape_symlink_duplicate_rejected(self):
        for name,mode in [('../escape',stat.S_IFREG),('/escape',stat.S_IFREG),('osm/link',stat.S_IFLNK)]:
            with self.subTest(name=name):
                z=self.root/'bad.zip'
                with zipfile.ZipFile(z,'w') as out:i=zipfile.ZipInfo(name);i.external_attr=mode<<16;out.writestr(i,b'invalid')
                with self.assertRaises(WorkError):portable.unpack(z,self.root/'unpacked',Context())
                self.assertFalse((self.root/'escape').exists())
        r=self.request(('osm',));s=self.run_job(r);source=self.worker.root/'packages'/r['id'];file=next((source/'osm').glob('*.pbf'));file.write_bytes(b'corrupt')
        with self.assertRaises(WorkError):portable.validate(source,Context())
    def test_08_size_disk_and_provider_host_limits(self):
        n=Transport(self.server);p=self.root/'limited.pbf';url='https://download.geofabrik.de/a.osm.pbf'
        with self.assertRaises(WorkError):n.download(url,p,lambda:None,lambda *_:None,maximum=2)
        self.assertFalse(p.exists());self.assertFalse(p.with_suffix('.pbf.part').exists())
        with patch('common.shutil.disk_usage',return_value=shutil._ntuple_diskusage(1,1,0)):
            with self.assertRaises(WorkError):n.download(url,p,lambda:None,lambda *_:None)
        for url in ('http://download.geofabrik.de/a','https://127.0.0.1/a','https://download.geofabrik.de.evil.test/a','https://user:secret@download.geofabrik.de/a'):
            with self.assertRaises(WorkError):safe_url(url)
        net=Network(self.root/'backoff.json')
        limited=urllib.error.HTTPError('https://download.geofabrik.de/a',429,'limit',{'Retry-After':'120'},None)
        with patch.object(net.opener,'open',side_effect=limited) as opened:
            with self.assertRaises(Blocked):net.open('https://download.geofabrik.de/a')
            with self.assertRaises(Blocked):net.open('https://download.geofabrik.de/a')
            self.assertEqual(opened.call_count,1)
        self.assertGreater(read_json(self.root/'backoff.json')['download.geofabrik.de'],time.time()+100)
    def test_09_recovery_marks_interrupted_without_discarding_records(self):
        r=self.request(('osm',));atomic(self.worker.root/'jobs'/(r['id']+'.request.json'),r);atomic(self.worker.root/'jobs'/(r['id']+'.state.json'),{'version':1,'id':r['id'],'state':'running','items':{}});staging=self.worker.root/'staging'/r['id'];staging.mkdir();(staging/'partial').write_bytes(b'partial')
        export=self.worker.root/'exports'/(r['id']+'.zip.part');export.write_bytes(b'incomplete zip')
        Worker(self.worker.root,ROOT,NoNetwork(),offline=True).recover();self.assertFalse(export.exists());s=self.status(r);self.assertEqual(s['state'],'interrupted');self.assertFalse(staging.exists());self.assertEqual(read_json(self.worker.root/'jobs'/(r['id']+'.request.json')),r)
    def test_10_process_restart_lock_and_offline_queue(self):
        first=subprocess.Popen(['/usr/bin/python3',str(ROOT/'scripts/downloads/worker.py'),'--directory',str(self.worker.root),'--offline'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        try:
            for _ in range(100):
                if (self.worker.root/'worker.json').exists():break
                time.sleep(.03)
            second=subprocess.run(['/usr/bin/python3',str(ROOT/'scripts/downloads/worker.py'),'--directory',str(self.worker.root),'--offline','--once'],capture_output=True,timeout=10);self.assertNotEqual(second.returncode,0);self.assertIn('worker',second.stderr.decode())
        finally:first.terminate();first.communicate(timeout=5)
        q={'version':1,'id':str(uuid.uuid4()),'type':'reset','createdAt':now(),'registryRevision':0};atomic(self.worker.root/'jobs'/(q['id']+'.request.json'),q)
        result=subprocess.run(['/usr/bin/python3',str(ROOT/'scripts/downloads/worker.py'),'--directory',str(self.worker.root),'--offline','--once'],capture_output=True,timeout=10);self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(self.status(q)['state'],'completed')
    def test_11_invalid_requests_and_secret_manifest_rejected(self):
        for patch_value in ({'accepted':{}},{'bounds':{'west':0,'east':180,'south':0,'north':1}},{'kinds':['unknown']},{'region':'../../bad'},{'levels':{'satellite':{'min':0,'max':30},'elevation':{'min':1,'max':2}}}):
            with self.assertRaises(WorkError):validate_request(self.request(**patch_value))
        for v in ({'token':'secret'},{'API_Key':'secret'},{'apiKey':'secret'},{'sourceURL':'https://example.test/a?token=secret'}):
            with self.assertRaises(WorkError):portable.no_secrets(v)
    def test_12_native_cancel_terminates_only_its_child(self):
        self.worker.request=self.request(('osm',));self.worker.started=time.monotonic();self.worker.state={'id':self.worker.request['id'],'items':{}}
        cancel=self.worker.root/'jobs'/(self.worker.request['id']+'.cancel.json');timer=threading.Timer(.25,lambda:atomic(cancel,{}));timer.start()
        start=time.monotonic()
        try:
            with self.assertRaises(Cancelled):self.worker.command(['/usr/bin/python3','-c','import time;time.sleep(20)'])
            self.assertLess(time.monotonic()-start,5)
        finally:timer.cancel();self.worker.request=None
    def test_13_mock_official_export_job_downloads_validates_tpk_and_excludes_token(self):
        self.server.export_enabled=True;token=self.root/'private-token';token.write_text('fixture-private-token-not-real')
        r=self.request(('satellite',),levels={'satellite':{'min':16,'max':16},'elevation':{'min':8,'max':13}})
        with patch.dict(os.environ,{'MAP_DOWNLOAD_ARCGIS_TOKEN_FILE':str(token)}):s=self.run_job(r)
        self.assertEqual(s['state'],'completed',s);self.assertEqual(validate_tpk(self.worker.root/'packages'/r['id']/'satellite/map.tpk')['zoomLevels'],[16])
        self.assertNotIn('fixture-private-token',(self.worker.root/'packages'/r['id']/'manifest.json').read_text());self.assertNotIn('private-token',(self.worker.root/'jobs'/(r['id']+'.state.json')).read_text());self.assertEqual(json.loads(self.server.last_form['exportExtent'][0])['spatialReference']['wkid'],3857)
    def test_14_tpkx_result_and_corrupt_bundle_cannot_register(self):
        self.server.export_enabled=True;self.server.export_extension='tpkx';token=self.root/'private-token';token.write_text('fixture-private-token-not-real');r=self.request(('satellite',),levels={'satellite':{'min':16,'max':16},'elevation':{'min':8,'max':13}})
        with patch.dict(os.environ,{'MAP_DOWNLOAD_ARCGIS_TOKEN_FILE':str(token)}):s=self.run_job(r)
        self.assertEqual(s['state'],'failed',s);self.assertEqual(self.worker.registry()['layers'],{});self.assertIn('TPKX',s['items']['satellite']['reason'])
        path=self.root/'bad.tpk'
        with zipfile.ZipFile(io.BytesIO(self.server.tpk)) as src,zipfile.ZipFile(path,'w') as out:
            for i in src.infolist():
                data=bytearray(src.read(i))
                if i.filename.endswith('.bundle'):struct.pack_into('<Q',data,64,(123<<40)|9999999)
                out.writestr(i,data)
        with self.assertRaises(WorkError):validate_tpk(path)

        with zipfile.ZipFile(io.BytesIO(self.server.tpk)) as src,zipfile.ZipFile(path,'w') as out:
            for i in src.infolist():
                data=bytearray(src.read(i))
                if i.filename.endswith('.bundle'):struct.pack_into('<II',data,0,0,0)
                out.writestr(i,data)
        with self.assertRaises(WorkError):validate_tpk(path)

    def test_15_opentopography_cop30_query_key_redaction_and_raw_dem_reuse(self):
        key=self.root/'ot-key';key.write_text('fixture-opentopo-private-key');r=self.request(('elevation',),demProvider='opentopography')
        with patch.dict(os.environ,{'MAP_DOWNLOAD_OPENTOPOGRAPHY_KEY_FILE':str(key)}):s=self.run_job(r)
        self.assertEqual(s['state'],'completed',s);self.assertEqual(self.server.last_dem_query['demtype'],['COP30']);self.assertEqual(self.server.last_dem_query['outputFormat'],['GTiff'])
        m=(self.worker.root/'packages'/r['id']/'manifest.json').read_text();self.assertNotIn('fixture-opentopo-private-key',m);self.assertNotIn('API_Key',m);self.assertTrue(list((self.worker.root/'originals/dem').glob('*.tif')))
        other=Worker(self.worker.root,ROOT,NoNetwork());q=self.request(('elevation',),demProvider='opentopography',registryRevision=1);other.process(q);s=read_json(other.root/'jobs'/(q['id']+'.state.json'));self.assertEqual(s['state'],'completed',s);self.assertEqual(s['items']['elevation']['result']['download']['networkBytes'],0)
    def test_16_satellite_raw_cache_reuses_verified_tpk_without_account_or_network(self):
        self.server.export_enabled=True;token=self.root/'token';token.write_text('fixture-token');r=self.request(('satellite',),levels={'satellite':{'min':16,'max':16},'elevation':{'min':8,'max':13}})
        with patch.dict(os.environ,{'MAP_DOWNLOAD_ARCGIS_TOKEN_FILE':str(token)}):s=self.run_job(r)
        self.assertEqual(s['state'],'completed',s);self.assertTrue(list((self.worker.root/'originals/imagery').glob('*.tpk')))
        other=Worker(self.worker.root,ROOT,NoNetwork());q={**r,'id':str(uuid.uuid4()),'registryRevision':1};other.process(q);s=read_json(other.root/'jobs'/(q['id']+'.state.json'));self.assertEqual(s['state'],'completed',s);self.assertEqual(s['items']['satellite']['result']['download']['networkBytes'],0)
        original=next((other.root/'originals/imagery').glob('*.tpk'));original.write_bytes(b'corrupt');q={**q,'id':str(uuid.uuid4()),'registryRevision':2};other.process(q);s=read_json(other.root/'jobs'/(q['id']+'.state.json'));self.assertEqual(s['state'],'failed');self.assertEqual(original.read_bytes(),b'corrupt')

    def test_17_credentials_environment_and_explicit_file_priority_and_safe_errors(self):
        for variable,file_variable,label in [('ARCGIS_TOKEN','MAP_DOWNLOAD_ARCGIS_TOKEN_FILE','ArcGIS'),('OPENTOPOGRAPHY_API_KEY','MAP_DOWNLOAD_OPENTOPOGRAPHY_KEY_FILE','OpenTopography')]:
            with self.subTest(variable=variable):
                file=self.root/(variable+'.private');file.write_text('fixture-file-value\n');missing=str(self.root/'missing-private-file')
                with patch.dict(os.environ,{variable:'',file_variable:''}):self.assertIsNone(secret(file_variable,variable,label))
                with patch.dict(os.environ,{variable:'fixture-env-value',file_variable:missing}):self.assertEqual(secret(file_variable,variable,label),'fixture-env-value')
                with patch.dict(os.environ,{variable:'',file_variable:str(file)}):self.assertEqual(secret(file_variable,variable,label),'fixture-file-value')
                for direct,path in [('',missing),('bad secret',str(file)),('x'*16385,str(file))]:
                    with patch.dict(os.environ,{variable:direct,file_variable:path}),self.assertRaises(Blocked) as error:secret(file_variable,variable,label)
                    self.assertNotIn('bad secret',str(error.exception));self.assertNotIn(missing,str(error.exception))
                with patch.dict(os.environ,{variable:'',file_variable:str(file)}),patch.object(pathlib.Path,'read_text',side_effect=PermissionError('private-path-and-value')),self.assertRaises(Blocked) as error:secret(file_variable,variable,label)
                self.assertNotIn('private-path-and-value',str(error.exception))
    def test_18_missing_arcgis_token_is_reported_before_any_network_request(self):
        other=Worker(self.worker.root,ROOT,NoNetwork());r=self.request(('satellite',));other.process(r);state=self.status(r)
        self.assertEqual(state['state'],'failed');self.assertEqual(state['items']['satellite']['state'],'blocked');self.assertIn('ARCGIS_TOKEN',state['items']['satellite']['reason']);self.assertNotIn('비밀 파일을 읽을 수 없습니다',state['items']['satellite']['reason']);self.assertEqual(other.registry()['layers'],{})

    def test_19_referer_bound_export_scope_redirect_and_invalid_configuration(self):
        referer='https://fixture-app.example';self.server.required_referer=referer;self.server.export_enabled=True
        request=self.request(('satellite',),levels={'satellite':{'min':16,'max':16},'elevation':{'min':8,'max':13}})
        with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-bound-token'}):
            state=self.run_job(request);self.assertEqual(state['items']['satellite']['state'],'blocked');self.assertIn('code 498',state['items']['satellite']['reason']);self.assertNotIn('export 권한',state['items']['satellite']['reason'])
            with patch.dict(os.environ,{'ARCGIS_REFERER':referer}):
                state=self.run_job({**request,'id':str(uuid.uuid4())});self.assertEqual(state['state'],'completed',state)
                self.assertIn(('/export/map.tpk',referer),self.server.seen_headers)
                for host in ('portal.opentopography.org','download.geofabrik.de','copernicus-dem-30m.s3.amazonaws.com'):
                    net=Network()
                    with patch.object(net.opener,'open',return_value=io.BytesIO()) as opened:net.open('https://'+host+'/fixture').close();self.assertIsNone(opened.call_args.args[0].get_header('Referer'))
                initial=urllib.request.Request('https://tiledbasemaps.arcgis.com/a',headers=provider_headers('https://tiledbasemaps.arcgis.com/a'))
                target=Redirect().redirect_request(initial,None,302,'',{},'https://download.geofabrik.de/a');self.assertIsNone(target.get_header('Referer'))
            for invalid in ('https://user:fixture@host','https://host/?token=fixture','https://host/\r\nInjected:yes','https://host/\x7f','file:///private'):
                with patch.dict(os.environ,{'ARCGIS_REFERER':invalid}),self.assertRaises(Blocked):provider_headers('https://tiledbasemaps.arcgis.com/a')

    def test_20_json_export_directory_downloads_real_tpk_with_auth_and_offline_reuse(self):
        self.server.export_enabled=True;self.server.export_value='https://tiledbasemaps.arcgis.com'+self.server.export_directory
        self.server.export_results={'other':{'paramUrl':'results/ignored'},'out_service_url':{'paramUrl':'results/out'}}
        self.server.export_listing=json.dumps({'files':[{'name':'layer.tpk','url':self.server.export_value+'/layer.tpk'}],'folders':[]}).encode()
        self.server.required_export_token='fixture-directory-token';self.server.required_referer='https://fixture-app.example'
        r=self.request(('satellite',),levels={'satellite':{'min':16,'max':16},'elevation':{'min':8,'max':13}})
        with patch.dict(os.environ,{'ARCGIS_TOKEN':self.server.required_export_token,'ARCGIS_REFERER':self.server.required_referer}):state=self.run_job(r)
        self.assertEqual(state['state'],'completed',state);self.assertEqual(state['items']['satellite']['result']['download']['bytes'],len(self.server.tpk))
        for path in (self.server.export_directory,self.server.export_directory+'/layer.tpk'):
            self.assertIn((path,self.server.required_referer),self.server.seen_headers)
            self.assertIn((path,{'f':['json'],'token':[self.server.required_export_token]}) if path==self.server.export_directory else (path,{'token':[self.server.required_export_token]}),self.server.seen_queries)
        portable.validate(self.worker.root/'packages'/r['id'],Context())
        for file in self.worker.root.rglob('*.json'):self.assertNotIn(self.server.required_export_token,file.read_text())
        other=Worker(self.worker.root,ROOT,NoNetwork());q={**r,'id':str(uuid.uuid4()),'registryRevision':1};other.process(q);again=self.status(q)
        self.assertEqual(again['state'],'completed',again);self.assertEqual(again['items']['satellite']['result']['download']['networkBytes'],0)

    def test_21_html_export_directory_relative_links_and_existing_signed_token(self):
        self.server.export_enabled=True;self.server.export_value='https://tiledbasemaps.arcgis.com'+self.server.export_directory+'/'
        self.server.export_listing=b'<!DOCTYPE html><html><body><a href="../">Parent</a><a href="layer.tpk?token=fixture-signed&amp;x=1">TPK</a><a href="layer.tpk?token=fixture-signed&amp;x=1">Download</a></body></html>'
        r=self.request(('satellite',),levels={'satellite':{'min':16,'max':16},'elevation':{'min':8,'max':13}})
        # The directory may have a trailing slash; both variants are served here.
        self.server.export_directory+='/'
        with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-current-token'}):state=self.run_job(r)
        self.assertEqual(state['state'],'completed',state)
        self.assertIn((self.server.export_directory+'layer.tpk',{'token':['fixture-signed'],'x':['1']}),self.server.seen_queries)
        for file in self.worker.root.rglob('*.json'):
            self.assertNotIn('fixture-signed',file.read_text());self.assertNotIn('fixture-current-token',file.read_text())

    def test_22_export_directory_rejects_outside_host_path_and_ambiguous_files(self):
        directory='https://tiledbasemaps.arcgis.com'+self.server.export_directory
        self.server.export_value=directory
        invalid=[['https://download.geofabrik.de/layer.tpk'],['https://evil.example/layer.tpk'],['../layer.tpk'],['sub/../layer.tpk'],['%2e%2e/layer.tpk'],['%252e%252e/layer.tpk'],['/other/layer.tpk'],['sub/layer.tpk'],['layer.tpk#fragment'],['a.tpk','b.tpk'],['layer.tpk?token=first','layer.tpk?token=second'],['https://tiledbasemaps.arcgis.com:444/a.tpk'],['https://user:secret@tiledbasemaps.arcgis.com/a.tpk']]
        for files in invalid:
            with self.subTest(files=files):
                self.server.export_listing=json.dumps({'files':files}).encode();before=len(self.server.seen_queries)
                with self.assertRaises(WorkError):export_result.resolve(Transport(self.server),directory,'fixture-token')
                self.assertEqual(len(self.server.seen_queries),before+1)
        for url in ('https://download.geofabrik.de/a.tpk','https://evil.example/a.tpk','https://tiledbasemaps.arcgis.com/export/other','https://tiledbasemaps.arcgis.com/arcgis/rest/directories/arcgisoutput/','https://tiledbasemaps.arcgis.com/a/../b.tpk'):
            with self.subTest(url=url),self.assertRaises(WorkError):export_result.resolve(NoNetwork(),url,'fixture-token')

    def test_23_export_directory_missing_tpk_tpkx_malformed_and_auth_failures(self):
        directory='https://tiledbasemaps.arcgis.com'+self.server.export_directory
        cases=[({'files':[]},WorkError,'TPK 파일이 없습니다'),({'files':['layer.tpkx']},WorkError,'TPKX'),({'files':['readme.txt']},WorkError,'TPK 파일이 없습니다'),({'files':[{}]},WorkError,'항목'),({'other':[]},WorkError,'형식'),({'error':{'code':498,'message':'fixture-private-message'}},Blocked,'인증'),({'files':['a.tpk']*257},WorkError,'256')]
        for listing,error,message in cases:
            with self.subTest(listing=str(listing)[:60]):
                self.server.export_listing=json.dumps(listing).encode()
                with self.assertRaises(error) as raised:export_result.resolve(Transport(self.server),directory,'fixture-token')
                self.assertIn(message,str(raised.exception));self.assertNotIn('fixture-private',str(raised.exception))
        for raw in (b'{malformed',b'not a listing',b'\xff',b'<html><body>'+b'<a href="a.tpk">x</a>'*257+b'</body></html>'):
            self.server.export_listing=raw
            with self.assertRaises(WorkError):export_result.resolve(Transport(self.server),directory,'fixture-token')

    def test_24_export_listing_response_bound_and_cancellation_before_download(self):
        directory='https://tiledbasemaps.arcgis.com'+self.server.export_directory
        self.server.export_listing=b' '*((1024*1024)+1)
        with self.assertRaisesRegex(WorkError,'1MiB'):export_result.resolve(Transport(self.server),directory,'fixture-token')
        def cancel():raise Cancelled('fixture-cancelled')
        with self.assertRaises(Cancelled):export_result.resolve(NoNetwork(),directory,'fixture-token',cancel)
        self.server.export_enabled=True;self.server.export_value=directory;self.server.export_listing=b'{"files":["layer.tpkx"]}'
        r=self.request(('satellite',),levels={'satellite':{'min':16,'max':16},'elevation':{'min':8,'max':13}})
        with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-token'}):state=self.run_job(r)
        self.assertEqual(state['state'],'failed');self.assertIn('TPKX',state['items']['satellite']['reason']);self.assertEqual(self.worker.registry()['layers'],{})
        self.assertTrue(any(path.endswith('/jobs/fixture-job/cancel') for path,_ in self.server.seen_queries));self.assertFalse(list(self.worker.root.rglob('*.tpk')))

    def test_25_v1_header60_and_nonzero_empty_records_export_register_and_offline_reuse(self):
        self.server.export_enabled=True;self.server.export_value='https://tiledbasemaps.arcgis.com'+self.server.export_directory
        self.server.export_listing=b'{"files":[{"name":"layer.tpk"}]}'
        for empty_records in (False,True):
            with self.subTest(empty_records=empty_records):
                self.worker=Worker(self.root/str(empty_records),ROOT,Transport(self.server));self.server.tpk,_=self.v1_fixture(empty_records)
                r=self.request(('satellite',),levels={'satellite':{'min':16,'max':16},'elevation':{'min':8,'max':13}})
                with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-v1-token'}):state=self.run_job(r)
                self.assertEqual(state['state'],'completed',state);self.assertTrue(state['registered'])
                metadata=state['items']['satellite']['result'];self.assertEqual(metadata['format'],'TPK CompactV1');self.assertEqual(metadata['nonEmptyTileRecords'],1);self.assertEqual(metadata['zoomLevels'],[16]);self.assertEqual(metadata['download']['bytes'],len(self.server.tpk))
                portable.validate(self.worker.root/'packages'/r['id'],Context())
                other=Worker(self.worker.root,ROOT,NoNetwork());q={**r,'id':str(uuid.uuid4()),'registryRevision':1};other.process(q);again=self.status(q)
                self.assertEqual(again['state'],'completed',again);self.assertEqual(again['items']['satellite']['result']['download']['networkBytes'],0)

    def test_26_v1_header_index_record_bounds_and_empty_cache_remain_rejected(self):
        data,record=self.v1_fixture(False)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:members={i.filename:archive.read(i) for i in archive.infolist()}
        bundle=next(n for n in members if n.endswith('.bundle'));index=bundle[:-7]+'.bundlx'
        for mode in ('header','index','low-offset','end-offset','large-size','end-size','empty'):
            with self.subTest(mode=mode):
                changed={k:bytearray(v) for k,v in members.items()}
                if mode=='header':changed[bundle]=changed[bundle][:59]
                elif mode=='index':changed[index]=changed[index][:-1]
                elif mode in ('low-offset','end-offset'):changed[index][16+record*5:21+record*5]=(59 if mode=='low-offset' else len(changed[bundle])-3).to_bytes(5,'little')
                elif mode in ('large-size','end-size'):struct.pack_into('<I',changed[bundle],60,20*1024**2+1 if mode=='large-size' else len(changed[bundle]))
                else:struct.pack_into('<I',changed[bundle],60,0)
                path=self.root/(mode+'.tpk')
                with zipfile.ZipFile(path,'w') as target:
                    for name,content in changed.items():target.writestr(name,content)
                with self.assertRaises(WorkError):validate_tpk(path)

    def test_27_registration_change_preserves_v1_package_zip_and_existing_active_map(self):
        original=self.request(('elevation',));self.assertEqual(self.run_job(original)['state'],'completed');before=self.worker.registry()
        self.server.export_enabled=True;self.server.tpk,_=self.v1_fixture()
        r=self.request(('satellite',),levels={'satellite':{'min':16,'max':16},'elevation':{'min':8,'max':13}})
        with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-v1-token'}):state=self.run_job(r)
        self.assertEqual(state['state'],'partial',state);self.assertFalse(state.get('registered',False));self.assertEqual(state['items']['satellite']['state'],'completed');self.assertEqual(self.worker.registry(),before)
        source=self.worker.root/'packages'/r['id'];archive=self.worker.root/'exports'/(r['id']+'.zip');saved_hash=digest(archive);portable.validate(source,Context())
        offline=Worker(self.worker.root,ROOT,NoNetwork());q={'version':1,'type':'activate','id':str(uuid.uuid4()),'createdAt':now(),'packageId':r['id'],'registryRevision':before['revision']};offline.process(q)
        self.assertEqual(self.status(q)['state'],'completed');self.assertEqual(self.worker.registry()['layers'],{'elevation':original['id'],'satellite':r['id']});self.assertEqual(digest(archive),saved_hash)

    def test_28_empty_v1_bundle_is_not_a_downloaded_lod(self):
        data,_=self.v1_fixture();target=io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(data)) as source,zipfile.ZipFile(target,'w') as archive:
            for entry in source.infolist():
                content=source.read(entry)
                if entry.filename.endswith('conf.xml'):content=content.replace(b'</LODInfos>',('<LODInfo><LevelID>1</LevelID><Resolution>'+str(156543.03392804097/2**15)+'</Resolution></LODInfo></LODInfos>').encode())
                archive.writestr(entry.filename,content)
            stem='Layers/_alllayers/L01/R0000C0000';index=bytearray(16+16384*5+16)
            for i in range(16384):index[16+i*5:21+i*5]=(60+i*4).to_bytes(5,'little')
            archive.writestr(stem+'.bundlx',index);archive.writestr(stem+'.bundle',bytes(60+16384*4))
        self.server.export_enabled=True;self.server.tpk=target.getvalue();path=self.root/'partial-lods.tpk';path.write_bytes(self.server.tpk)
        self.assertEqual(validate_tpk(path)['zoomLevels'],[16])
        r=self.request(('satellite',),levels={'satellite':{'min':15,'max':16},'elevation':{'min':8,'max':13}})
        with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-v1-token'}),patch('providers.capabilities',return_value={'lods':{'15':1,'16':0},'maxTiles':1000,'attribution':'CC0 fixture'}):state=self.run_job(r)
        self.assertEqual(state['state'],'failed');self.assertIn('실제 LOD가 누락',state['items']['satellite']['reason']);self.assertEqual(self.worker.registry()['layers'],{})

    def test_29_export_metadata_lods20_to23_are_not_downloaded_levels(self):
        def metadata(data,resolution=None,actual=False):
            result=io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(data)) as source,zipfile.ZipFile(result,'w') as archive:
                for entry in source.infolist():
                    content=source.read(entry)
                    if entry.filename.endswith('conf.xml'):
                        extra=''.join('<LODInfo><LevelID>'+str(z)+'</LevelID><Resolution>'+str(resolution if resolution is not None else 156543.03392804097/2**z)+'</Resolution></LODInfo>' for z in range(20,24))
                        content=content.replace(b'</LODInfos>',extra.encode()+b'</LODInfos>')
                    archive.writestr(entry.filename,content)
                    if actual and entry.filename.endswith(('.bundle','.bundlx')):archive.writestr(entry.filename.replace('/L00/','/L20/'),content)
            return result.getvalue()
        self.server.export_enabled=True
        for version,data in [('v1',self.v1_fixture()[0]),('v2',self.tpk_bytes)]:
            with self.subTest(version=version):
                self.worker=Worker(self.root/version,ROOT,Transport(self.server));self.server.tpk=metadata(data)
                request=self.request(('satellite',),levels={'satellite':{'min':16,'max':16},'elevation':{'min':8,'max':13}})
                with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-export-lods'}):state=self.run_job(request)
                self.assertEqual(state['state'],'completed',state);self.assertEqual(state['items']['satellite']['result']['zoomLevels'],[16])
                self.assertEqual(state['items']['satellite']['result']['nonEmptyTileRecords'],1)
                for resolution,actual in [(None,True),(0,False),(float('nan'),False),(123,False)]:
                    path=self.root/'bad-lods.tpk';path.write_bytes(metadata(data,resolution,actual))
                    with self.assertRaises(WorkError) as error:validate_tpk(path)
                    if actual:self.assertIn('XYZ=20',str(error.exception))

    def test_30_national_satellite_export_uses_actual_service_limit_and_keeps_dem_limits(self):
        country={'west':124,'south':33,'east':132,'north':39.5};lods=[{'level':z,'resolution':156543.03392804097/2**z} for z in range(14)]
        request=self.request(('satellite',),bounds=country,levels={'satellite':{'min':0,'max':13},'elevation':{'min':8,'max':13}})
        self.assertEqual(tile_count(country,0,13),45048);validate_request(copy.deepcopy(request))
        excessive=copy.deepcopy(request);excessive['levels']['satellite']['max']=14
        with self.assertRaisesRegex(WorkError,'150,000'):validate_request(excessive)
        dem=copy.deepcopy(request);dem['kinds'].append('elevation');dem['accepted']['elevation']=True
        with self.assertRaisesRegex(WorkError,'10,000'):validate_request(dem)
        # Sparse CC0 fixtures exercise the national request; these are not
        # 45,048 actual tiles and are never evidence of real Korean imagery.
        lod_xml=''.join('<LODInfo><LevelID>'+str(l['level'])+'</LevelID><Resolution>'+str(l['resolution'])+'</Resolution></LODInfo>' for l in lods)
        xml='<CacheInfo><TileCacheInfo><SpatialReference><WKID>3857</WKID></SpatialReference><TileCols>256</TileCols><TileRows>256</TileRows><TileOrigin><X>-20037508.342789244</X><Y>20037508.342789244</Y></TileOrigin><LODInfos>'+lod_xml+'</LODInfos></TileCacheInfo><StorageFormat>esriMapCacheStorageModeCompact</StorageFormat><PacketSize>128</PacketSize></CacheInfo>'
        jpg=(ROOT/'tests/fixtures/satellite.jpg').read_bytes();header=bytearray(60);struct.pack_into('<II',header,0,3,16384);output=io.BytesIO()
        with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('Layers/conf.xml',xml);archive.writestr('Layers/conf.cdi','<EnvelopeN><WKID>4326</WKID><XMin>124</XMin><XMax>132</XMax><YMin>33</YMin><YMax>39.5</YMax></EnvelopeN>')
            for z in range(14):
                x=math.floor((126.240136+180)/360*2**z);y=math.floor((1-math.asinh(math.tan(math.radians(36.597889)))/math.pi)/2*2**z)
                index=bytearray(16+16384*5+16);i=(x%128)*128+y%128;index[16+i*5:21+i*5]=(60).to_bytes(5,'little')
                stem=f'Layers/_alllayers/L{z:02d}/R{y//128*128:04x}C{x//128*128:04x}';archive.writestr(stem+'.bundlx',index);archive.writestr(stem+'.bundle',bytes(header)+struct.pack('<I',len(jpg))+jpg)
        self.server.export_enabled=True;self.server.export_lods=lods;self.server.export_max_tiles=150000;self.server.tpk=output.getvalue()
        with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-national-token'}):state=self.run_job(request)
        self.assertEqual(state['state'],'completed',state);self.assertTrue(state['registered']);self.assertEqual(state['items']['satellite']['result']['zoomLevels'],list(range(14)));self.assertEqual(state['items']['satellite']['result']['nonEmptyTileRecords'],14)
        self.assertEqual(self.server.last_form['levels'],[','.join(map(str,range(14)))]);self.assertEqual(json.loads(self.server.last_form['exportExtent'][0])['spatialReference']['wkid'],3857)
        before=self.worker.registry();self.server.export_max_tiles=500000;self.assertEqual(capabilities(Transport(self.server),'fixture-national-token')['maxTiles'],150000)
        self.server.export_max_tiles=20000;self.server.seen_queries=[]
        lower={**request,'id':str(uuid.uuid4()),'registryRevision':before['revision'],'refresh':True}
        with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-national-token'}):blocked=self.run_job(lower)
        self.assertEqual(blocked['state'],'failed');self.assertIn('20,000',blocked['items']['satellite']['reason']);self.assertIn('45,048',blocked['items']['satellite']['reason']);self.assertFalse(any(p.endswith('/exportTiles') for p,_ in self.server.seen_queries));self.assertEqual(self.worker.registry(),before)

    def test_31_satellite_activation_accumulates_legacy_selection_and_preserves_cas_limits_and_files(self):
        self.server.export_enabled=True
        levels={'satellite':{'min':16,'max':16},'elevation':{'min':12,'max':13}}
        with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-multi'}):
            first=self.request(('satellite','elevation'),levels=levels);a=self.run_job(first);self.assertEqual(a['state'],'completed',a)
            # Upgrade a legacy active.json without guessing which historical packages were selected.
            legacy=self.worker.registry();legacy.pop('satellitePackages');atomic(self.worker.root/'active.json',legacy)
            second=self.request(('satellite',),levels=levels,registryRevision=legacy['revision'],refresh=True);b=self.run_job(second);self.assertEqual(b['state'],'completed',b)
            stale=self.request(('satellite',),levels=levels,registryRevision=0,refresh=True);c=self.run_job(stale);self.assertEqual(c['state'],'partial',c)
        self.assertEqual(self.worker.registry()['satellitePackages'],[first['id'],second['id']])
        self.assertEqual(self.worker.registry()['layers'],{'elevation':first['id'],'satellite':second['id']})
        saved={str(p):digest(p) for p in self.worker.root.rglob('*') if p.is_file() and ('packages' in p.parts or 'exports' in p.parts)}
        self.worker=Worker(self.worker.root,ROOT,NoNetwork(),offline=True)
        def activate(id,revision=None):
            return self.run_job({'version':1,'id':str(uuid.uuid4()),'type':'activate','createdAt':now(),'packageId':id,'registryRevision':self.worker.registry()['revision'] if revision is None else revision})
        # Re-registering an old package adds/moves it once; it never drops overview or detail.
        self.assertEqual(activate(first['id'])['state'],'completed');self.assertEqual(self.worker.registry()['satellitePackages'],[second['id'],first['id']])
        self.assertEqual(activate(first['id'])['state'],'completed');self.assertEqual(self.worker.registry()['satellitePackages'],[second['id'],first['id']])
        self.assertEqual(activate(stale['id'])['state'],'completed');self.assertEqual(self.worker.registry()['satellitePackages'],[second['id'],first['id'],stale['id']])
        before=self.worker.registry();self.assertEqual(activate(second['id'],0)['state'],'partial');self.assertEqual(self.worker.registry(),before)
        # Capacity failures preserve the whole previous selection and prepared package/ZIP.
        full={**before,'satellitePackages':[str(uuid.uuid4()) for _ in range(31)]+[stale['id']]};atomic(self.worker.root/'active.json',full)
        failed=activate(second['id']);self.assertEqual(failed['state'],'partial');self.assertIn('최대32개',failed['error']);self.assertEqual(self.worker.registry(),full)
        for invalid in [None,{},[stale['id'],stale['id']],[],['../escape'],[str(uuid.uuid4())]]:
            atomic(self.worker.root/'active.json',{**before,'satellitePackages':invalid});raw=(self.worker.root/'active.json').read_bytes()
            with self.assertRaises(WorkError):self.worker.registry()
            self.assertEqual((self.worker.root/'active.json').read_bytes(),raw)
        atomic(self.worker.root/'active.json',before)
        reset={'version':1,'id':str(uuid.uuid4()),'type':'reset','createdAt':now(),'registryRevision':before['revision']};self.assertEqual(self.run_job(reset)['state'],'completed');self.assertEqual(self.worker.registry()['satellitePackages'],[]);self.assertEqual(self.worker.registry()['layers'],{})
        for path,checksum in saved.items():self.assertEqual(digest(Path(path)),checksum)

    def test_32_isolated_multiple_zip_import_and_restart_keep_all_selected_satellites(self):
        self.server.export_enabled=True;levels={'satellite':{'min':16,'max':16},'elevation':{'min':12,'max':13}}
        requests=[]
        with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-offline-multi'}):
            for revision in range(2):
                request=self.request(('satellite',),levels=levels,registryRevision=revision);self.assertEqual(self.run_job(request)['state'],'completed');requests.append(request)
        isolated=Worker(self.root/'offline',ROOT,NoNetwork(),offline=True);imported=[]
        for request in requests:
            upload=str(uuid.uuid4());shutil.copyfile(self.worker.root/'exports'/(request['id']+'.zip'),isolated.root/'incoming'/(upload+'.zip'))
            q={'version':1,'id':str(uuid.uuid4()),'type':'import','createdAt':now(),'uploadId':upload,'confirmUsage':True,'registryRevision':isolated.registry()['revision']};isolated.process(q)
            state=read_json(isolated.root/'jobs'/(q['id']+'.state.json'));self.assertEqual(state['state'],'completed',state);imported.append(q['id'])
            self.assertEqual(portable.validate(isolated.root/'packages'/q['id'],Context())['files'],portable.validate(self.worker.root/'packages'/request['id'],Context())['files'])
        self.assertEqual(isolated.registry()['satellitePackages'],imported)
        # A committed older package still counts as registered after a crash, even when no longer primary.
        state_path=isolated.root/'jobs'/(imported[0]+'.state.json');state=read_json(state_path);state.update(state='running',registered=False);atomic(state_path,state)
        restarted=Worker(isolated.root,ROOT,NoNetwork(),offline=True);restarted.recover();self.assertEqual(restarted.registry()['satellitePackages'],imported)
        self.assertTrue(read_json(state_path)['registered']);self.assertEqual(read_json(state_path)['state'],'completed')

    def maintenance_request(self,operation,**extra):
        from maintenance import PHRASES
        return {'version':1,'type':'maintenance','id':str(uuid.uuid4()),'operation':operation,'confirmation':PHRASES[operation],'createdAt':now(),'registryRevision':self.worker.registry()['revision'],'ready':True,**extra}
    def run_maintenance(self,q):
        from maintenance import marker
        atomic(marker(self.worker.root),q);self.worker.offline=True;self.worker.net=NoNetwork();self.worker.run(once=True)
        return read_json(self.worker.root/'maintenance'/(q['id']+'.state.json'))
    def saved_job(self,r):
        state=self.run_job(r);atomic(self.worker.root/'jobs'/(r['id']+'.request.json'),r);return state
    def test_33_delete_active_package_and_its_activation_records_then_restore_without_network(self):
        self.server.export_enabled=True;levels={'satellite':{'min':16,'max':16},'elevation':{'min':12,'max':13}}
        with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-maintenance'}):
            first=self.request(('satellite','elevation'),levels=levels);self.assertEqual(self.saved_job(first)['state'],'completed')
            second=self.request(('satellite',),levels=levels,registryRevision=1);self.assertEqual(self.saved_job(second)['state'],'completed')
        alias={'version':1,'type':'activate','id':str(uuid.uuid4()),'createdAt':now(),'packageId':first['id'],'registryRevision':2};self.assertEqual(self.saved_job(alias)['state'],'completed')
        before=self.worker.registry();source=self.worker.root/'packages'/first['id'];manifest=portable.validate(source,Context());raw={str(p):digest(p) for p in (self.worker.root/'originals').rglob('*') if p.is_file()}
        q=self.maintenance_request('delete',targetId=first['id']);state=self.run_maintenance(q);self.assertEqual(state['state'],'completed',state)
        self.assertEqual(self.worker.registry()['layers'],{'satellite':second['id']});self.assertEqual(self.worker.registry()['satellitePackages'],[second['id']]);self.assertFalse(source.exists())
        self.assertFalse((self.worker.root/'jobs'/(alias['id']+'.request.json')).exists());self.assertTrue((self.worker.root/'packages'/second['id']).exists())
        for p,h in raw.items():self.assertEqual(digest(Path(p)),h)
        restore=self.maintenance_request('restore',backupId=q['id']);result=self.run_maintenance(restore);self.assertEqual(result['state'],'completed',result)
        self.assertEqual(self.worker.registry()['layers'],before['layers']);self.assertEqual(self.worker.registry()['satellitePackages'],before['satellitePackages']);self.assertEqual(portable.validate(source,Context())['files'],manifest['files'])
        self.assertTrue((self.worker.root/'jobs'/(alias['id']+'.request.json')).exists())
    def test_34_full_clear_and_restore_include_manual_maps_and_cancel_queued_downloads(self):
        request=self.request();self.assertEqual(self.saved_job(request)['state'],'completed')
        manual={k:self.root/('manual-'+k) for k in ('tpk','osm','street','elevation')};self.worker.maintenance_dirs=manual
        for d in manual.values():d.mkdir();(d/'map.bin').write_bytes(b'manual-preserve');(d/'README.md').write_text('keep scaffold')
        (manual['elevation']/'source').mkdir();(manual['elevation']/'source/.gitkeep').write_bytes(b'');(manual['elevation']/'source/dem.tif').write_bytes(b'synthetic-source')
        protected=self.root/'facilities';protected.mkdir();(protected/'boundaries.json').write_bytes(b'facility-boundary');edits=self.root/'osm-edits.json';edits.write_bytes(b'user-osm-edits')
        gold={str(p):digest(p) for p in self.worker.root.rglob('*') if p.is_file() and ('packages' in p.parts or 'exports' in p.parts or 'originals' in p.parts)}
        pending=self.request(registryRevision=1);atomic(self.worker.root/'jobs'/(pending['id']+'.request.json'),pending)
        before=self.worker.registry();q=self.maintenance_request('clear',includeLegacy=True);state=self.run_maintenance(q);self.assertEqual(state['state'],'completed',state)
        self.assertEqual(self.worker.registry()['layers'],{});self.assertFalse(list((self.worker.root/'jobs').glob('*.request.json')))
        for d in manual.values():self.assertFalse((d/'map.bin').exists());self.assertEqual((d/'README.md').read_text(),'keep scaffold')
        self.assertEqual((protected/'boundaries.json').read_bytes(),b'facility-boundary');self.assertEqual(edits.read_bytes(),b'user-osm-edits');self.assertTrue((manual['elevation']/'source/.gitkeep').exists());self.assertFalse((manual['elevation']/'source/dem.tif').exists())
        restore=self.maintenance_request('restore',backupId=q['id']);state=self.run_maintenance(restore);self.assertEqual(state['state'],'completed',state)
        self.assertEqual(self.worker.registry()['layers'],before['layers'])
        for p,h in gold.items():self.assertEqual(digest(Path(p)),h)
        for d in manual.values():self.assertEqual((d/'map.bin').read_bytes(),b'manual-preserve')
        self.assertEqual(self.status(pending)['state'],'cancelled');self.worker.run(once=True);self.assertEqual(self.status(pending)['state'],'cancelled')
    def test_35_clear_interrupts_active_download_before_registration(self):
        q=self.maintenance_request('clear');request=self.request(('osm',));atomic(self.worker.root/'jobs'/(request['id']+'.request.json'),request);progress=self.worker.progress
        def interrupt(n,total):
            progress(n,total);atomic(self.worker.root/'maintenance.pending.json',q);self.worker.last_maintenance_check=0;self.worker.check()
        self.worker.progress=interrupt;state=self.run_job(request);self.assertEqual(state['state'],'cancelled',state);self.assertEqual(self.worker.registry()['layers'],{})
        self.assertEqual(self.run_maintenance(q)['state'],'completed');self.assertFalse(list((self.worker.root/'jobs').glob('*.request.json')))
    def test_36_restart_rolls_forward_detached_registry_and_rename_before_journal_write(self):
        from maintenance import Maintenance,marker
        for crash in ('detach','rename'):
            with self.subTest(crash=crash):
                self.worker=Worker(self.root/crash,ROOT,NoNetwork(),offline=True);p=self.worker.root/'packages'/str(uuid.uuid4());p.mkdir();(p/'sentinel').write_bytes(b'never-lose')
                q=self.maintenance_request('clear');atomic(marker(self.worker.root),q);m=Maintenance(self.worker);journal=m.prepare(q);jp=m.base/(q['id']+'.journal.json');atomic(jp,journal)
                if crash=='detach':
                    atomic(self.worker.root/'active.json',{'version':1,'revision':1,**journal['after']})
                else:
                    replace=os.replace
                    def stop(source,destination):
                        replace(source,destination)
                        if str(destination).endswith('/packages'):raise SystemExit('simulated process death')
                    with patch('maintenance.os.replace',side_effect=stop):
                        with self.assertRaises(SystemExit):m.apply(journal)
                self.worker=Worker(self.worker.root,ROOT,NoNetwork(),offline=True);self.worker.run(once=True)
                state=read_json(self.worker.root/'maintenance'/(q['id']+'.state.json'));self.assertEqual(state['state'],'completed',state)
                self.assertFalse(marker(self.worker.root).exists());self.assertEqual((self.worker.root/'.map-trash'/q['id']/'packages'/p.name/'sentinel').read_bytes(),b'never-lose')
    def test_37_delete_symlink_escape_and_restore_collision_preserve_files(self):
        request=self.request(('osm',));self.assertEqual(self.saved_job(request)['state'],'completed');before=self.worker.registry();outside=self.root/'outside';outside.mkdir();(outside/'sentinel').write_bytes(b'outside')
        package=self.worker.root/'packages'/request['id'];saved=self.root/'original-package';package.rename(saved);package.symlink_to(outside,target_is_directory=True)
        q=self.maintenance_request('delete',targetId=request['id']);state=self.run_maintenance(q);self.assertEqual(state['state'],'failed');self.assertEqual(self.worker.registry(),before);self.assertEqual((outside/'sentinel').read_bytes(),b'outside')
        package.unlink();saved.rename(package);q=self.maintenance_request('delete',targetId=request['id']);self.assertEqual(self.run_maintenance(q)['state'],'completed')
        package.mkdir();(package/'new-file').write_bytes(b'new data');before=self.worker.registry();restore=self.maintenance_request('restore',backupId=q['id']);state=self.run_maintenance(restore);self.assertEqual(state['state'],'failed',state);self.assertEqual(self.worker.registry(),before);self.assertEqual((package/'new-file').read_bytes(),b'new data')
        shutil.rmtree(package);restore=self.maintenance_request('restore',backupId=q['id']);self.assertEqual(self.run_maintenance(restore)['state'],'completed')
    def test_38_maintenance_rejects_stale_revision_missing_mount_and_wrong_confirmation(self):
        from maintenance import Maintenance,validate
        q=self.maintenance_request('clear');before=self.worker.registry();m=Maintenance(self.worker)
        for patch_values in ({'confirmation':'wrong'},{'operation':'../delete'},{'registryRevision':-1},{'id':'../bad'}):
            with self.assertRaises(WorkError):validate({**q,**patch_values})
        for patch_values in ({'registryRevision':999},{'includeLegacy':True}):
            state=self.run_maintenance({**q,'id':str(uuid.uuid4()),**patch_values});self.assertEqual(state['state'],'failed');self.assertEqual(self.worker.registry(),before)
        # Secret files explicitly configured under a map directory block that clear before detach.
        secret=self.worker.root/'private-token';secret.write_bytes(b'credential-sentinel')
        with patch.dict(os.environ,{'MAP_DOWNLOAD_ARCGIS_TOKEN_FILE':str(secret)}):state=self.run_maintenance({**q,'id':str(uuid.uuid4())})
        self.assertEqual(state['state'],'failed');self.assertEqual(secret.read_bytes(),b'credential-sentinel');self.assertEqual(self.worker.registry(),before)
    def test_40_corrupt_backup_is_rejected_before_restore_publishes_any_selection(self):
        request=self.request(('osm',));self.assertEqual(self.saved_job(request)['state'],'completed');q=self.maintenance_request('delete',targetId=request['id']);self.assertEqual(self.run_maintenance(q)['state'],'completed');before=self.worker.registry()
        backup=self.worker.root/'.map-trash'/q['id']/'packages'/request['id'];manifest=read_json(backup/'manifest.json');target=backup/manifest['files'][0]['path'];original=target.read_bytes();target.write_bytes(b'corrupt backup')
        restore=self.maintenance_request('restore',backupId=q['id']);state=self.run_maintenance(restore);self.assertEqual(state['state'],'failed',state);self.assertIn('checksum',state['error']);self.assertEqual(self.worker.registry(),before);self.assertFalse((self.worker.root/'packages'/request['id']).exists());self.assertTrue(backup.exists())
        target.write_bytes(original);(self.worker.root/'.map-trash'/q['id']/'exports'/(request['id']+'.zip')).unlink();restore=self.maintenance_request('restore',backupId=q['id']);state=self.run_maintenance(restore);self.assertEqual(state['state'],'failed');self.assertIn('누락',state['error']);self.assertEqual(self.worker.registry(),before)

    def test_39_failed_mid_move_holds_gate_and_retries_preserved_journal(self):
        from maintenance import Maintenance,marker
        p=self.worker.root/'packages'/str(uuid.uuid4());p.mkdir();(p/'sentinel').write_bytes(b'keep-me');q=self.maintenance_request('clear');atomic(marker(self.worker.root),q)
        replace=os.replace
        def locked(source,destination):
            if str(destination).endswith('/packages'):raise PermissionError('simulated file lock')
            replace(source,destination)
        with patch('maintenance.os.replace',side_effect=locked):state=Maintenance(self.worker).run(q)
        self.assertEqual(state['state'],'failed');self.assertTrue(state['recoveryRequired']);self.assertTrue(marker(self.worker.root).exists());self.assertEqual((p/'sentinel').read_bytes(),b'keep-me')
        self.assertEqual(Maintenance(self.worker).run(q)['state'],'completed');self.assertFalse(marker(self.worker.root).exists());self.assertEqual((self.worker.root/'.map-trash'/q['id']/'packages'/p.name/'sentinel').read_bytes(),b'keep-me')

if __name__=='__main__':unittest.main()
