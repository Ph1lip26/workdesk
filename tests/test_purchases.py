"""Synthetic records only. Never reads a personal shopping note or prices."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
from core import Store, Service
from purchases import Purchases
from runtime import ROOT


class PurchaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT/'data')
        self.root = Path(self.tmp.name)
        self.store = Store(self.root/'records.sqlite3')
        self.p = Purchases(self.store, self.root/'vault')
        self.record = dict(title='测试购买', budget='不超过100元', needs='轻便，排除旧款',
                           status='waiting', origin='advice', wait_condition='官方公布后再核实',
                           candidates=[dict(name='合成候选',price='99元',channel='测试渠道',checked_at='2026-01-01')])

    def tearDown(self):
        self.tmp.cleanup()

    def create(self):
        return self.p.save(dict(record=self.record))['record']

    def test_empty_no_personal_defaults(self):
        self.assertEqual(self.p.snapshot()['records'], [])

    def test_roundtrip_and_restart(self):
        record = self.create()
        self.assertEqual(record['revision'], 1)
        self.assertEqual(Purchases(self.store,self.p.vault).snapshot()['records'][0], record)
        self.assertEqual(self.store.rows('SELECT * FROM videos'), [])

    def test_update_and_stale_revision_cannot_overwrite(self):
        first = self.create()
        changed = {**self.record,'title':'更新的测试购买'}
        result = self.p.save(dict(id=first['id'],revision=1,record=changed))['record']
        self.assertEqual(result['revision'], 2)
        with self.assertRaisesRegex(ValueError,'已被其他操作更新'):
            self.p.save(dict(id=first['id'],revision=1,record=self.record))
        self.assertEqual(self.p.get(first['id'])['title'], changed['title'])

    def test_missing_id_is_not_created(self):
        with self.assertRaises(ValueError):
            self.p.save(dict(id='a'*32,revision=1,record=self.record))

    def test_status_never_changes_when_date_passes(self):
        self.record['review_date']='2000-01-01'
        record=self.create()
        self.assertEqual(self.p.snapshot()['records'][0]['status'], 'waiting')
        self.assertEqual(record['candidates'][0]['checked_at'], '2026-01-01')

    def test_invalid_shape_limits_and_dates_are_atomic(self):
        for field,value in [('title',''),('status','bought'),('status',[]),('origin','verified'),
                            ('budget',None),('review_date','2026-02-30'),('candidates',[{}]),
                            ('candidates',[{'name':'x'}]*13),('needs','x'*5001)]:
            with self.subTest(field=field,value=str(value)[:20]):
                with self.assertRaises(ValueError):self.p.save(dict(record={**self.record,field:value}))
                self.assertEqual(self.p.snapshot()['records'], [])

    def test_urls_are_not_executable_or_credentials(self):
        for value in ['javascript:alert(1)','file:///private','https://name:password@example.com','https://']:
            with self.assertRaises(ValueError):self.p.validate({**self.record,'source_url':value})
        self.assertEqual(self.p.validate({**self.record,'source_url':'https://example.com/item'})['source_url'],'https://example.com/item')

    def test_reference_validates_saved_record_not_arbitrary_path(self):
        note=self.p.vault/'输出文件/测试/合成资料.md';note.parent.mkdir(parents=True)
        note.write_text('synthetic',encoding='utf8');self.record['source_note']='输出文件/测试/合成资料.md'
        record=self.create();self.assertEqual(self.p.reference(record['id']),self.record['source_note'])
        note.unlink()
        with self.assertRaisesRegex(ValueError,'不存在'):self.p.reference(record['id'])
        self.assertEqual(self.p.get(record['id'])['source_note'],self.record['source_note'])

    def test_paths_cannot_escape(self):
        for note in ['../secret.md','/secret.md','输出文件/../secret.md','输出文件//a.md',
                     '原始资料/secret.md','输出文件/script.py','输出文件\\a.md']:
            with self.assertRaises(ValueError):self.p.validate({**self.record,'source_note':note})

    def test_service_action_routes_without_ai_or_vault_writes(self):
        service=Service(self.store,self.p.vault,start_worker=False)
        self.assertTrue(service.action('purchase_save',{'record':self.record})['ok'])
        self.assertFalse(self.p.vault.exists())

    def test_unknown_fields_are_not_persisted(self):
        self.record['credential']='do not persist'
        self.assertNotIn('credential',self.create())

    def test_shelve_is_reversible_not_delete(self):
        record=self.create();self.record['status']='shelved'
        saved=self.p.save(dict(id=record['id'],revision=record['revision'],record=self.record))['record']
        self.assertEqual(len(self.p.snapshot()['records']),1)
        self.record['status']='research'
        self.assertEqual(self.p.save(dict(id=saved['id'],revision=saved['revision'],record=self.record))['record']['status'],'research')
