"""Synthetic localhost transport tests; NOT real provider permission/download evidence."""
import copy, hashlib, http.server, io, json, os, pathlib, shutil, signal, socketserver, sqlite3, stat, struct, subprocess, sys, tempfile, threading, time, unittest, urllib.request, uuid, zipfile
from unittest.mock import patch
ROOT=pathlib.Path(os.getenv('DOWNLOAD_CODE_ROOT',pathlib.Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(ROOT/'scripts/downloads'));sys.path.insert(0,str(ROOT/'tests'))
from common import *
from worker import Worker
from providers import validate_tpk, secret
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
        if self.server.required_referer and (name.startswith('/arcgis/') or name.endswith('.tpk')) and self.headers.get('Referer')!=self.server.required_referer:data=b'{"error":{"code":498}}'
        elif self.server.export_enabled and name.endswith('/MapServer'):data=json.dumps({'exportTilesAllowed':True,'maxExportTilesCount':1000,'tileInfo':{'rows':256,'cols':256,'spatialReference':{'wkid':3857},'lods':[{'level':0,'resolution':156543.03392804097/2**16}]}}).encode()
        elif self.server.export_enabled and name.endswith('/exportTiles'):data=b'{"jobId":"fixture-job","jobStatus":"esriJobSubmitted"}'
        elif self.server.export_enabled and name.endswith('/jobs/fixture-job'):data=b'{"jobStatus":"esriJobSucceeded","results":{"out":{"paramUrl":"results/out"}}}'
        elif self.server.export_enabled and name.endswith('/results/out'):data=json.dumps({'value':{'url':'https://tiledbasemaps.arcgis.com/export/map.'+self.server.export_extension}}).encode()
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
        cls.server=socketserver.TCPServer(('127.0.0.1',0),Handler);cls.server.pbf=cls.pbf;cls.server.dem=dem.read_bytes();cls.server.tpk=tpk.getvalue();cls.server.export_enabled=False;cls.server.required_referer=None;cls.server.seen_headers=[];cls.server.export_extension='tpk';cls.server.checksum=hashlib.md5(cls.pbf).hexdigest();cls.server.truncate=False;cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.tmp.cleanup()
    def setUp(self):
        secrets_patch=patch.dict(os.environ,{'ARCGIS_TOKEN':'','OPENTOPOGRAPHY_API_KEY':'','MAP_DOWNLOAD_ARCGIS_TOKEN_FILE':'','MAP_DOWNLOAD_OPENTOPOGRAPHY_KEY_FILE':'','ARCGIS_REFERER':''});secrets_patch.start();self.addCleanup(secrets_patch.stop)
        self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name);self.addCleanup(self.temp.cleanup);self.worker=Worker(self.root/'downloads',ROOT,Transport(self.server));self.server.checksum=hashlib.md5(self.pbf).hexdigest();self.server.truncate=False;self.server.export_enabled=False;self.server.required_referer=None;self.server.seen_headers=[];self.server.export_extension='tpk'
    def request(self,kinds=('osm','elevation'),**extra):
        return {'version':1,'type':'download','id':str(uuid.uuid4()),'createdAt':now(),'name':'CC0 다운로드 검사','bounds':{'west':126.23,'south':36.59,'east':126.25,'north':36.61},'kinds':list(kinds),'region':'south-korea','demProvider':'aws','levels':{'satellite':{'min':0,'max':13},'elevation':{'min':12,'max':13}},'accepted':dict.fromkeys(kinds,True),'registryRevision':0,**extra}
    def status(self,request):return read_json(self.worker.root/'jobs'/(request['id']+'.state.json'))
    def run_job(self,request):self.worker.process(request);return self.status(request)
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

if __name__=='__main__':unittest.main()
