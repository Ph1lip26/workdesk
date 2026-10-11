"""Opening and appearance tests use only synthetic data and mocked browsers."""
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
from appearance import read_mode, save_mode
from core import Service


class AppearanceTests(unittest.TestCase):
    def test_default_corruption_and_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(read_mode(root), 'night')
            for value in ['broken', '[]', '{"mode":[]}', '{"mode":"unknown"}']:
                (root/'appearance.json').write_text(value)
                self.assertEqual(read_mode(root), 'night')
            for mode in ['day', 'night', 'system']:
                self.assertEqual(save_mode(root, mode), dict(ok=True, mode=mode))
                self.assertEqual(read_mode(root), mode)
                self.assertEqual(list(root.glob('*.tmp')), [])

    def test_invalid_input_cannot_change_preference(self):
        with tempfile.TemporaryDirectory() as tmp:
            save_mode(tmp, 'day')
            for value in [None, [], {}, 'unknown', '../night']:
                with self.assertRaises(ValueError):
                    save_mode(tmp, value)
                self.assertEqual(read_mode(tmp), 'day')


class OpeningTests(unittest.TestCase):
    def setUp(self):
        self.service = Service.__new__(Service)
        for name in ['sync_lock', 'auth_lock', 'write_lock']:
            setattr(self.service, name, threading.Lock())
        self.service.refresh_notes = Mock(return_value=3)
        self.service.import_local = Mock()
        self.service.sync = Mock()

    def test_old_opening_requests_are_side_effect_free(self):
        for enabled in [True, False]:
            with patch('core.CONFIG', {'refresh_favorites_on_open':enabled}):
                self.assertEqual(self.service.action('open_refresh', {}),
                                 dict(ok=True,local_notes=None,remote='disabled'))
        self.service.refresh_notes.assert_not_called()
        self.service.import_local.assert_not_called()
        self.service.sync.assert_not_called()

    def test_theme_action_only_writes_the_private_preference(self):
        with tempfile.TemporaryDirectory() as tmp, patch('core.ROOT',Path(tmp)):
            self.assertEqual(self.service.action('appearance',{'mode':'day'})['mode'],'day')
            self.assertEqual(json.loads((Path(tmp)/'appearance.json').read_text()),{'mode':'day'})
        self.service.sync.assert_not_called()
        self.service.refresh_notes.assert_not_called()
