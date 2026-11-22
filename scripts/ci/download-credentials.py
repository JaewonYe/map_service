"""Real Compose credential delivery with synthetic values and no container network."""
import json, os, subprocess, sys, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
IMAGE=sys.argv[1] if len(sys.argv)>1 else 'map-service-download-worker:ci'
KEYS=('ARCGIS_TOKEN','OPENTOPOGRAPHY_API_KEY','MAP_DOWNLOAD_ARCGIS_TOKEN_FILE','MAP_DOWNLOAD_OPENTOPOGRAPHY_KEY_FILE')
subprocess.run(['docker','image','inspect',IMAGE],capture_output=True,check=True)
with tempfile.TemporaryDirectory(prefix='map-credential-proof-') as temporary:
    directory=Path(temporary)
    for name in ('downloads','imagery','dem'):(directory/name).mkdir(mode=0o755)
    private=directory/'private';private.write_text('fixture-file-token\n');private.chmod(0o644)
    empty=directory/'empty.env';empty.write_text('')
    override=directory/'compose.json'
    override.write_text(json.dumps({'services':{'download-worker':{'image':IMAGE,'network_mode':'none','read_only':True,'volumes':[{'type':'bind','source':str(private),'target':'/run/secrets/fixture-token','read_only':True}]}}}))
    base={**os.environ,**dict.fromkeys(KEYS,''),'MAP_DOWNLOADS_HOST_DIR':str(directory/'downloads'),'IMAGERY_HOST_DIR':str(directory/'imagery'),'DEM_HOST_DIR':str(directory/'dem')}
    command=['docker','compose','--env-file',str(empty),'-p','map-credentials-'+str(os.getpid()),'-f',str(ROOT/'compose.yaml'),'-f',str(override),'--profile','downloads']
    cases=[('unset',{},None),('environment',dict.fromkeys(KEYS[:2],'fixture-env-token'),'fixture-env-token'),('explicit-file',dict.fromkeys(KEYS[2:],'/run/secrets/fixture-token'),'fixture-file-token'),('environment-priority',{**dict.fromkeys(KEYS[:2],'fixture-env-token'),**dict.fromkeys(KEYS[2:],'/run/secrets/not-mounted')},'fixture-env-token')]
    for name,settings,expected in cases:
        environment={**base,**settings}
        config=subprocess.run(command+['config','--format','json'],env=environment,cwd=ROOT,capture_output=True,text=True,check=True)
        worker=json.loads(config.stdout)['services']['download-worker']
        assert worker['network_mode']=='none'
        for key in KEYS:assert worker['environment'][key]==environment[key],name+': unexpected credential source'
        check="import sys;sys.path.insert(0,'/app/scripts/downloads');from providers import secret;"+''.join("assert secret("+repr(file)+","+repr(variable)+",'fixture')=="+repr(expected)+";" for variable,file in zip(KEYS[:2],KEYS[2:]))+"print('CREDENTIALS_OK')"
        result=subprocess.run(command+['run','--rm','--no-deps','--entrypoint','/usr/bin/python3','download-worker','-c',check],env=environment,cwd=ROOT,capture_output=True,text=True,timeout=60)
        if result.returncode or 'CREDENTIALS_OK' not in result.stdout:
            diagnostic=(result.stderr+result.stdout)[-3000:]
            for value in ('fixture-env-token','fixture-file-token'):diagnostic=diagnostic.replace(value,'[fixture]')
            raise RuntimeError(name+': Compose credential probe failed: '+diagnostic)
        print(name+': PASS',flush=True)
print('COMPOSE_CREDENTIAL_RESULT: 4 passed; synthetic values only; network none; no credential values emitted',flush=True)
