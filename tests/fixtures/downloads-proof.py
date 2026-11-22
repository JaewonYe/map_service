"""Create isolated UI evidence with real converters and CC0 localhost sources only."""
import json,os,pathlib,shutil,sys,uuid
from unittest.mock import patch
ROOT=pathlib.Path(os.getenv('DOWNLOAD_CODE_ROOT',pathlib.Path(__file__).resolve().parents[2]));sys.path.insert(0,str(ROOT/'tests'));sys.path.insert(0,str(ROOT/'scripts/downloads'))
from downloads_worker_test import DownloadsWorker,Transport,NoNetwork
from worker import Worker
from common import atomic,now,digest
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
if (out/'proof.json').exists():raise SystemExit('Use a new isolated evidence directory')
DownloadsWorker.setUpClass();case=DownloadsWorker('test_01_real_fixture_download_prepare_activate_and_isolated_offline_import');server=DownloadsWorker.server
try:
 source=Worker(out/'source',ROOT,Transport(server));server.export_enabled=True
 request=case.request(('satellite','osm','elevation'),name='CC0 합성 · 세 레이어 준비',demProvider='opentopography',levels={'satellite':{'min':16,'max':16},'elevation':{'min':12,'max':13}})
 atomic(source.root/'jobs'/(request['id']+'.request.json'),request)
 with patch.dict(os.environ,{'ARCGIS_TOKEN':'fixture-proof-not-real','OPENTOPOGRAPHY_API_KEY':'fixture-proof-not-real'}):source.process(request)
 state=json.loads((source.root/'jobs'/(request['id']+'.state.json')).read_text());assert state['state']=='completed',state
 target=Worker(out/'isolated',ROOT,NoNetwork(),offline=True);upload=str(uuid.uuid4());shutil.copyfile(source.root/'exports'/(request['id']+'.zip'),target.root/'incoming'/(upload+'.zip'))
 imported={'version':1,'id':str(uuid.uuid4()),'createdAt':now(),'type':'import','uploadId':upload,'confirmUsage':True,'registryRevision':0};atomic(target.root/'jobs'/(imported['id']+'.request.json'),imported);target.process(imported);s=json.loads((target.root/'jobs'/(imported['id']+'.state.json')).read_text());assert s['state']=='completed',s
 manifest=json.loads((target.root/'packages'/imported['id']/'manifest.json').read_text());proof={'transport':'CC0 synthetic localhost HTTP; production adapters/GDAL/osmium; no official source downloads','sourceJob':request['id'],'importJob':imported['id'],'zipSha256':digest(source.root/'exports'/(request['id']+'.zip')),'fileCount':len(manifest['files']),'byteIdenticalFiles':True,'isolatedNoNetworkImport':True}
 original=json.loads((source.root/'packages'/request['id']/'manifest.json').read_text());assert original['files']==manifest['files']
 # Actual checksum failure, leaving the imported active data intact.
 target.net=Transport(server);server.checksum='0'*32;failed=case.request(('osm',),name='CC0 합성 · checksum 실패',registryRevision=1);atomic(target.root/'jobs'/(failed['id']+'.request.json'),failed);target.process(failed);assert json.loads((target.root/'jobs'/(failed['id']+'.state.json')).read_text())['state']=='failed';proof['failureJob']=failed['id']
 atomic(out/'proof.json',proof);atomic(target.root/'providers.json',{'version':1,'satellite':{'state':'ready','lods':{'16':0},'maxTiles':1000,'source':'CC0 synthetic official-protocol fixture'},'osm':{'regions':{'south-korea':{'bytes':len(server.pbf),'checkedAt':now()}}}})
 print(json.dumps(proof),flush=True)
 if '--progress' in sys.argv:
  server.checksum=__import__('hashlib').md5(server.pbf).hexdigest();server.gate=out/'release-progress';progress=case.request(('osm',),name='CC0 합성 · 실제 수신 진행',registryRevision=1,refresh=True);atomic(target.root/'jobs'/(progress['id']+'.request.json'),progress);proof['progressJob']=progress['id'];atomic(out/'proof.json',proof);target.process(progress)
finally:DownloadsWorker.tearDownClass()
