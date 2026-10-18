import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
from core import Store, home_order, HOME_CARDS
from health import Health, note_measurements
from home import Homepage


class HealthTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name)/'synthetic.sqlite3')
        self.health = Health(self.store)
        self.day = dt.date.today().isoformat()

    def tearDown(self):
        self.tmp.cleanup()

    def test_empty_without_seeded_personal_weight(self):
        self.assertEqual(self.health.snapshot(), dict(records=[]))

    def bind_note(self, text):
        root = Path(self.tmp.name)
        vault = root/'vault'
        note = vault/'处理文件/测试画像.md'
        note.parent.mkdir(parents=True, exist_ok=True)
        note.write_text(text, encoding='utf-8')
        (root/'homepage.json').write_text(json.dumps(dict(schema=1, sources=[dict(id='profile',path='处理文件/测试画像.md')])), encoding='utf-8')
        self.health = Health(self.store, Homepage(vault, root))
        return note

    def test_sync_profile_explicit_day_and_provenance_idempotently(self):
        self.bind_note(f'| 身高 / 体重 | 180cm / 90.125kg（体重秤；用户{self.day}报告；上次2025-01-01：89kg） |')
        self.assertEqual(self.health.snapshot()['records'], [])  # No import on reads.
        self.assertEqual(self.health.sync()['added'], 1)
        row = self.health.snapshot()['records'][0]
        self.assertEqual((row['day'],row['grams'],row['source']), (self.day,90125,'处理文件/测试画像.md'))
        self.assertEqual(self.health.sync()['added'], 0)
        self.assertEqual(self.health.sync()['existing'], 1)

    def test_sync_conflict_preserves_manual_row_and_revision(self):
        self.bind_note(f'| {self.day} | 91公斤 |')
        self.health.save(dict(day=self.day, value='90', unit='kg'))
        before = self.health.snapshot()
        report = self.health.sync()
        self.assertEqual(report['conflicts'], [dict(day=self.day,incoming=[91000],existing=[90000])])
        self.assertEqual(self.health.snapshot(), before)

    def test_same_day_identical_manual_measurement_is_not_duplicated(self):
        self.bind_note(f'| {self.day} | 180斤 |')
        self.health.save(dict(day=self.day, value='90', unit='kg'))
        self.assertEqual(self.health.sync()['existing'], 1)
        self.assertEqual(self.health.snapshot()['records'][0]['source'], '')

    def test_multiple_source_values_are_not_arbitrarily_selected(self):
        self.bind_note(f'| {self.day} | 90kg |\n| {self.day} | 91kg |')
        self.assertEqual(self.health.sync()['conflicts'][0]['incoming'], [90000,91000])
        self.assertEqual(self.health.snapshot()['records'], [])

    def test_refresh_does_not_resurrect_deleted_import(self):
        self.bind_note(f'| {self.day} | 90kg |')
        self.health.sync()
        row = self.health.snapshot()['records'][0]
        self.health.delete(dict(id=row['id'], revision=row['revision']))
        self.assertEqual(self.health.sync()['added'], 0)
        self.assertEqual(self.health.snapshot()['records'], [])

    def test_concurrent_refresh_imports_once(self):
        from concurrent.futures import ThreadPoolExecutor
        self.bind_note(f'| {self.day} | 90kg |')
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(lambda _: self.health.sync(), range(2)))
        self.assertEqual(sum(r['added'] for r in results), 1)

    def test_no_date_inference_predictions_or_invalid_weights(self):
        future=(dt.date.today()+dt.timedelta(days=1)).isoformat()
        for body in ['| 体重 | 90kg |', f'| 体重 | 目标90kg（{self.day}） |',
                     f'| {future} | 90kg |', '| 2025-02-29 | 90kg |',
                     f'| {self.day} | 90.0001kg |', f'| {self.day} | 约90kg |',
                     f'| {self.day} | 900kg |', f'| {self.day} | -90kg |',
                     f'| {self.day} | 1e2kg |', f'| {self.day} | 1,090kg |', f'| {self.day} | ~90kg |']:
            self.assertEqual(note_measurements('---\nupdated: '+self.day+'\n---\n'+body), [])

    def test_missing_unbound_and_unsafe_source_fail_without_mutation(self):
        with self.assertRaises(ValueError):self.health.sync()
        note=self.bind_note('| 体重 | 90kg |')
        with self.assertRaises(ValueError):self.health.sync()
        note.unlink()
        with self.assertRaises(ValueError):self.health.sync()
        (Path(self.tmp.name)/'homepage.json').write_text(json.dumps(dict(schema=1,sources=[dict(id='profile',path='../outside.md')])),encoding='utf-8')
        with self.assertRaises(ValueError):self.health.sync()
        self.assertEqual(self.health.snapshot()['records'], [])

    def test_units_exact_restart_and_revision(self):
        ident = self.health.save(dict(day=self.day, value='180.25', unit='jin'))['id']
        row = Health(self.store).snapshot()['records'][0]
        self.assertEqual(row['grams'], 90125)
        self.health.save(dict(id=ident, revision=1, day=self.day, value='90.126', unit='kg'))
        self.assertEqual(self.health.snapshot()['records'][0]['grams'], 90126)
        with self.assertRaises(ValueError):
            self.health.save(dict(id=ident, revision=1, day=self.day, value='90', unit='kg'))

    def test_invalid_values_and_dates_are_atomic(self):
        for value in [True, None, [], {}, 'NaN', 'Infinity', '-1', '0', '501', '90.0001']:
            with self.assertRaises(ValueError):
                self.health.save(dict(day=self.day, value=value, unit='kg'))
        for day in ['2026-2-3', '2025-02-29', None, [], (dt.date.today()+dt.timedelta(days=1)).isoformat()]:
            with self.assertRaises(ValueError):
                self.health.save(dict(day=day, value='90', unit='kg'))
        self.assertEqual(self.health.snapshot()['records'], [])

    def test_delete_requires_current_revision(self):
        ident=self.health.save(dict(day=self.day, value='90', unit='kg'))['id']
        with self.assertRaises(ValueError):
            self.health.delete(dict(id=ident, revision=2))
        self.health.delete(dict(id=ident, revision=1))
        with self.assertRaises(ValueError):
            self.health.delete(dict(id=ident, revision=1))
        self.assertEqual(self.health.snapshot()['records'], [])

    def test_separate_measurements_same_day_preserve_history(self):
        for value in ['90','91']:
            self.health.save(dict(day=self.day,value=value,unit='kg'))
        self.assertEqual(len(self.health.snapshot()['records']),2)
        self.assertEqual(self.store.rows('SELECT * FROM jobs'),[])

    def test_eight_card_layout_filters_hidden_cards_without_reordering_survivors(self):
        order=['health','focus','douyin','purchases','later','materials','status','next']
        self.assertEqual(home_order(order,legacy=True),['health','douyin','purchases','materials','status','next'])
        self.assertEqual(len(order),8)
    def test_preserve_old_six_card_layout_read_only(self):
        order=['douyin','status','focus','next','materials','later']
        self.assertEqual(home_order(order,legacy=True),['douyin','status','next','materials','purchases','health'])
        with self.assertRaises(ValueError):home_order(order)
        self.assertEqual(len(HOME_CARDS),6)
