import sys, tempfile, threading, unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from core import Service, Store, ROOT,scan_notes

class LightweightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'data')
        self.root = Path(self.temp.name)
        self.store = Store(self.root / 'state.sqlite3')
        with patch.object(Service, 'import_local'), patch.object(Service, 'refresh_notes'):
            self.service = Service(store=self.store, vault=self.root / 'vault', start_worker=False)

    def tearDown(self):
        self.temp.cleanup()

    def test_unchanged_catalog_is_omitted_and_writes_invalidate_it(self):
        self.store.upsert(dict(id='1000000000000000001',title='first'))
        initial=self.service.snapshot()
        same=self.service.snapshot(catalog=initial['catalog_revision'],jobs_revision=initial['jobs_revision'])
        self.assertNotIn('videos',same);self.assertNotIn('folders',same)
        self.assertNotIn('jobs',same)
        self.store.execute("INSERT INTO jobs(id,status) VALUES('changed-job','queued')")
        progress=self.service.snapshot(catalog=initial['catalog_revision'],jobs_revision=initial['jobs_revision'])
        self.assertIn('jobs',progress);self.assertNotIn('videos',progress)
        with self.store.connect() as c:c.execute("UPDATE videos SET title='changed'")
        updated=self.service.snapshot(catalog=initial['catalog_revision'])
        self.assertEqual(updated['videos'][0]['title'],'changed')
        self.assertNotEqual(updated['catalog_revision'],initial['catalog_revision'])
        self.service.catalog_instance='new-process'
        self.assertIn('videos',self.service.snapshot(catalog=updated['catalog_revision']))

    def test_old_unfinished_job_is_not_hidden_by_recent_history(self):
        with self.store.connect() as c:
            c.execute("INSERT INTO jobs(id,status,created) VALUES('old','failed',0)")
            c.executemany("INSERT INTO jobs(id,status,created) VALUES(?,'completed',?)",[(str(i),i+1) for i in range(320)])
        self.assertIn('old',{j['id'] for j in self.service.snapshot()['jobs']})

    def test_note_metadata_cache_reads_only_changed_sources(self):
        vault=self.root/'notes';raw=vault/'原始资料/a.md';note=vault/'处理文件/b.md'
        raw.parent.mkdir(parents=True);note.parent.mkdir(parents=True)
        raw.write_text('---\nsource: https://www.douyin.com/video/1000000000000000001\n---',encoding='utf8')
        note.write_text('---\nsource: "[[原始资料/a.md]]"\n---',encoding='utf8')
        cache={};first=scan_notes(vault,cache)
        with patch.object(Path,'open',side_effect=AssertionError('unchanged note was read')):
            self.assertEqual(scan_notes(vault,cache),first)
        note.rename(note.with_name('renamed.md'))
        self.assertEqual(scan_notes(vault,cache)['1000000000000000001']['note'],'处理文件/renamed.md')
        note.with_name('renamed.md').unlink()
        self.assertEqual(scan_notes(vault,cache)['1000000000000000001']['note'],'')

    def test_idle_browser_release_respects_visible_login_and_queued_jobs(self):
        bridge=self.service.bridge
        worker=Mock()
        with patch.object(bridge,'owned_worker',return_value=worker),patch.object(bridge,'request',return_value={'ok':True}) as request:
            with patch('core.read_json',return_value={'visible':True}):self.assertFalse(self.service.release_idle_browser())
            with patch('core.read_json',return_value={}):self.assertFalse(self.service.release_idle_browser())
            request.assert_not_called()
            with patch('core.read_json',return_value={'visible':False}):self.assertTrue(self.service.release_idle_browser())
            request.assert_called_once_with('close',timeout=20)
            worker.wait.assert_called_once_with(timeout=10)
            self.store.execute("INSERT INTO jobs(id,status) VALUES('active','queued')")
            self.assertFalse(self.service.release_idle_browser())
            self.assertEqual(request.call_count,1)

    def test_status_query_never_loads_evidence_and_preserves_response_shape(self):
        with self.store.connect() as connection:
            connection.execute("INSERT INTO jobs(id,status,created,result) VALUES('synthetic','completed',1,?)", ('x' * 1000000,))
        connect=self.store.connect;queries=[]
        @contextmanager
        def traced():
            with connect() as c:
                c.set_trace_callback(queries.append)
                yield c
        with patch.object(self.store,'connect',traced):
            jobs = self.service.snapshot()['jobs']
        query = next(query for query in queries if 'FROM jobs' in query)
        self.assertNotIn('SELECT *', query)
        self.assertEqual(jobs[0]['result'], '')
        self.assertEqual(set(jobs[0]), set(self.store.rows('SELECT * FROM jobs')[0]))
        self.assertEqual(len(self.store.rows('SELECT result FROM jobs')[0]['result']), 1000000)

    def test_unreadable_note_does_not_erase_catalog_associations(self):
        vid='1000000000000000001';self.store.upsert(dict(id=vid))
        self.service.record_note(vid,'处理文件/a.md','原始资料/a.md')
        folder=self.service.vault/'处理文件';folder.mkdir(parents=True)
        (self.service.vault/'原始资料').mkdir()
        (folder/'a.md').write_bytes(b'\xff')
        with self.assertRaisesRegex(RuntimeError,'保留上次入库状态'):self.service.refresh_notes()
        self.assertIsNone(self.service.refresh_notes(keep_on_error=True))
        self.assertEqual(self.store.rows('SELECT note,raw FROM videos')[0],dict(note='处理文件/a.md',raw='原始资料/a.md'))

    def test_missing_or_wrong_scope_keeps_snapshot_and_same_scope_single_removal_works(self):
        v=self.service.vault
        (v/'原始资料').mkdir(parents=True);(v/'处理文件').mkdir()
        vid='1000000000000000001';self.store.upsert(dict(id=vid))
        note=v/'处理文件/a.md';note.write_text('source: https://www.douyin.com/video/'+vid,encoding='utf8')
        self.assertEqual(self.service.refresh_notes(),1)
        self.service.vault=self.root/'absent'
        self.assertIsNone(self.service.refresh_notes(keep_on_error=True))
        wrong=self.root/'wrong';(wrong/'原始资料').mkdir(parents=True);(wrong/'处理文件').mkdir()
        self.service.vault=wrong
        with self.assertRaisesRegex(RuntimeError,'未更新关联'):self.service.refresh_notes()
        with self.assertRaisesRegex(RuntimeError,'未写入任何笔记'):self.service.verify_vault_binding()
        self.assertTrue(self.store.rows('SELECT note FROM videos')[0]['note'])
        self.service.vault=v;note.unlink()
        self.assertEqual(self.service.refresh_notes(),0)
        self.assertEqual(self.store.rows('SELECT note FROM videos')[0]['note'],'')
    def test_bounded_video_preserves_disk_budget_without_replacing_final(self):
        from core import write_video_stream,MediaLimitError
        part=self.root/'video.part';final=self.root/'video.mp4';final.write_bytes(b'old')
        response=Mock(headers={},**{'iter_content.return_value':iter([b'a'*1000,b'b'*1000])})
        with self.assertRaises(MediaLimitError):write_video_stream(response,part,limit=1500,reserve=0)
        self.assertEqual(final.read_bytes(),b'old')
        self.assertEqual(part.stat().st_size,1000)

    def test_publish_full_bytes_without_replacing_existing_target(self):
        from core import publish_new
        target=self.root/'note.md'
        publish_new(target,b'synthetic first')
        with self.assertRaises(FileExistsError):publish_new(target,b'synthetic replacement')
        self.assertEqual(target.read_bytes(),b'synthetic first')
        self.assertFalse(list(self.root.glob('.workdesk-*.part')))

    def test_catalog_keeps_sql_order_filters_counts_and_cross_page_selection(self):
        ids=[str(1000000000000000000+i) for i in range(65)]
        with self.store.connect() as c:
            c.executemany("INSERT INTO videos(id,title,author,favorite,favorite_position,published_at) VALUES(?,?,?,1,?,?)",
                          [(v,'synthetic','fixture',i,65-i) for i,v in enumerate(ids)])
            c.execute("UPDATE videos SET raw='fixture.md' WHERE id=?",(ids[5],))
            c.execute("UPDATE videos SET note='fixture-note.md' WHERE id=?",(ids[6],))
            c.executemany("INSERT INTO membership(folder,video,position) VALUES('f',?,?)",[(ids[4],0),(ids[1],1)])
        first=self.service.snapshot(window={'filter':['all'],'include':[ids[-1]]})
        self.assertNotIn('videos',first)
        self.assertEqual(first['totals']['favorites'],65)
        self.assertEqual(first['catalog_page']['total'],65)
        self.assertEqual([v['id'] for v in first['catalog_page']['videos']],ids[:30])
        self.assertEqual(first['catalog_page']['extra_videos'][0]['id'],ids[-1])
        rev=first['catalog_revision']
        unchanged=self.service.snapshot(rev,first['jobs_revision'],window={})
        self.assertNotIn('catalog_page',unchanged)
        second=self.service.snapshot(rev,window={'view_changed':['1'],'filter':['all'],'page':['2']})['catalog_page']
        self.assertEqual([v['id'] for v in second['videos']],ids[30:60])
        raw=self.service.snapshot(window={'filter':['raw'],'q':['SYNTHETIC'],'page':['99']})['catalog_page']
        self.assertEqual((raw['page'],raw['counts']['done'],raw['videos'][0]['id']),(1,2,ids[5]))
        folder=self.service.snapshot(window={'filter':['all'],'folder':['f']})['catalog_page']
        self.assertEqual([v['id'] for v in folder['videos']],[ids[4],ids[1]])

    def test_deferred_start_can_serve_cached_catalog_before_note_check(self):
        s=Service(store=self.store,vault=self.root/'missing',defer_index=True)
        self.assertEqual(s.snapshot(window={})['note_check'],'checking')
        with patch.object(s,'import_local'):s.initialize(start_worker=False)
        self.assertEqual(s.snapshot(window={})['note_check'],'unavailable')

    @unittest.skipUnless(sys.platform=='win32','Windows rename semantics')
    def test_publish_safe_fallback_does_not_overwrite_on_windows(self):
        import errno
        from core import publish_new
        target=self.root/'temp.md'
        with patch('core.os.link',side_effect=OSError(errno.ENOTSUP,'fixture unsupported links')):
            publish_new(target,b'synthetic')
            with self.assertRaises(FileExistsError):publish_new(target,b'caller data')
        self.assertEqual(target.read_bytes(),b'synthetic')

    def test_unchanged_snapshot_opens_one_database_connection(self):
        first=self.service.snapshot()
        with patch.object(self.store,'connect',wraps=self.store.connect) as connect:
            self.service.snapshot(first['catalog_revision'],first['jobs_revision'])
        self.assertEqual(connect.call_count,1)

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
