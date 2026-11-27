import json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from core import corrected_transcript,Service,Store,ROOT,atomic_json,read_json

def edit(n,original,corrected):return dict(line_number=n,original=original,corrected=corrected)

class TranscriptEditsTests(unittest.TestCase):
    def test_empty_edits_preserve_all_lines_endings_and_silence(self):
        for raw in ('','\n','a\n\n','a\r\nb\r\n','[0:00:01] 原文\n[0:00:02] 末行'):
            self.assertEqual(corrected_transcript(raw,[]),raw)
    def test_only_anchored_lines_change_and_final_newline_is_retained(self):
        raw='[0:00:01] 派森。\r\n\r\n[0:00:02] 原样保留。\n[0:00:03] 卷积神经网落。'
        result=corrected_transcript(raw,[edit(4,'[0:00:03] 卷积神经网落。','[0:00:03] 卷积神经网络。'),edit(1,'[0:00:01] 派森。','[0:00:01] Python。')])
        self.assertEqual(result,'[0:00:01] Python。\r\n\r\n[0:00:02] 原样保留。\n[0:00:03] 卷积神经网络。')
    def test_bad_indices_duplicate_and_wrong_anchors_fail_closed(self):
        raw='[0:00:01] 原文\n';valid=edit(1,'[0:00:01] 原文','[0:00:01] 校正')
        for edits in ([valid,valid],[edit(True,valid['original'],valid['corrected'])],[edit(0,valid['original'],valid['corrected'])],
                      [edit(2,valid['original'],valid['corrected'])],[edit(1,'另一行',valid['corrected'])],{},[{}],['bad']):
            with self.subTest(edits=edits),self.assertRaises(RuntimeError):corrected_transcript(raw,edits)
    def test_cannot_delete_split_lines_alter_or_invent_timestamps(self):
        old='[0:00:01] 原文'
        for text in ('',' ','[0:00:01]','[0:00:02] 原文','原文','[0:00:01] 改\n新行','[0:00:01] 改\r新行','[0:00:01] 改\u2028新行','[0:00:01] 改\n'):
            with self.subTest(text=text),self.assertRaises(RuntimeError):corrected_transcript(old+'\n',[edit(1,old,text)])
        with self.assertRaises(RuntimeError):corrected_transcript('无时间戳\n',[edit(1,'无时间戳','[0:00:01] 无时间戳')])
        with self.assertRaises(RuntimeError):corrected_transcript('\n',[edit(1,'','补编内容')])
        with self.assertRaises(RuntimeError):corrected_transcript('',[edit(1,'','补编内容')])
    def test_long_transcript_retains_every_untouched_line(self):
        rows=[f'[0:{n//60:02}:{n%60:02}] 第{n}行不可遗漏。' for n in range(600)]
        raw='\n'.join(rows)+'\n';rows[327]=rows[327].replace('不可','不得')
        result=corrected_transcript(raw,[edit(328,raw.splitlines()[327],rows[327])])
        self.assertEqual(result,'\n'.join(rows)+'\n');self.assertEqual(len(result.splitlines()),600)

class TranscriptModelContractTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT/'data');self.root=Path(self.temp.name)
        self.vault=self.root/'vault';topic=self.vault/'处理文件/测试主题';topic.mkdir(parents=True)
        (topic/'_索引.md').write_text('# 索引',encoding='utf-8')
        self.media=self.root/'media';self.media.mkdir();self.run=self.root/'run';self.run.mkdir()
        atomic_json(self.media/'meta.json',dict(kind='video',duration=30,desc='合成测试'))
        atomic_json(self.media/'visual_frames.json',dict(frames=[],duration=30))
        self.raw='[0:00:01] 派森可复用。\n\n[0:00:02] 这一行保留。\n'
        (self.media/'transcript_raw.txt').write_text(self.raw,encoding='utf-8')
        with patch.object(Service,'import_local'),patch.object(Service,'refresh_notes'):
            self.service=Service(Store(self.root/'state.sqlite3'),self.vault,start_worker=False)
    def tearDown(self):self.temp.cleanup()
    def output(self,edits):
        return dict(title='合成校对示例',topic='处理文件/测试主题',needs_placement=False,transcript_corrections=edits,visual_review=dict(reason='none',timestamps=[]),
            visual_summary='合成图示',evidence=[dict(timestamp=1,kind='visual',content='图示')],uncertainties=[],note_markdown='完整合成知识笔记')
    def model(self,output):
        def command(args,logfile,**kw):
            schema=read_json(self.run/'schema.json');self.assertNotIn('transcript_clean',schema['properties']);self.assertIn('transcript_corrections',schema['required'])
            self.assertIn('不要回抄未改行',kw['stdin']);atomic_json(self.run/'analysis.json',output);Path(logfile).write_text('',encoding='utf-8')
        return command
    def test_sparse_response_becomes_full_legacy_result_and_verified_retries_reuse_it(self):
        output=self.output([edit(1,'[0:00:01] 派森可复用。','[0:00:01] Python可复用。')])
        with patch('core.discover_codex',return_value='codex'),patch.object(self.service,'run_command',side_effect=self.model(output)) as command:
            result=self.service.analyze('1000000000000000001',self.media,self.run)
            self.assertEqual(result['transcript_clean'],self.raw.replace('派森','Python'));self.assertNotIn('transcript_corrections',result)
            atomic_json(self.run/'verified-analysis.json',result)
            self.assertEqual(self.service.analyze('1000000000000000001',self.media,self.run),result);self.assertEqual(command.call_count,1)
        inputs=read_json(self.run/'input.json');self.assertNotIn('raw_transcript',inputs)
        self.assertEqual(inputs['transcript_lines'],[dict(line_number=n,text=s) for n,s in enumerate(self.raw.splitlines(),1)])
        self.assertEqual((self.media/'transcript_raw.txt').read_text(encoding='utf-8'),self.raw)
    def test_invalid_correction_is_not_verified_and_original_remains(self):
        with patch('core.discover_codex',return_value='codex'),patch.object(self.service,'run_command',side_effect=self.model(self.output([edit(1,'错误锚点','[0:00:01] 篡改')]))):
            with self.assertRaisesRegex(RuntimeError,'原文不匹配'):self.service.analyze('1000000000000000001',self.media,self.run)
        self.assertFalse((self.run/'verified-analysis.json').exists())
        self.assertEqual((self.media/'transcript_raw.txt').read_text(encoding='utf-8'),self.raw)
    def test_extra_frames_gate_review_and_keep_only_one_second_pass(self):
        for reason,model,effort in (('detail','gpt-6.2-sol','low'),('conflict','gpt-6.2-astra','medium'),
                                    ('sequence','gpt-6.2-astra','medium')):
            with self.subTest(reason=reason):
                first=self.output([]);first['visual_review']=dict(reason=reason,timestamps=[2,2,-1])
                revised=self.output([]);revised['note_markdown']='Revised using a full-size frame'
                def mock(args,logfile,**kw):
                    if Path(logfile).name=='review-frames.log':
                        extra=Path(args[args.index('--review-dir')+1]);self.assertEqual(args[-1:], [2])
                        atomic_json(extra/'frames.json',[2.1]);(extra/'frame_000.jpg').write_bytes(b'synthetic')
                    elif Path(logfile).name=='codex-review-events.jsonl':
                        self.assertEqual(args[args.index('--model')+1],model)
                        self.assertIn(f'model_reasoning_effort="{effort}"',args)
                        self.assertTrue(any(isinstance(x,Path) and x.name=='frame_000.jpg' and x.is_file() for x in args))
                        self.assertIn('2.1',kw['stdin']);atomic_json(args[args.index('--output-last-message')+1],revised)
                        Path(logfile).write_text('',encoding='utf-8')
                    else:self.model(first)(args,logfile,**kw)
                with patch('core.discover_codex',return_value='codex'),patch.object(self.service,'run_command',side_effect=mock) as cmd:
                    result=self.service.analyze('1000000000000000001',self.media,self.run)
                self.assertEqual(result['note_markdown'],revised['note_markdown'])
                self.assertNotIn('visual_review',result)
                self.assertEqual(cmd.call_count,3)
                self.assertEqual(read_json(self.run/'analysis-models.json')['final_model'],model)
                self.assertFalse(list(self.run.glob('review-frames-*')))

    def test_missing_extra_frames_does_not_spend_another_model_call(self):
        first=self.output([]);first['visual_review']=dict(reason='conflict',timestamps=[2])
        def command(args,logfile,**kw):
            if Path(logfile).name=='review-frames.log':raise RuntimeError('synthetic decoder error')
            self.model(first)(args,logfile,**kw)
        with patch('core.discover_codex',return_value='codex'),patch.object(self.service,'run_command',side_effect=command) as cmd:
            result=self.service.analyze('1000000000000000001',self.media,self.run)
        self.assertEqual(cmd.call_count,2)
        self.assertTrue(result['uncertainties'])
        self.assertEqual(read_json(self.run/'analysis-models.json')['review_status'],'no_extra_frames')

    def test_zero_edits_return_the_complete_original_transcript(self):
        with patch('core.discover_codex',return_value='codex'),patch.object(self.service,'run_command',side_effect=self.model(self.output([]))):
            self.assertEqual(self.service.analyze('1000000000000000001',self.media,self.run)['transcript_clean'],self.raw)

if __name__=='__main__':unittest.main()
