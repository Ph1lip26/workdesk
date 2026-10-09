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

    def test_open_refresh_starts_background_sync(self):
        with patch('core.CONFIG', {}):
            result = self.service.action('open_refresh', {})
        self.assertEqual(result, dict(ok=True, local_notes=3, remote='started'))
        self.service.refresh_notes.assert_called_once_with()
        self.service.import_local.assert_called_once_with()
        self.service.sync.assert_called_once_with()
        self.assertFalse(self.service.write_lock.locked())

    def test_busy_browser_is_never_restarted(self):
        for lock in ['sync_lock', 'auth_lock']:
            with self.subTest(lock=lock):
                getattr(self.service, lock).acquire()
                with patch('core.CONFIG', {}):
                    self.assertEqual(self.service.action('open_refresh', {})['remote'], 'busy')
                getattr(self.service, lock).release()
        self.service.sync.assert_not_called()

    def test_publication_busy_local_scan_is_skipped(self):
        self.service.write_lock.acquire()
        with patch('core.CONFIG', {'refresh_favorites_on_open':False}):
            result = self.service.action('open_refresh', {})
        self.assertEqual(result, dict(ok=True, local_notes=None, remote='disabled'))
        self.service.refresh_notes.assert_not_called()
        self.service.import_local.assert_not_called()
        self.service.sync.assert_not_called()
        self.assertTrue(self.service.write_lock.locked())
        self.service.write_lock.release()

    def test_scan_failure_releases_lock(self):
        self.service.refresh_notes.side_effect = OSError('synthetic failure')
        with self.assertRaises(OSError):
            self.service.action('open_refresh', {})
        self.assertFalse(self.service.write_lock.locked())

    def test_sync_lock_race_is_coalesced(self):
        self.service.sync.side_effect = ValueError('busy')
        with patch('core.CONFIG', {}):
            self.assertEqual(self.service.action('open_refresh', {})['remote'], 'busy')

    def test_theme_action_only_writes_the_private_preference(self):
        with tempfile.TemporaryDirectory() as tmp, patch('core.ROOT',Path(tmp)):
            self.assertEqual(self.service.action('appearance',{'mode':'day'})['mode'],'day')
            self.assertEqual(json.loads((Path(tmp)/'appearance.json').read_text()),{'mode':'day'})
        self.service.sync.assert_not_called()
        self.service.refresh_notes.assert_not_called()
