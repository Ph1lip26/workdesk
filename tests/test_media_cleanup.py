import hashlib,json,os,sys,tempfile,threading,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from core import ROOT,Service,Store
from media_cleanup import cleanup_media
from storage import atomic_json,read_json

ID='1000000000000000001'


class MediaCleanupTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=ROOT/'data');self.root=Path(self.tmp.name)
        self.media=self.root/'media';self.folder=self.media/ID;self.folder.mkdir(parents=True)
        self.vault=self.root/'vault';self.topic=self.vault/'处理文件/测试';self.topic.mkdir(parents=True)
        self.raw=self.vault/'原始资料/已处理/测试原始.md';self.raw.parent.mkdir(parents=True)
        self.note=self.topic/'测试笔记.md';self.run=self.root/'run';self.run.mkdir()
        self.meta=dict(aweme_id=ID,kind='video',author='测试作者',desc='测试',duration=10)
        atomic_json(self.folder/'meta.json',self.meta)
        for name in ('video.mp4','video.part','visual_contact_sheet.jpg','visual_frames/frame_000.jpg','transcript_raw.txt','keep.bin'):
            path=self.folder/name;path.parent.mkdir(exist_ok=True);path.write_bytes(b'synthetic data')
        self.raw.write_text('source: https://www.douyin.com/video/'+ID,encoding='utf-8')
        self.note.write_text('source: https://www.douyin.com/video/'+ID,encoding='utf-8')
        (self.topic/'_索引.md').write_text('[[处理文件/测试/测试笔记.md]]',encoding='utf-8')
        (self.raw.parent/'_处理日志.md').write_text(f'<!-- douyin-workbench:{ID} -->',encoding='utf-8')
        self.proof()
    def tearDown(self):self.tmp.cleanup()
    def proof(self):
        atomic_json(self.run/'publish-journal.json',dict(note=self.note.relative_to(self.vault).as_posix(),raw=self.raw.relative_to(self.vault).as_posix(),
            note_sha256=hashlib.sha256(self.note.read_bytes()).hexdigest(),raw_sha256=hashlib.sha256(self.raw.read_bytes()).hexdigest()))
    def clean(self,**kw):return cleanup_media(self.media,self.vault,ID,self.run,self.note.relative_to(self.vault).as_posix(),['completed'],**kw)
    def test_success_only_removes_owned_heavy_files_and_is_idempotent(self):
        before=self.note.read_bytes(),self.raw.read_bytes();result=self.clean()
        self.assertEqual(set(result['deleted']),{'video.mp4','video.part','visual_contact_sheet.jpg','visual_frames/frame_000.jpg'})
        self.assertEqual(result['bytes'],4*len(b'synthetic data'))
        self.assertTrue((self.folder/'meta.json').exists());self.assertTrue((self.folder/'transcript_raw.txt').exists());self.assertTrue((self.folder/'keep.bin').exists())
        self.assertEqual((self.note.read_bytes(),self.raw.read_bytes()),before);self.assertEqual(self.clean()['deleted'],[])
    def test_dry_run_never_deletes(self):
        result=self.clean(dry_run=True);self.assertTrue(result['dry_run']);self.assertTrue((self.folder/'video.mp4').exists())
        self.assertEqual(result['bytes'],self.clean()['bytes'])
    def test_nonterminal_failed_and_cancelled_jobs_are_protected(self):
        for status in ('queued','running','failed','needs_review','cancelled'):
            with self.subTest(status=status),self.assertRaises(ValueError):cleanup_media(self.media,self.vault,ID,self.run,'处理文件/测试/测试笔记.md',['completed',status])
        self.assertTrue((self.folder/'video.mp4').exists())
    def test_missing_or_changed_publication_does_not_delete(self):
        self.note.write_text('changed',encoding='utf-8')
        with self.assertRaises(ValueError):self.clean()
        self.assertTrue((self.folder/'video.mp4').exists())
    def test_missing_hash_proof_is_not_inferred_from_completion(self):
        atomic_json(self.run/'publish-journal.json',dict(note='处理文件/测试/测试笔记.md',raw='原始资料/已处理/测试原始.md'))
        with self.assertRaises(ValueError):self.clean()
        self.assertTrue((self.folder/'video.mp4').exists())
    def test_missing_index_or_log_marker_preserves_media(self):
        for path in (self.topic/'_索引.md',self.raw.parent/'_处理日志.md'):
            original=path.read_bytes();path.write_text('',encoding='utf-8')
            with self.assertRaises(ValueError):self.clean()
            self.assertTrue((self.folder/'video.mp4').exists());path.write_bytes(original)
    def test_identity_and_journal_escape_are_rejected(self):
        meta=self.meta.copy();meta['aweme_id']='1000000000000000002';atomic_json(self.folder/'meta.json',meta)
        with self.assertRaises(ValueError):self.clean()
        atomic_json(self.folder/'meta.json',self.meta);journal=read_json(self.run/'publish-journal.json');journal['raw']='../outside.md';atomic_json(self.run/'publish-journal.json',journal)
        with self.assertRaises(ValueError):self.clean()
        self.assertTrue((self.folder/'video.mp4').exists())
    def test_media_inside_vault_cannot_be_cleaned(self):
        with self.assertRaises(ValueError):cleanup_media(self.vault,self.vault,ID,self.run,'处理文件/测试/测试笔记.md',['completed'])
    def test_other_note_file_uri_html_and_canvas_references_are_preserved(self):
        cases=[('[原视频]('+ (self.folder/'video.mp4').as_uri()+')','.md'),
               ('<video src="'+(self.folder/'video.mp4').as_uri()+'"></video>','.md'),
               (json.dumps({'nodes':[{'file':str(self.folder/'video.mp4')}]},ensure_ascii=True),'.canvas')]
        for text,suffix in cases:
            with self.subTest(suffix=suffix):
                other=self.topic/('引用'+suffix);other.write_text(text,encoding='utf-8');result=self.clean(dry_run=True)
                self.assertIn('video.mp4',result['protected']);self.assertNotIn('video.mp4',result['deleted']);other.unlink()
    def test_relative_markdown_and_wikilink_references_are_preserved(self):
        target=os.path.relpath(self.folder/'video.mp4',self.topic).replace('\\','/')
        for text in (f'[视频]({target})',f'![[{target}|视频]]'):
            other=self.topic/'引用.md';other.write_text(text,encoding='utf-8')
            self.assertIn('video.mp4',self.clean(dry_run=True)['protected'])
    def test_unreadable_note_aborts_before_any_deletion(self):
        (self.topic/'损坏.md').write_bytes(b'\xff\xfeinvalid')
        with self.assertRaises(UnicodeError):self.clean()
        self.assertTrue((self.folder/'video.mp4').exists())
    def test_ambiguous_relative_link_in_current_work_is_kept(self):
        self.note.write_text(self.note.read_text(encoding='utf-8')+'\n![画面](visual_frames/frame_000.jpg)',encoding='utf-8');self.proof()
        self.assertIn('visual_frames/frame_000.jpg',self.clean()['protected'])
    def test_publication_change_during_reference_scan_aborts_cleanup(self):
        def mutate(*args):
            self.note.write_text('changed concurrently',encoding='utf-8');return set()
        with patch('media_cleanup.referenced_files',side_effect=mutate),self.assertRaises(ValueError):self.clean()
        self.assertTrue((self.folder/'video.mp4').exists())
    def test_cache_changed_during_reference_scan_is_kept(self):
        def mutate(*args):
            (self.folder/'video.mp4').write_bytes(b'new media content');return set()
        with patch('media_cleanup.referenced_files',side_effect=mutate):result=self.clean()
        self.assertIn('video.mp4',result['protected']);self.assertEqual((self.folder/'video.mp4').read_bytes(),b'new media content')
    def images(self,external=False):
        from PIL import Image
        original=self.folder/'image_001.png';Image.new('RGB',(8,8),'white').save(original)
        sha=hashlib.sha256(original.read_bytes()).hexdigest()
        atomic_json(self.folder/'meta.json',dict(self.meta,kind='images',image_count=1))
        atomic_json(self.folder/'images.json',dict(count=1,images=[dict(image_number=1,file=original.name,sha256=sha)]))
        copy=self.raw.parent/f'抖音_{ID}_图01.png'
        if external:self.raw.write_text(self.raw.read_text(encoding='utf-8')+'\n[原图]('+original.as_uri()+')',encoding='utf-8')
        else:
            copy.write_bytes(original.read_bytes());self.raw.write_text(self.raw.read_text(encoding='utf-8')+'\n![[原始资料/已处理/'+copy.name+']]',encoding='utf-8')
        self.proof();return original,copy
    def test_image_duplicate_is_deleted_only_after_verified_embedded_copy(self):
        original,copy=self.images();before=copy.read_bytes();self.assertIn(original.name,self.clean()['deleted']);self.assertFalse(original.exists());self.assertEqual(copy.read_bytes(),before)
        self.assertTrue((self.folder/'images.json').exists())
    def test_external_originals_are_kept(self):
        original,_=self.images(external=True);self.assertIn(original.name,self.clean()['protected']);self.assertTrue(original.exists())
    def test_missing_or_damaged_copy_retains_original(self):
        original,copy=self.images();copy.write_bytes(b'damaged');self.assertIn(original.name,self.clean(dry_run=True)['protected'])
        copy.unlink();self.assertIn(original.name,self.clean()['protected']);self.assertTrue(original.exists())
    def test_symlink_is_not_followed(self):
        target=self.root/'outside.mp4';target.write_bytes(b'keep');file=self.folder/'video.mp4';file.unlink()
        try:file.symlink_to(target)
        except OSError:self.skipTest('Host cannot create a test symlink')
        with self.assertRaises(ValueError):self.clean()
        self.assertEqual(target.read_bytes(),b'keep')
    def test_file_in_use_is_reported_and_not_truncated(self):
        original=Path.unlink
        def unlink(p,*args,**kwargs):
            if p.name=='video.mp4':raise PermissionError('synthetic lock')
            return original(p,*args,**kwargs)
        with patch.object(Path,'unlink',unlink):result=self.clean()
        self.assertEqual(result['errors'],['video.mp4']);self.assertEqual((self.folder/'video.mp4').read_bytes(),b'synthetic data')
    def service(self):
        self.note.unlink();self.raw.unlink()
        with patch.object(Service,'import_local'),patch.object(Service,'refresh_notes'):
            service=Service(Store(self.root/'state.sqlite3'),self.vault,start_worker=False)
        service.store.upsert(dict(id=ID,title='测试视频',kind='video',duration=10));service.store.enqueue([ID]);return service
    def process(self,service,**patches):
        atomic_json(self.folder/'visual_frames.json',dict(frames=[]))
        result=dict(title='新笔记',topic='处理文件/测试',needs_placement=False,transcript_clean='转写',visual_summary='画面',note_markdown='# 新笔记\n内容',evidence=[dict(timestamp=1,kind='画面',content='合成证据')],uncertainties=[])
        result.update(patches)
        with patch('core.MEDIA',self.media),patch('core.ROOT',self.root),patch.object(service,'analyze',return_value=result):service.process_job(service.store.rows('SELECT * FROM jobs')[0])
    def test_real_completion_hooks_cleanup_after_publication(self):
        service=self.service();self.process(service);job=service.store.rows('SELECT * FROM jobs')[0]
        self.assertEqual(job['status'],'completed');self.assertTrue((self.vault/job['note']).is_file());self.assertFalse((self.folder/'video.mp4').exists())
        self.assertTrue((self.root/'data/jobs'/job['id']/'cleanup.json').exists());self.assertIn('已清理',job['message'])
    def test_cleanup_error_does_not_turn_published_job_into_failure(self):
        service=self.service()
        with patch('core.cleanup_media',side_effect=PermissionError('synthetic lock')):self.process(service)
        job=service.store.rows('SELECT * FROM jobs')[0];self.assertEqual(job['status'],'completed');self.assertTrue((self.folder/'video.mp4').exists());self.assertIn('清理未完成',job['message'])
    def test_placement_pending_does_not_trigger_cleanup(self):
        service=self.service();self.process(service,topic='',needs_placement=True)
        self.assertEqual(service.store.rows('SELECT status FROM jobs')[0]['status'],'needs_review');self.assertTrue((self.folder/'video.mp4').exists())


if __name__=='__main__':unittest.main()
