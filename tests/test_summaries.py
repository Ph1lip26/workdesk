import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock,patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from core import Store
from home import Homepage
from purchases import Purchases
from summaries import Summaries


class SummaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.vault=self.root/'vault';self.path=self.vault/'处理文件/status.md';self.path.parent.mkdir(parents=True)
        self.path.write_text('User is preparing for an exam.\nNext step: review errors.\n',encoding='utf8')
        (self.root/'homepage.json').write_text(json.dumps(dict(schema=1,sources=[dict(id='exam',path='处理文件/status.md')])),encoding='utf8')
        self.store=Store(self.root/'synthetic.sqlite3');self.service=SimpleNamespace(store=self.store,home=Homepage(self.vault,self.root),purchases=Purchases(self.store,self.vault),ideas=SimpleNamespace(busy=False),run_command=Mock())
        self.s=Summaries(self.service,self.root,lambda:'synthetic-codex')

    def tearDown(self):self.tmp.cleanup()

    def result(self,payload):
        return dict(items=[dict(key='current',record_id='',text='Preparing for an exam',when='',kind='fact',evidence=[dict(source_id='s1',quote='User is preparing for an exam.')])],warnings=[])

    def generated(self,scope='home'):
        payload,versions,warnings,digest=self.s.collect(scope)
        self.store.execute("INSERT OR REPLACE INTO summaries VALUES(?,'running','','','{}','[]',0,'')",(scope,))
        def command(args,logfile,**kwargs):
            logfile.write_text('',encoding='utf8');(logfile.parent/'result.json').write_text(json.dumps(self.result(payload)),encoding='utf8')
        self.service.run_command.side_effect=command
        self.s.generate(scope,payload,versions,warnings,digest,'synthetic-codex');return self.s.snapshot()['records'][0]

    def test_reads_do_not_generate(self):
        self.assertEqual(self.s.snapshot(),dict(records=[],running=False));self.service.run_command.assert_not_called()

    def test_manual_generate_validates_quote_and_cache_skips_model(self):
        self.assertEqual(self.generated()['status'],'completed');self.service.run_command.reset_mock()
        self.assertEqual(self.s.start(dict(scope='home'))['status'],'unchanged');self.service.run_command.assert_not_called()

    def test_changed_source_changes_hash_even_outside_excerpt(self):
        self.path.write_text('first\n'+'z'*16000+'\nold',encoding='utf8');a=self.s.collect('home')[3]
        self.path.write_text('first\n'+'z'*16000+'\nnew',encoding='utf8');self.assertNotEqual(a,self.s.collect('home')[3])

    def test_bad_quote_does_not_replace_previous_result(self):
        old=self.generated()['result'];payload,versions,warnings,digest=self.s.collect('home')
        self.result=lambda p:dict(items=[dict(key='current',record_id='',text='Wrong',when='',kind='fact',evidence=[dict(source_id='s1',quote='invented unsupported quote')])],warnings=[])
        self.s.generate('home',payload,versions,warnings,digest,'synthetic-codex');row=self.s.snapshot()['records'][0]
        self.assertEqual(row['status'],'failed');self.assertEqual(row['result'],old)

    def test_source_changing_during_generation_rejects_stale(self):
        def command(args,logfile,**kwargs):
            logfile.write_text('');(logfile.parent/'result.json').write_text(json.dumps(self.result(None)));self.path.write_text('Changed during generation')
        self.service.run_command.side_effect=command
        payload,versions,warnings,digest=self.s.collect('home');self.store.execute("INSERT INTO summaries VALUES('home','running','','','{}','[]',0,'')")
        self.s.generate('home',payload,versions,warnings,digest,'synthetic-codex');self.assertEqual(self.s.snapshot()['records'][0]['status'],'failed')

    def test_unknown_source_date_and_record_rejected(self):
        payload=self.s.collect('home')[0]
        for field,value in [('source_id','missing'),('quote','not in source')]:
            result=self.result(payload);result['items'][0]['evidence'][0][field]=value
            with self.assertRaises(ValueError):self.s.validate(result,payload)
        result=self.result(payload);result['items'][0]['when']='2040-01-01'
        with self.assertRaises(ValueError):self.s.validate(result,payload)

    def test_purchase_manual_data_not_modified_and_missing_binding_explicit(self):
        record=self.service.purchases.save(dict(record=dict(title='Synthetic purchase')))['record'];before=self.service.purchases.snapshot()
        payload,_,warnings,_=self.s.collect('purchase:'+record['id']);self.assertTrue(warnings)
        self.assertEqual(payload['records'][0]['id'],record['id']);self.assertEqual(before,self.service.purchases.snapshot())

    def test_missing_sources_preserves_existing_cache_and_reports(self):
        self.generated();self.path.unlink()
        with self.assertRaises(ValueError):self.s.start(dict(scope='home'))
        self.assertTrue(self.s.snapshot()['records'][0]['result'])

    def test_busy_blocks_parallel_and_restart_keeps_cache(self):
        old=self.generated()['result'];self.store.execute("UPDATE summaries SET status='running'")
        with self.assertRaises(ValueError):self.s.start(dict(scope='purchase:'+'a'*32))
        self.assertEqual(self.s.start(dict(scope='home'))['status'],'running')
        s=Summaries(self.service,self.root,lambda:'synthetic');self.assertFalse(s.busy);self.assertEqual(s.snapshot()['records'][0]['result'],old)

    def test_reference_accepts_only_saved_source_not_caller_path(self):
        self.generated();self.assertEqual(self.s.reference('home','s1'),'处理文件/status.md')
        with self.assertRaises(ValueError):self.s.reference('home','../outside')

if __name__=='__main__':unittest.main()
