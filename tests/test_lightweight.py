import sys, tempfile, threading, unittest
from pathlib import Path
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from core import Service, Store, ROOT

class LightweightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'data')
        self.root = Path(self.temp.name)
        self.store = Store(self.root / 'state.sqlite3')
        with patch.object(Service, 'import_local'), patch.object(Service, 'refresh_notes'):
            self.service = Service(store=self.store, vault=self.root / 'vault', start_worker=False)

    def tearDown(self):
        self.temp.cleanup()

    def test_status_query_never_loads_evidence_and_preserves_response_shape(self):
        with self.store.connect() as connection:
            connection.execute("INSERT INTO jobs(id,status,created,result) VALUES('synthetic','completed',1,?)", ('x' * 1000000,))
        with patch.object(self.store, 'rows', wraps=self.store.rows) as rows:
            jobs = self.service.snapshot()['jobs']
        query = next(call.args[0] for call in rows.call_args_list if 'FROM jobs' in call.args[0])
        self.assertNotIn('SELECT *', query)
        self.assertEqual(jobs[0]['result'], '')
        self.assertEqual(set(jobs[0]), set(self.store.rows('SELECT * FROM jobs')[0]))
        self.assertEqual(len(self.store.rows('SELECT result FROM jobs')[0]['result']), 1000000)

    def test_paused_worker_uses_long_idle_wait(self):
        self.service.wake = Mock()
        self.service.wake.wait.side_effect = lambda timeout: self.service.stop.set()
        self.service.worker()
        self.service.wake.wait.assert_called_once_with(30)
        self.service.wake.clear.assert_called_once_with()

    def test_menu_cache_is_bounded_and_does_not_share_mutable_lists(self):
        with patch('core.topics', side_effect=[['first'], ['second']]) as topics, patch('core.time.monotonic', side_effect=[10, 39, 40]):
            first = self.service.snapshot_topics()
            first.clear()
            self.assertEqual(self.service.snapshot_topics(), ['first'])
            self.assertEqual(self.service.snapshot_topics(), ['second'])
            self.assertEqual(topics.call_count, 2)

    def test_explicit_note_refresh_invalidates_menu_cache(self):
        with patch('core.topics', side_effect=[['before'], ['after']]), patch('core.scan_notes', return_value={}):
            self.assertEqual(self.service.snapshot_topics(), ['before'])
            self.service.refresh_notes()
            self.assertEqual(self.service.snapshot_topics(), ['after'])

    def test_enqueue_during_state_read_is_not_lost_before_wait(self):
        self.store.set_setting('paused', '0')
        with self.store.connect() as connection:
            connection.execute("INSERT INTO jobs(id,status,created) VALUES('synthetic','queued',1)")
        processed = threading.Event()
        wait = self.service.wake.wait
        self.service.wake.wait = Mock(wraps=wait)
        # Simulate a command landing after the worker queried an empty queue.
        rows = self.store.rows
        first = True
        def query(sql, args=()):
            nonlocal first
            if "status='queued'" in sql and first:
                first = False
                self.service.wake.set()
                return []
            return rows(sql, args)
        def process(job):
            processed.set()
            self.service.stop.set()
        # Only the first queue read simulates that interleaving.
        with patch.object(self.store, 'rows', side_effect=query), patch.object(self.service, 'process_job', side_effect=process):
            self.service.worker()
        self.assertTrue(processed.is_set())
        self.service.wake.wait.assert_called_once_with(30)

if __name__ == '__main__':
    unittest.main()
