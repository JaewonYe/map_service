"""Standard-library-only checks for conversion CI gates; no substitute converters."""
import importlib.util
import contextlib
import io
import json
from pathlib import Path
import tempfile
import os
import shutil
import subprocess
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2]/'scripts/ci/conversion.py'
spec = importlib.util.spec_from_file_location('conversion_ci', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ConversionGate(unittest.TestCase):
    def test_empty_and_all_skipped_cannot_pass(self):
        self.assertFalse(module.counts(unittest.TestResult(), 3)['valid'])
        result = unittest.TestResult()
        case = unittest.FunctionTestCase(lambda: None)
        result.startTest(case); result.addSkip(case, 'not implemented'); result.stopTest(case)
        self.assertFalse(module.counts(result, 1)['valid'])
        self.assertEqual(module.counts(result, 1)['executed'], 0)

    def test_passed_counts_and_wrong_test_count(self):
        result = unittest.TestResult()
        unittest.FunctionTestCase(lambda: None).run(result)
        self.assertTrue(module.counts(result, 1)['valid'])
        self.assertFalse(module.counts(result, 3)['valid'])

    def test_import_and_assertion_errors_remain_failed(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, 'broken_test.py').write_text('raise ImportError("missing GDAL")')
            suite = unittest.TestLoader().discover(folder, pattern='broken_test.py')
            result = unittest.TestResult(); suite.run(result)
            report = module.counts(result, 1)
            self.assertEqual(report['errors'], 1); self.assertFalse(report['valid'])
        def fail():
            raise AssertionError('conversion failed')
        result = unittest.TestResult(); unittest.FunctionTestCase(fail).run(result)
        self.assertEqual(module.counts(result, 1)['failures'], 1)
        self.assertFalse(module.counts(result, 1)['valid'])

    def test_shell_preserves_first_failure_and_runs_both_suites(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            script = root/'scripts/ci/conversion-tests.sh'; script.parent.mkdir(parents=True)
            shutil.copyfile(SCRIPT.with_name('conversion-tests.sh'), script)
            fakebin = root/'bin'; fakebin.mkdir()
            docker = fakebin/'docker'
            docker.write_text('#!/usr/bin/env bash\necho "diagnostic $*"\nif [[ "$*" == *map-service-elevation-tools:ci* ]]; then exit 7; fi\n')
            docker.chmod(0o755)
            result = subprocess.run(['bash', str(script)], env={**os.environ, 'PATH': str(fakebin)+os.pathsep+os.environ['PATH']}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 7)
            self.assertIn('map-service-osm-tools:ci', (root/'.cache/ci/conversion/osm.log').read_text())

    def test_missing_or_broken_report_is_not_execution_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'result.log'
            self.assertIsNone(module.read_report(path))
            path.write_text('build failed\n'); self.assertIsNone(module.read_report(path))
            path.write_text(module.MARKER+'bad json\n'); self.assertIsNone(module.read_report(path))
            path.write_text('test progress ... '+module.MARKER+json.dumps({'valid': True})+'\n')
            self.assertIsNone(module.read_report(path))

    def test_progress_traceback_and_report_share_stdout_and_keep_failure_evidence(self):
        def passing(): pass
        def failing(): raise AssertionError('synthetic conversion failure')
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'result.log'
            for fail in (False, True):
                with self.subTest(fail=fail):
                    suite = unittest.TestSuite([unittest.FunctionTestCase(passing), unittest.FunctionTestCase(passing), unittest.FunctionTestCase(failing if fail else passing)])
                    stdout, stderr = io.StringIO(), io.StringIO()
                    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr), patch.object(module, 'preflight', return_value={}), patch.object(unittest.TestLoader, 'discover', return_value=suite):
                        status = module.run('dem')
                    self.assertEqual(status, 1 if fail else 0)
                    self.assertEqual(stderr.getvalue(), '')
                    self.assertIn('Ran 3 tests', stdout.getvalue())
                    self.assertEqual(sum(line.startswith(module.MARKER) for line in stdout.getvalue().splitlines()), 1)
                    path.write_text(stdout.getvalue()); report = module.read_report(path)
                    self.assertEqual(report['valid'], not fail)
                    self.assertEqual(report['passed'], 2 if fail else 3)
                    self.assertEqual(report['failures'], 1 if fail else 0)
            stdout, stderr = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr), patch.object(module, 'preflight', side_effect=RuntimeError('synthetic setup failure')):
                self.assertEqual(module.run('dem'), 1)
            self.assertEqual(stderr.getvalue(), '')
            self.assertIn('Traceback', stdout.getvalue())
            path.write_text(stdout.getvalue()); report = module.read_report(path)
            self.assertFalse(report['valid']); self.assertEqual(report['errors'], 1)


if __name__ == '__main__':
    unittest.main()
