import json
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from core import Service,Store,rail_order,RAIL_MODULES

class RailOrderTests(unittest.TestCase):
    def test_validation(self):
        self.assertEqual(rail_order(list(reversed(RAIL_MODULES))),list(reversed(RAIL_MODULES)))
        for value in [None,{},[],['home']*4,['home','douyin','purchases','settings'],[True,'douyin','purchases','health']]:
            with self.assertRaises(ValueError):rail_order(value)

    def test_persistence_and_corrupt_fallback_do_not_change_home_layout(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=Store(Path(tmp)/'synthetic.sqlite3');s=Service.__new__(Service);s.store=store
            store.set_setting('home_card_order','synthetic unchanged')
            self.assertEqual(s.module_order(),list(RAIL_MODULES))
            order=list(reversed(RAIL_MODULES));self.assertEqual(s.action('module_order',dict(order=order))['order'],order)
            self.assertEqual(s.module_order(),order)
            self.assertEqual(store.setting('home_card_order'),'synthetic unchanged')
            with self.assertRaises(ValueError):s.action('module_order',dict(order=['home']))
            self.assertEqual(s.module_order(),order)
            store.set_setting('module_order','invalid');self.assertEqual(s.module_order(),list(RAIL_MODULES))
            self.assertEqual(store.setting('module_order'),'invalid')
