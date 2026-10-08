import os,sys
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parents[1]/'backend'))
import contextlib, io, json, hashlib, sqlite3, tempfile, unittest
from pathlib import Path
from unittest.mock import patch,Mock
from core import Store,Service,BrowserBridge,scan_notes,video_id,SCHEMA,IMAGE_SCHEMA,ROOT,topics,read_json,atomic_json,image_manifest
from browser_worker import extract_response,atomic_json as browser_atomic_json,login_required_text,retry_collection_scroll

ID='1000000000000000001'
class Tests(unittest.TestCase):
    def setUp(self):
        # All artifacts stay inside the isolated runtime test directory.
        self.temp=tempfile.TemporaryDirectory(dir=ROOT/'data');self.root=Path(self.temp.name)
        self.vault=self.root/'vault';self.topic=self.vault/'处理文件/AI学习'
        self.topic.mkdir(parents=True);(self.topic/'_索引.md').write_text('# 索引\n',encoding='utf-8')
        self.raw=self.vault/'原始资料/已处理';self.raw.mkdir(parents=True);(self.raw/'_处理日志.md').write_text('# 日志\n',encoding='utf-8')
    def tearDown(self):self.temp.cleanup()
    def test_startup_cache_cannot_overwrite_existing_favorite_metadata(self):
        store=Store(self.root/'state.sqlite3');media=self.root/'media';folder=media/ID;folder.mkdir(parents=True)
        cached=dict(aweme_id=ID,desc='Stale cached title',author='Cached author',duration=12,cover_url='https://invalid.test/old.png')
        (folder/'meta.json').write_text(json.dumps(cached),encoding='utf-8')
        store.upsert(dict(id=ID,title='Current favorite title',author='Current author',duration=12.75,cover='https://invalid.test/current.png'),favorite=True)
        before=store.rows('SELECT * FROM videos WHERE id=?',(ID,))[0]
        service=Mock();service.store=store
        with patch('core.MEDIA',media):Service.import_local(service)
        self.assertEqual(store.rows('SELECT * FROM videos WHERE id=?',(ID,))[0],before)
    def test_startup_cache_still_discovers_missing_records(self):
        store=Store(self.root/'state.sqlite3');media=self.root/'media';folder=media/ID;folder.mkdir(parents=True)
        cached=dict(aweme_id=ID,desc='New local material',duration=12.75)
        (folder/'meta.json').write_text(json.dumps(cached),encoding='utf-8')
        service=Mock();service.store=store
        with patch('core.MEDIA',media):Service.import_local(service)
        row=store.rows('SELECT * FROM videos WHERE id=?',(ID,))[0]
        self.assertEqual(row['title'],'New local material');self.assertEqual(row['duration'],12.75);self.assertEqual(row['favorite'],0)
    def test_ids(self):
        self.assertEqual(video_id(f'https://www.douyin.com/user/self?modal_id={ID}'),ID)
        self.assertEqual(video_id(ID),ID)
        for bad in ('../test','http://127.0.0.1/secret','123','x'+ID):
            with self.assertRaises(ValueError):video_id(bad)
    def test_images_enqueue_and_deduplicate(self):
        db=Store(self.root/'state.db');db.upsert(dict(id=ID,title='图文',kind='images'))
        self.assertEqual(len(db.enqueue([ID])['added']),1)
        self.assertEqual(db.enqueue([ID])['skipped'],[ID])
    def test_source_links(self):
        (self.raw/'原始笔记.md').write_text(f'---\nsource: "https://www.douyin.com/video/{ID}"\n---\n',encoding='utf-8')
        (self.topic/'知识笔记.md').write_text('---\nsource: "[[原始资料/已处理/原始笔记.md]]"\n---\n',encoding='utf-8')
        (self.topic/'相似标题.md').write_text('内容来自同一作者，但没有source',encoding='utf-8')
        self.assertEqual(scan_notes(self.vault)[ID]['note'],'处理文件/AI学习/知识笔记.md')
    def test_queue_dedup_and_resume(self):
        db=Store(self.root/'state.db');db.upsert(dict(id=ID,title='测试视频'))
        self.assertEqual(len(db.enqueue([ID,ID])['added']),1)
        jid=db.rows('SELECT id FROM jobs')[0]['id'];db.execute("UPDATE jobs SET status='running' WHERE id=?",(jid,))
        resumed=Store(self.root/'state.db');self.assertEqual(resumed.rows('SELECT status FROM jobs')[0]['status'],'queued')
        self.assertEqual(len(resumed.enqueue([ID])['added']),0)
    def service(self):
        with patch.object(Service,'import_local'),patch.object(Service,'refresh_notes'):
            return Service(Store(self.root/'db.sqlite3'),self.vault,start_worker=False)
    def test_navigation_motion_default_and_persistent_opt_in(self):
        s=self.service();self.assertEqual(s.snapshot()['navigation_motion'],'system')
        self.assertTrue(s.action('navigation_motion',dict(mode='on'))['ok'])
        self.assertEqual(s.snapshot()['navigation_motion'],'on')
        self.assertEqual(Store(self.root/'db.sqlite3').setting('navigation_motion'),'on')
    def test_home_card_order_default_and_persistent(self):
        s=self.service();order=['douyin','focus','status','later','next','materials']
        self.assertEqual(s.snapshot()['home_card_order'],['status','next','focus','douyin','later','materials'])
        self.assertEqual(s.action('home_layout',dict(order=order))['order'],order)
        self.assertEqual(self.service().snapshot()['home_card_order'],order)
    def test_home_card_order_rejects_unknown_duplicate_and_nonlist(self):
        s=self.service()
        for order in (None,{},'status',[],['status']*5,['status','next','focus','douyin','secret'],[{},'next','focus','douyin','later']):
            with self.assertRaises(ValueError):s.action('home_layout',dict(order=order))
        self.assertEqual(s.snapshot()['home_card_order'],['status','next','focus','douyin','later','materials'])
    def test_home_layout_does_not_change_tasks_or_notes(self):
        s=self.service();s.store.set_setting('paused','1');before=self.vault/'处理文件/AI学习/_索引.md'
        original=before.read_bytes();jobs=s.snapshot()['jobs'];videos=s.snapshot()['videos']
        s.action('home_layout',dict(order=['later','status','next','focus','douyin','materials']))
        self.assertEqual(s.snapshot()['jobs'],jobs);self.assertEqual(s.snapshot()['videos'],videos)
        self.assertEqual(before.read_bytes(),original);self.assertEqual(s.store.setting('paused'),'1');self.assertFalse(s.wake.is_set())
    def test_corrupt_saved_layout_uses_default(self):
        s=self.service()
        for raw in ('bad json','["unknown"]','{}','null'):
            s.store.set_setting('home_card_order',raw)
            self.assertEqual(s.snapshot()['home_card_order'],['status','next','focus','douyin','later','materials'])
    def test_legacy_five_card_order_is_extended_without_rewriting_settings(self):
        s=self.service();legacy=['douyin','focus','status','later','next']
        raw=json.dumps(legacy,separators=(',',':'));s.store.set_setting('home_card_order',raw)
        self.assertEqual(s.snapshot()['home_card_order'],legacy+['materials'])
        self.assertEqual(s.store.setting('home_card_order'),raw)
        self.assertEqual(self.service().snapshot()['home_card_order'],legacy+['materials'])
        with self.assertRaises(ValueError):s.action('home_layout',dict(order=legacy))
        self.assertEqual(s.store.setting('home_card_order'),raw)
    def test_invalid_legacy_order_is_not_migrated(self):
        s=self.service()
        for legacy in (['status']*5,['status','next','focus','douyin','unknown'],[{},'next','focus','douyin','later']):
            raw=json.dumps(legacy);s.store.set_setting('home_card_order',raw)
            self.assertEqual(s.snapshot()['home_card_order'],['status','next','focus','douyin','later','materials'])
            self.assertEqual(s.store.setting('home_card_order'),raw)
    def test_navigation_motion_rejects_invalid_values(self):
        s=self.service()
        for mode in (None,'always','<script>',{},True):
            with self.assertRaises(ValueError):s.action('navigation_motion',dict(mode=mode))
        self.assertEqual(s.snapshot()['navigation_motion'],'system')
    def test_motion_preference_does_not_start_jobs_or_change_pause(self):
        s=self.service();s.store.set_setting('paused','1')
        for mode in ('on','off','system'):s.action('navigation_motion',dict(mode=mode))
        self.assertEqual(s.store.setting('paused'),'1');self.assertFalse(s.wake.is_set())
    def result(self):return dict(title='多模态学习清单',topic='处理文件/AI学习',needs_placement=False,transcript_clean='',visual_summary='00:02 Python',evidence=[dict(timestamp=2,kind='visual',content='Python')],uncertainties=['抽样不代表完整视频'],note_markdown='# 多模态学习清单\n\n作者展示Python等主题，顺序未验证。')
    def images(self,count=2):
        from PIL import Image
        d=self.root/'media';d.mkdir(exist_ok=True);rows=[]
        for n in range(1,count+1):
            p=d/f'image_{n:03d}.png';Image.new('RGB',(30,30),(n*20,0,0)).save(p)
            rows.append(dict(image_number=n,file=p.name,width=30,height=30,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
        atomic_json(d/'images.json',dict(count=count,images=rows));atomic_json(d/'meta.json',dict(aweme_id=ID,kind='images',author='作者',desc='原文案',duration=0))
        return d
    def image_result(self,count=2):
        r=self.result();r['visual_summary']='图1、图2文字';r['evidence']=[dict(image_number=n,kind='visual',content=f'图{n}原文') for n in range(1,count+1)];return r
    def test_image_result_requires_all_pages_and_no_fake_transcript(self):
        s=self.service();d=self.images();r=self.image_result();s.validate_analysis(r,d)
        r['evidence'].pop()
        with self.assertRaisesRegex(RuntimeError,'漏图'):s.validate_analysis(r,d)
        r=self.image_result();r['evidence'][1]['image_number']=3
        with self.assertRaisesRegex(RuntimeError,'越界'):s.validate_analysis(r,d)
        r=self.image_result();r['transcript_clean']='伪造口播'
        with self.assertRaisesRegex(RuntimeError,'伪造转写'):s.validate_analysis(r,d)
        r=self.result()
        with self.assertRaises(Exception):s.validate_analysis(r,d)
    def test_image_manifest_rejects_missing_changed_and_incomplete(self):
        d=self.images();self.assertEqual(image_manifest(d)['count'],2)
        (d/'image_002.png').write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError,'改变'):image_manifest(d)
        (d/'image_002.png').unlink()
        with self.assertRaisesRegex(RuntimeError,'缺失'):image_manifest(d)
        atomic_json(d/'images.json',dict(count=3,images=read_json(d/'images.json')['images']))
        with self.assertRaisesRegex(RuntimeError,'不完整'):image_manifest(d)
    def test_image_publish_originals_not_ai_or_asr_and_idempotent(self):
        s=self.service();d=self.images();r=self.image_result();run=self.root/'run';run.mkdir()
        note=s.publish(ID,r,d,run);rawtext=(self.vault/read_json(run/'publish-journal.json')['raw']).read_text(encoding='utf-8')
        self.assertIn(f'https://www.douyin.com/note/{ID}',rawtext)
        self.assertIn('image_count: 2',rawtext);self.assertNotIn('ASR',rawtext);self.assertNotIn('图1原文',rawtext)
        self.assertEqual(len(list(self.raw.glob('*.png'))),2)
        self.assertIn('图2：图2原文',(self.vault/note).read_text(encoding='utf-8'))
        self.assertEqual(s.publish(ID,r,d,run),note);self.assertEqual(len(list(self.raw.glob('*.png'))),2)
        self.assertEqual(scan_notes(self.vault)[ID]['note'],note)
    def test_image_attachment_conflict_not_overwritten(self):
        s=self.service();d=self.images();p=self.raw/f'抖音_{ID}_图01.png';p.write_bytes(b'other agent');run=self.root/'run';run.mkdir()
        with self.assertRaisesRegex(RuntimeError,'不覆盖'):s.publish(ID,self.image_result(),d,run)
        self.assertEqual(p.read_bytes(),b'other agent')
    def test_image_download_each_original_and_cache(self):
        from PIL import Image
        data=io.BytesIO();Image.new('RGB',(20,30),'blue').save(data,format='PNG');payload=data.getvalue();s=self.service()
        class Response:
            def __enter__(self):return self
            def __exit__(self,*a):pass
            def raise_for_status(self):pass
            def iter_content(self,*a):return [payload]
        detail=dict(ok=True,detail=dict(aweme_id=ID,desc='图文',images=[dict(url_list=['https://example.test/1']),dict(url_list=['https://example.test/2'])]))
        with patch('core.MEDIA',self.root/'download'),patch.object(s.bridge,'request',return_value=detail) as request,patch('requests.get',return_value=Response()) as get:
            d=s.ensure_images(ID,self.root);self.assertEqual(image_manifest(d)['count'],2);self.assertEqual(get.call_count,2)
            s.ensure_images(ID,self.root);self.assertEqual(request.call_count,1)
    def test_wrong_detail_id_and_long_image_album_rejected(self):
        s=self.service()
        with patch('core.MEDIA',self.root/'download'),patch.object(s.bridge,'request',return_value=dict(ok=True,detail=dict(aweme_id='123',images=[{}]))):
            with self.assertRaisesRegex(RuntimeError,'准确详情'):s.ensure_images(ID,self.root)
        with patch('core.MEDIA',self.root/'download'),patch.object(s.bridge,'request',return_value=dict(ok=True,detail=dict(aweme_id=ID,images=[{}]*41))):
            with self.assertRaisesRegex(RuntimeError,'不截断'):s.ensure_images(ID,self.root)
    def test_image_job_skips_audio_and_frame_commands(self):
        s=self.service();d=self.images();s.store.upsert(dict(id=ID,kind='images'));jid=s.store.enqueue([ID])['added'][0]
        with patch('core.ROOT',self.root/'workbench'),patch.object(s,'ensure_images',return_value=d),patch.object(s,'analyze',return_value=self.image_result()),patch.object(s,'run_command') as command,patch('components.ensure_decoder') as decoder:
            s.process_job(s.store.rows('SELECT * FROM jobs')[0]);command.assert_not_called();decoder.assert_not_called()
        self.assertEqual(s.store.rows('SELECT * FROM jobs')[0]['status'],'completed')
    def video_job(self):
        s=self.service();d=self.root/'video';d.mkdir();atomic_json(d/'meta.json',dict(kind='video'))
        s.store.upsert(dict(id=ID,kind='video'));s.store.enqueue([ID])
        return s,d,s.store.rows('SELECT * FROM jobs')[0]
    def test_video_decoder_ready_before_asr_frames_and_model(self):
        s,d,j=self.video_job();calls=[];r=self.result();r.update(topic='',needs_placement=True)
        def command(args,logfile,**kw):calls.append(Path(logfile).stem)
        def analyze(*args):calls.append('gpt');return r
        with patch('core.ROOT',self.root/'workbench'),patch.object(s,'ensure_media',return_value=d),patch('components.ensure_decoder',side_effect=lambda *_:calls.append('decoder')),patch.object(s,'run_command',side_effect=command),patch.object(s,'analyze',side_effect=analyze),patch.object(s,'publish') as publish:
            s.process_job(j);publish.assert_not_called()
        self.assertEqual(calls,['decoder','transcribe','frames','gpt'])
        self.assertEqual(s.store.rows('SELECT status FROM jobs')[0]['status'],'needs_review')
    def test_decoder_failure_stops_before_asr_or_model(self):
        s,d,j=self.video_job()
        with patch('core.ROOT',self.root/'workbench'),patch.object(s,'ensure_media',return_value=d),patch('components.ensure_decoder',side_effect=RuntimeError('decoder unavailable')),patch.object(s,'run_command') as command,patch.object(s,'analyze') as model:
            with self.assertRaisesRegex(RuntimeError,'decoder unavailable'):s.process_job(j)
            command.assert_not_called();model.assert_not_called()
        self.assertEqual(s.store.rows('SELECT stage FROM jobs')[0]['stage'],'components')
    def test_cancel_during_decoder_setup_does_not_start_asr(self):
        s,d,j=self.video_job()
        def cancel(*_):s.store.execute('UPDATE jobs SET cancel=1 WHERE id=?',(j['id'],))
        with patch('core.ROOT',self.root/'workbench'),patch.object(s,'ensure_media',return_value=d),patch('components.ensure_decoder',side_effect=cancel),patch.object(s,'run_command') as command,patch.object(s,'analyze') as model:
            s.process_job(j);command.assert_not_called();model.assert_not_called()
        self.assertEqual(s.store.rows('SELECT status FROM jobs')[0]['status'],'cancelled')
    def test_image_analyze_attaches_all_pages_and_reuses_verified(self):
        s=self.service();d=self.images();run=self.root/'run';run.mkdir();calls=[]
        def fake_model(args,logfile,**kw):
            calls.append(args);self.assertIn('image_number',kw['stdin'])
            atomic_json(run/'analysis.json',self.image_result());Path(logfile).write_text('',encoding='utf-8')
        with patch('core.discover_codex',return_value='codex'),patch.object(s,'run_command',side_effect=fake_model):
            r=s.analyze(ID,d,run);atomic_json(run/'verified-analysis.json',r)
            self.assertEqual(s.analyze(ID,d,run),r);self.assertEqual(len(calls),1)
        self.assertIn(d/'image_001.png',calls[0]);self.assertIn(d/'image_002.png',calls[0])
        self.assertNotIn(d/'visual_contact_sheet.jpg',calls[0]);self.assertNotIn('raw_transcript',read_json(run/'input.json'))
        # Source change must invalidate the previous verified draft even if the new manifest is intact.
        from PIL import Image
        Image.new('RGB',(30,30),'green').save(d/'image_002.png');m=read_json(d/'images.json');m['images'][1]['sha256']=hashlib.sha256((d/'image_002.png').read_bytes()).hexdigest();atomic_json(d/'images.json',m)
        with patch('core.discover_codex',return_value='codex'),patch.object(s,'run_command',side_effect=fake_model):s.analyze(ID,d,run)
        self.assertEqual(len(calls),2)
    def test_image_analysis_tool_use_not_publishable(self):
        s=self.service();d=self.images();run=self.root/'run';run.mkdir()
        def bad_model(args,logfile,**kw):
            atomic_json(run/'analysis.json',self.image_result());Path(logfile).write_text('{"item":{"type":"command_execution"}}\n',encoding='utf-8')
        with patch('core.discover_codex',return_value='codex'),patch.object(s,'run_command',side_effect=bad_model):
            with self.assertRaisesRegex(RuntimeError,'只读分析边界'):s.analyze(ID,d,run)
        self.assertFalse((run/'verified-analysis.json').exists())
    def test_publication_and_idempotence(self):
        s=self.service();d=self.root/'media';d.mkdir();(d/'transcript_raw.txt').write_text('',encoding='utf-8');(d/'meta.json').write_text(json.dumps(dict(author='作者',desc='原文案',duration=31)),encoding='utf-8');run=self.root/'run';run.mkdir()
        r=self.result();note=s.publish(ID,r,d,run)
        original=(self.vault/note).read_text(encoding='utf-8');rawtext=(self.vault/read_json(run/'publish-journal.json')['raw']).read_text(encoding='utf-8')
        self.assertIn(note,(self.topic/'_索引.md').read_text(encoding='utf-8'))
        self.assertNotIn('作者展示Python',rawtext)
        self.assertEqual(s.publish(ID,r,d,run),note)
        self.assertEqual((self.vault/note).read_text(encoding='utf-8'),original)
        self.assertEqual((self.topic/'_索引.md').read_text(encoding='utf-8').count(note),1)
        self.assertEqual((self.raw/'_处理日志.md').read_text(encoding='utf-8').count(f'<!-- douyin-workbench:{ID} -->'),1)
    def test_journal_repairs_interrupted_index(self):
        s=self.service();d=self.root/'m';d.mkdir();(d/'transcript_raw.txt').write_text('',encoding='utf-8');(d/'meta.json').write_text('{}',encoding='utf-8');run=self.root/'r';run.mkdir()
        note=s.publish(ID,self.result(),d,run)
        (self.topic/'_索引.md').write_text('# 其他Agent新增内容\n',encoding='utf-8')
        s.publish(ID,self.result(),d,run)
        self.assertIn('其他Agent新增内容',(self.topic/'_索引.md').read_text(encoding='utf-8'))
        self.assertIn(note,(self.topic/'_索引.md').read_text(encoding='utf-8'))
    def test_invalid_topic_rejected(self):
        s=self.service();r=self.result();r['topic']='处理文件/AI学习/../../原始资料'
        run=self.root/'r';run.mkdir()
        with self.assertRaises(ValueError):s.publish(ID,r,self.root,run)
    def test_bad_timestamps_rejected(self):
        s=self.service();d=self.root/'media';d.mkdir();(d/'meta.json').write_text('{"duration":31}',encoding='utf-8');r=self.result();r['evidence'][0]['timestamp']=40
        with self.assertRaises(RuntimeError):s.validate_analysis(r,d)
    def test_collection_normalizer(self):
        data=dict(aweme_list=[dict(aweme_id=ID,create_time=1791000000,desc='测试',video=dict(duration=31000,cover=dict(url_list=['https://example.test/x'])),author=dict(nickname='作者'))],collects_list=[dict(collects_id='123',collects_name='我的收藏夹')],has_more=0)
        v,f,m=extract_response(data,'https://www.douyin.com/aweme/v1/web/collects/video/list/?collects_id=123')
        self.assertEqual(v[0]['duration'],31);self.assertEqual(f[0]['name'],'我的收藏夹');self.assertEqual(m,[('123',ID)])
        self.assertEqual(v[0]['published_at'],1791000000)
    def test_legacy_order_migration(self):
        path=self.root/'legacy.db'
        with contextlib.closing(sqlite3.connect(path)) as c:
            c.execute("CREATE TABLE videos(id TEXT PRIMARY KEY,title TEXT,author TEXT,duration REAL,cover TEXT,url TEXT,kind TEXT DEFAULT 'video',favorite INTEGER DEFAULT 0,seen REAL DEFAULT 0,note TEXT DEFAULT '',raw TEXT DEFAULT '')")
            c.executemany('INSERT INTO videos(id,favorite,seen) VALUES(?,1,?)',[(ID,1),('1000000000000000002',2)])
            c.commit()
        db=Store(path)
        self.assertEqual([v['id'] for v in db.rows('SELECT * FROM videos ORDER BY favorite_position')],[ID,'1000000000000000002'])
        self.assertEqual(Store(path).rows('SELECT favorite_position FROM videos WHERE id=?',(ID,))[0]['favorite_position'],0)
    def test_complete_sync_keeps_source_order_and_note(self):
        s=self.service();ids=[ID,'1000000000000000002','1000000000000000000']
        s.store.upsert(dict(id=ID));s.store.execute('UPDATE videos SET note=? WHERE id=?',('处理文件/AI学习/已有笔记.md',ID))
        s.store.apply_sync(dict(ok=True,complete=True,folders_complete=True,videos=[dict(id=i,published_at=10+n) for n,i in enumerate(ids)],favorite_order=ids))
        self.assertEqual([v['id'] for v in s.snapshot()['videos']],ids)
        self.assertEqual(s.snapshot()['videos'][0]['note'],'处理文件/AI学习/已有笔记.md')
        s.store.execute('UPDATE videos SET seen=999 WHERE id=?',(ids[-1],))
        self.assertEqual([v['id'] for v in s.snapshot()['videos']],ids)
    def test_partial_and_failed_sync_preserve_ranks(self):
        s=self.service();ids=[ID,'1000000000000000002']
        s.store.apply_sync(dict(ok=True,complete=True,videos=[dict(id=i) for i in ids],favorite_order=ids))
        s.store.apply_sync(dict(ok=True,complete=False,videos=[dict(id=ids[-1])],favorite_order=[ids[-1]]))
        self.assertEqual([v['id'] for v in s.snapshot()['videos']],ids)
        s.store.apply_sync(dict(ok=False,complete=True,videos=[]))
        self.assertEqual(len(s.store.rows('SELECT * FROM videos WHERE favorite=1')),2)
    def test_folder_order_and_folder_only_not_favorite(self):
        s=self.service();other='1000000000000000002'
        s.store.apply_sync(dict(ok=True,complete=True,folders_complete=True,videos=[dict(id=ID),dict(id=other)],favorite_order=[ID],folders=[dict(id='123',name='主题')],membership=[('123',other),('123',ID)]))
        self.assertEqual(s.store.rows('SELECT favorite FROM videos WHERE id=?',(other,))[0]['favorite'],0)
        self.assertEqual([m['video'] for m in s.store.rows('SELECT * FROM membership ORDER BY position')],[other,ID])
    def test_placement_and_cancel(self):
        s=self.service();s.store.upsert(dict(id=ID));jid=s.store.enqueue([ID])['added'][0];s.update_job(jid,status='needs_review')
        s.action('place',dict(id=jid,topic='处理文件/AI学习'));self.assertEqual(s.store.rows('SELECT topic FROM jobs')[0]['topic'],'处理文件/AI学习')
        s.action('cancel',dict(id=jid));self.assertEqual(s.store.rows('SELECT status FROM jobs')[0]['status'],'cancelled')
    def test_open_job_note_uses_exact_vault_path(self):
        s=self.service();p=self.topic/'目标笔记.md';p.write_text('# 目标',encoding='utf-8');s.store.upsert(dict(id=ID));jid=s.store.enqueue([ID])['added'][0]
        s.update_job(jid,note='处理文件/AI学习/目标笔记.md')
        with patch('core.ROOT',self.root),patch.object(s,'run_command') as command:
            result=s.action('open_note',dict(job=jid,path='../../untrusted.md'))
        self.assertTrue(result['ok']);self.assertEqual(command.call_args.args[0][1:],['vault=vault','open','path=处理文件/AI学习/目标笔记.md'])
    def test_open_video_raw_fallback_and_missing_note(self):
        s=self.service();p=self.raw/'原文.md';p.write_text('# 原文',encoding='utf-8');s.store.upsert(dict(id=ID));s.store.execute('UPDATE videos SET raw=? WHERE id=?',('原始资料/已处理/原文.md',ID))
        with patch('core.ROOT',self.root),patch.object(s,'run_command') as command:
            self.assertEqual(s.action('open_note',dict(video=ID))['note'],'原始资料/已处理/原文.md');self.assertEqual(command.call_count,1)
            p.unlink()
            with self.assertRaisesRegex(ValueError,'不存在'):s.action('open_note',dict(video=ID))
    def test_open_note_rejects_unknown_and_outside_vault(self):
        s=self.service();s.store.upsert(dict(id=ID));s.store.execute('UPDATE videos SET note=? WHERE id=?',('../secret.md',ID))
        with patch.object(s,'run_command') as command:
            with self.assertRaisesRegex(ValueError,'知识库内'):s.action('open_note',dict(video=ID))
            with self.assertRaisesRegex(ValueError,'没有'):s.action('open_note',dict(job='not-known'))
            with self.assertRaisesRegex(ValueError,'已入库'):s.action('open_note',dict(path='处理文件/AI学习/目标.md'))
            command.assert_not_called()
    def test_open_note_cli_error_is_visible(self):
        s=self.service();p=self.topic/'目标.md';p.write_text('# 目标',encoding='utf-8');s.store.upsert(dict(id=ID));s.store.execute('UPDATE videos SET note=? WHERE id=?',('处理文件/AI学习/目标.md',ID))
        def failed(args,logfile,**kw):
            Path(logfile).parent.mkdir(exist_ok=True);Path(logfile).write_text('Command line interface is not enabled',encoding='utf-8')
        with patch('core.ROOT',self.root),patch.object(s,'run_command',side_effect=failed):
            with self.assertRaisesRegex(RuntimeError,'未能打开'):s.action('open_note',dict(video=ID))
    def test_failed_sync_preserves_visible_count(self):
        s=self.service();s.store.apply_sync(dict(ok=True,complete=True,videos=[dict(id=ID)],favorite_order=[ID]))
        s.store.set_setting('last_success_sync',json.dumps(dict(complete=True,folders_complete=True,updated=123)))
        result=s.failed_sync('TargetClosedError')
        self.assertEqual(result['count'],1);self.assertTrue(result['complete']);self.assertEqual(result['last_success_updated'],123)
        self.assertNotIn('TargetClosedError',result['message'])
    def test_login_prompt_requires_explicit_evidence(self):
        self.assertTrue(login_required_text('未登录\n收藏'))
        self.assertTrue(login_required_text('登录后即可观看喜欢、收藏的视频'))
        self.assertFalse(login_required_text('登录\n隐私政策\n我的收藏'))
        self.assertFalse(login_required_text('网络异常，请重试'))
    def test_stalled_collection_uses_rendered_scroll_not_api(self):
        page=Mock();retry_collection_scroll(page)
        script=page.evaluate.call_args.args[0]
        self.assertIn('document.scrollingElement',script);self.assertIn('scrollTop',script)
        self.assertNotIn('fetch(',script)
        page.mouse.wheel.assert_called_once_with(0,1200)
        page.wait_for_timeout.assert_called_once_with(2500)
    def test_failed_sync_keeps_login_reason_and_cache(self):
        s=self.service();s.store.upsert(dict(id=ID),favorite=True)
        result=s.failed_sync('请扫码','login_required')
        self.assertEqual(result['error_code'],'login_required');self.assertEqual(result['count'],1)
        self.assertIn('尚未登录',result['message']);self.assertEqual(len(s.snapshot()['videos']),1)
        self.assertEqual(s.failed_sync('timeout')['error_code'],'read_failed')
    def test_auth_check_failure_does_not_claim_expired_login(self):
        import time
        s=self.service()
        with patch.object(s.bridge,'request',return_value=dict(ok=False,error_code='read_failed')):
            s.check_login()
            for _ in range(100):
                if not s.auth_lock.locked():break
                time.sleep(.01)
        account=s.snapshot()['account'];self.assertFalse(account['needs_login'])
        self.assertEqual(account['error_code'],'auth_check_failed')
    def test_sync_login_failure_sets_account_but_keeps_favorites(self):
        import time
        s=self.service();s.store.upsert(dict(id=ID),favorite=True)
        with patch.object(s.bridge,'request',return_value=dict(ok=False,error_code='login_required',message='未登录')):
            s.sync()
            for _ in range(100):
                if not s.sync_lock.locked():break
                time.sleep(.01)
        snapshot=s.snapshot();self.assertTrue(snapshot['account']['needs_login'])
        self.assertEqual(snapshot['sync']['error_code'],'login_required');self.assertEqual(len(snapshot['videos']),1)
    def test_background_retries_closed_once_without_gui(self):
        b=BrowserBridge()
        with patch.object(b,'start') as start,patch.object(b,'exchange',side_effect=[dict(ok=False,error_code='browser_closed'),dict(ok=True)]) as exchange,patch('core.time.sleep'):
            self.assertTrue(b.request('sync')['ok']);self.assertEqual(exchange.call_count,2)
            self.assertEqual(start.call_args_list[0].kwargs,dict(visible=False));self.assertEqual(start.call_args_list[1].kwargs,dict(visible=False))
    def test_visible_window_only_explicit(self):
        b=BrowserBridge()
        with patch.object(b,'start') as start:
            self.assertTrue(b.request('open_login')['ok']);start.assert_called_once_with(visible=True)
    def test_close_does_not_spawn_browser(self):
        b=BrowserBridge()
        with patch.object(b,'owned_worker',return_value=None),patch.object(b,'start') as start:
            self.assertTrue(b.request('close')['ok']);start.assert_not_called()
    def test_close_existing_mode_without_relaunch(self):
        b=BrowserBridge()
        with patch.object(b,'owned_worker',return_value=object()),patch.object(b,'start') as start,patch.object(b,'exchange',return_value=dict(ok=True)) as exchange:
            self.assertTrue(b.request('close')['ok']);start.assert_not_called();exchange.assert_called_once()
    def test_windows_state_replace_retries(self):
        from core import atomic_json
        import os
        replace=os.replace
        for writer,module in [(atomic_json,'core'),(browser_atomic_json,'browser_worker')]:
            calls=[]
            def briefly_locked(src,dst):
                calls.append(1)
                if len(calls)==1:raise PermissionError('Windows reader lock')
                replace(src,dst)
            target=self.root/(module+'.json')
            with patch(module+'.os.replace',side_effect=briefly_locked),patch(module+'.time.sleep'):
                writer(target,dict(ok=True))
            self.assertEqual(read_json(target),dict(ok=True));self.assertEqual(len(calls),2)

if __name__=='__main__':
    (ROOT/'data').mkdir(exist_ok=True)
    unittest.main(verbosity=2)
