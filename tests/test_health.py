import datetime as dt
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
from core import Store, home_order, HOME_CARDS
from health import Health


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
