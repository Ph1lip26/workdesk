import os,sys,tempfile,subprocess,threading,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import components
from core import Service

def probe_result(ok):
    return SimpleNamespace(returncode=0 if ok else 1,stdout='validated\n' if ok else '',stderr='' if ok else 'incomplete namespace\n')

class DecoderTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.root_patch=patch.object(components,'ROOT',self.root);self.root_patch.start()
        self.log=self.root/'components.log'
    def tearDown(self):
        self.root_patch.stop();self.temp.cleanup()
    def test_healthy_component_is_probed_without_network(self):
        with patch.object(components,'decoder_probe',return_value=probe_result(True)) as probe,patch.object(components.subprocess,'run') as install:
            components.ensure_decoder(self.log)
        self.assertEqual(probe.call_count,1);install.assert_not_called()
    def test_incomplete_install_is_replaced_and_verified(self):
        with patch.object(components,'decoder_probe',side_effect=[probe_result(False),probe_result(True),probe_result(True)]) as probe,patch.object(components.subprocess,'run') as install:
            components.ensure_decoder(self.log)
        self.assertEqual(probe.call_count,3)
        args=install.call_args.args[0]
        self.assertIn('--no-deps',args)
        self.assertEqual(args[-1],'av==18.0.0')
        target=self.root/'components'
        fresh=Path(args[args.index('--target')+1])
        self.assertEqual(fresh.parent,target)
        self.assertNotEqual(fresh,target)
        self.assertEqual([call.args[0] for call in probe.call_args_list],[target,fresh,target])
        self.assertIn(fresh.name,(target/'av.py').read_text())
        self.assertIn('incomplete namespace',self.log.read_text())
    def test_failed_loader_switch_restores_previous_loader(self):
        target=self.root/'components';target.mkdir()
        previous=components.LOADER_MARKER+'# synthetic previous loader\n'
        (target/'av.py').write_text(previous)
        with patch.object(components,'decoder_probe',side_effect=[probe_result(False),probe_result(True),probe_result(False)]),patch.object(components.subprocess,'run'):
            with self.assertRaises(components.DecoderUnavailable):components.ensure_decoder(self.log)
        self.assertEqual((target/'av.py').read_text(),previous)
    def test_failed_first_switch_does_not_leave_an_invalid_loader(self):
        with patch.object(components,'decoder_probe',side_effect=[probe_result(False),probe_result(True),probe_result(False)]),patch.object(components.subprocess,'run'):
            with self.assertRaises(components.DecoderUnavailable):components.ensure_decoder(self.log)
        self.assertFalse((self.root/'components/av.py').exists())
    def test_unmanaged_loader_is_never_overwritten(self):
        target=self.root/'components';target.mkdir()
        previous='# unrelated application loader\n';(target/'av.py').write_text(previous)
        with patch.object(components,'decoder_probe',side_effect=[probe_result(False),probe_result(True)]),patch.object(components.subprocess,'run'):
            with self.assertRaises(components.DecoderUnavailable):components.ensure_decoder(self.log)
        self.assertEqual((target/'av.py').read_text(),previous)
    def test_failed_install_is_actionable_not_a_raw_command(self):
        with patch.object(components,'decoder_probe',return_value=probe_result(False)),patch.object(components.subprocess,'run',side_effect=subprocess.CalledProcessError(1,['pip'])):
            with self.assertRaises(components.DecoderUnavailable) as error:components.ensure_decoder(self.log)
        self.assertIn('队列已暂停',str(error.exception));self.assertNotIn('python.exe',str(error.exception))
    def test_install_success_does_not_override_failed_health_check(self):
        with patch.object(components,'decoder_probe',return_value=probe_result(False)),patch.object(components.subprocess,'run'):
            with self.assertRaises(components.DecoderUnavailable):components.ensure_decoder(self.log)
    def test_probe_timeout_is_an_actionable_failure(self):
        with patch.object(components,'decoder_probe',side_effect=subprocess.TimeoutExpired('probe',30)):
            with self.assertRaises(components.DecoderUnavailable):components.ensure_decoder(self.log)
    def test_actual_subprocess_uses_local_component_before_shadow_in_cwd(self):
        target=self.root/'components';package=target/'av';package.mkdir(parents=True)
        (package/'__init__.py').write_text("__version__='18.0.0'\nlibrary_versions={'avcodec': (1,)}\ndef open(): pass\n")
        (self.root/'av.py').write_text("# unrelated module without decoder API\n")
        with patch.object(components,'PYTHON',Path(sys.executable)):
            result=components.decoder_probe(target,dict(os.environ))
        self.assertEqual(result.returncode,0,result.stderr)
    def test_actual_subprocess_rejects_namespace_without_version(self):
        target=self.root/'components';(target/'av').mkdir(parents=True)
        # Hide the test runtime's valid upstream package with a broken module.
        (target/'av'/'__init__.py').write_text('')
        with patch.object(components,'PYTHON',Path(sys.executable)):
            result=components.decoder_probe(target,dict(os.environ))
        self.assertNotEqual(result.returncode,0)
        self.assertIn('decoder version missing',result.stderr)
    def test_component_failure_pauses_before_next_task(self):
        service=Service.__new__(Service);service.stop=threading.Event();service.wake=threading.Event()
        service.store=Mock();service.store.setting.return_value='0'
        service.store.rows.side_effect=[[{'id':'fixture-job'}],[{'stage':'components'}]]
        service.update_job=Mock()
        def fail(job):
            service.stop.set();raise components.DecoderUnavailable('fixture failure')
        service.process_job=fail;service.worker()
        service.store.set_setting.assert_called_once_with('paused','1')
        service.update_job.assert_called_once_with('fixture-job',status='failed',message='fixture failure')

if __name__=='__main__':unittest.main()
