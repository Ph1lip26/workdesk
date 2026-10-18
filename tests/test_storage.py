import json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from storage import read_json,atomic_json
from browser_worker import atomic_json as browser_json

class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def test_missing_corrupt_and_bom_json_keep_read_contract(self):
        p=self.root/'config.json';fallback={}
        self.assertIs(read_json(p,fallback),fallback)
        p.write_text('{bad',encoding='utf-8');self.assertIs(read_json(p,fallback),fallback)
        p.write_text(json.dumps({'mode':'day'}),encoding='utf-8-sig')
        self.assertEqual(read_json(p),{'mode':'day'})
    def test_each_existing_writer_keeps_its_exact_format(self):
        data={'label':'内容','count':0}
        p=self.root/'nested'/'core.json';atomic_json(p,data)
        self.assertEqual(p.read_bytes(),json.dumps(data,ensure_ascii=False,indent=2).replace('\n',os.linesep).encode('utf-8'))
        p=self.root/'browser.json';browser_json(p,data)
        self.assertEqual(p.read_bytes(),json.dumps(data,ensure_ascii=False).encode('utf-8'))
    def test_windows_reader_lock_retries_without_rewriting_data(self):
        p=self.root/'config.json';p.write_text('{"old":true}')
        replace=os.replace;calls=[]
        def locked_once(src,dst):
            calls.append(1)
            if len(calls)==1:raise PermissionError('fixture reader lock')
            replace(src,dst)
        with patch('storage.os.replace',side_effect=locked_once),patch('storage.time.sleep') as sleep:
            atomic_json(p,{'new':True})
        self.assertEqual(read_json(p),{'new':True});self.assertEqual(len(calls),2);sleep.assert_called_once_with(.05)
    def test_exhaustion_surfaces_error_and_preserves_old_file(self):
        p=self.root/'config.json';old=b'{"old":true}';p.write_bytes(old)
        with patch('storage.os.replace',side_effect=PermissionError('fixture lock')) as replace,patch('storage.time.sleep') as sleep:
            with self.assertRaises(PermissionError):atomic_json(p,{'new':True})
        self.assertEqual(p.read_bytes(),old);self.assertEqual(replace.call_count,30);self.assertEqual(sleep.call_count,29)

if __name__=='__main__':unittest.main()
