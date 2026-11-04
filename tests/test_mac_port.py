import importlib.util,sys,unittest,tempfile,types
from pathlib import Path
from unittest.mock import patch,Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import core
from runtime import default_runtime_home

class MacPortTests(unittest.TestCase):
    def test_runtime_home_matches_electron_name_without_changing_windows(self):
        home=Path('synthetic-home')
        self.assertEqual(default_runtime_home('darwin',home),home/'Library/Application Support/workdesk')
        self.assertEqual(default_runtime_home('win32',home,'synthetic-appdata'),Path('synthetic-appdata/Workdesk'))
        self.assertEqual(default_runtime_home('linux',home),home/'.local/share/Workdesk')
    def test_gui_codex_discovery_checks_executable_homebrew_binary(self):
        with patch.dict(core.CONFIG,{},clear=True),patch('core.sys.platform','darwin'),patch('shutil.which',return_value=None),patch.object(Path,'is_file',return_value=True),patch('core.os.access',return_value=True):
            self.assertEqual(core.discover_codex(),Path('/opt/homebrew/bin')/'codex')
    def test_mac_runtime_recipe_refuses_windows_before_writing(self):
        filename=Path(__file__).resolve().parents[1]/'scripts/prepare_macos_runtime.py'
        spec=importlib.util.spec_from_file_location('mac_runtime',filename);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with patch.object(module.sys,'platform','win32'),self.assertRaisesRegex(SystemExit,'macOS Apple Silicon'):
            module.main()
    def test_mac_auto_transcription_keeps_small_int8_without_cuda_probe(self):
        filename=Path(__file__).resolve().parents[1]/'backend/pipeline/douyin_pipeline.py'
        spec=importlib.util.spec_from_file_location('mac_asr',filename);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        model=Mock();model.return_value.transcribe.return_value=([],None)
        with tempfile.TemporaryDirectory(dir=core.ROOT/'data') as folder,patch.object(module.sys,'platform','darwin'),patch.object(module.sys,'argv',['asr','transcribe','1000000000000000001','--outdir',folder]),patch.dict(sys.modules,{'faster_whisper':types.SimpleNamespace(WhisperModel=model)}),patch.object(module.subprocess,'run') as command:
            module.main();command.assert_not_called()
            model.assert_called_once_with('small',device='cpu',compute_type='int8')
            self.assertEqual(model.return_value.transcribe.call_args.kwargs,dict(language='zh',beam_size=5,vad_filter=True))
    def test_packaged_boot_guard_does_not_start_a_windows_process(self):
        filename=Path(__file__).resolve().parents[1]/'scripts/mac_packaged_boot.py'
        spec=importlib.util.spec_from_file_location('mac_boot',filename);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with patch.object(module.sys,'platform','win32'),self.assertRaisesRegex(SystemExit,'requires macOS'):
            module.main()

if __name__=='__main__':unittest.main()
