import datetime as dt
import tempfile
import unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from core import Store
from illness import Illness


class IllnessTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(Path(self.tmp.name)/'synthetic.sqlite3')
        self.illness=Illness(self.store)
        self.day=dt.date.today().isoformat()

    def tearDown(self):
        self.tmp.cleanup()

    def save(self,**extra):
        return self.illness.save(dict(day=self.day,symptoms='Synthetic symptom',content='Line 1\nLine 2',**extra))

    def test_empty_no_inferred_records(self):
        self.assertEqual(self.illness.snapshot(),dict(records=[]))

    def test_save_edit_restart_and_delete_with_revision(self):
        ident=self.save()['id']
        row=Illness(self.store).snapshot()['records'][0]
        self.assertEqual(row['content'],'Line 1\nLine 2')
        self.illness.save(dict(id=ident,revision=1,day=self.day,symptoms='Changed',content=''))
        self.assertEqual(self.illness.snapshot()['records'][0]['revision'],2)
        with self.assertRaises(ValueError):self.illness.delete(dict(id=ident,revision=1))
        self.illness.delete(dict(id=ident,revision=2))
        with self.assertRaises(ValueError):self.illness.delete(dict(id=ident,revision=2))
        self.assertEqual(self.illness.snapshot()['records'],[])

    def test_invalid_inputs_never_write(self):
        for bad in [dict(day='2025-02-29'),dict(day=(dt.date.today()+dt.timedelta(days=1)).isoformat()),dict(day=[]),dict(symptoms=' '),dict(symptoms=1),dict(symptoms='x'*301),dict(content=[]),dict(content='x'*10001),dict(id=4)]:
            data=dict(day=self.day,symptoms='Test',content='');data.update(bad)
            with self.assertRaises(ValueError):self.illness.save(data)
        self.assertEqual(self.illness.snapshot()['records'],[])

    def test_stale_update_and_delete_do_not_overwrite(self):
        ident=self.save()['id'];self.save(id=ident,revision=1)
        before=self.illness.snapshot()
        for revision in [1,None,True,3]:
            with self.assertRaises(ValueError):self.save(id=ident,revision=revision)
        self.assertEqual(before,self.illness.snapshot())

    def test_same_day_multiple_records_and_sorting(self):
        self.save();self.save()
        self.illness.save(dict(day='2020-01-01',symptoms='Older'))
        self.assertEqual(len(self.illness.snapshot()['records']),3)
        self.assertEqual(self.illness.snapshot()['records'][-1]['day'],'2020-01-01')
        self.assertEqual(self.store.rows('SELECT * FROM jobs'),[])

if __name__=='__main__':unittest.main()
