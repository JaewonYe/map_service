"""Exact-count evidence gate, reusing the existing tested conversion reporter."""
import importlib.util,json,os,sys,unittest
from pathlib import Path
root=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('conversion',root/'scripts/ci/conversion.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
suite=unittest.TestLoader().discover(str(root/'tests'),pattern='downloads_worker_test.py')
result=unittest.TextTestRunner(stream=sys.stdout,verbosity=2).run(suite);report=module.counts(result,29)
print('DOWNLOAD_WORKER_RESULT='+json.dumps(report),flush=True)
print('Evidence gate: '+('passed' if report['valid'] else 'FAILED'),flush=True)
sys.exit(0 if report['valid'] else 1)
