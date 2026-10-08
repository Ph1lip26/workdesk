import datetime as dt
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from home import Homepage,section,plain,table_rows
from runtime import ROOT


class HomepageTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=ROOT/'data')
        self.root=Path(self.tmp.name);self.vault=self.root/'vault'
        self.folder=self.vault/'处理文件/测试主题';self.folder.mkdir(parents=True)
        self.note=self.folder/'安排.md';self.day=dt.date(2026,10,7)
        self.note.write_text('---\nupdated: 2026-10-07\nstatus: 早期规划\n---\n## 当前状态\n最新实报截至10-06\n| 项 | 状态 |\n| 科目 | 内容已准备，待作答 |\n## 每日计划\n| 日期 | 星期 | 类型 | 安排 | 状态 |\n|---|---|---|---|---|\n| 10/7 | 三 | 练习 | 原错题复习 | 新日期待确认，未收到完成反馈 |\n| 10/8 | 四 | 练习 | 补漏 | 原计划 |\n## 历史\n| 10/7 | 三 | 旧计划 | 已失效 | 已完成 |',encoding='utf-8')
        self.config=dict(schema=1,primary_source='state',sources=[dict(id='state',path='处理文件/测试主题/安排.md',heading='当前状态'),dict(id='plan',path='处理文件/测试主题/安排.md',heading='每日计划')],stage=dict(title='当前阶段',source='state'),stages=[],plans=[dict(source='plan',year=2026,title='数学')],projects=[dict(id='p',title='项目',source='state',table_key='科目')],waiting=[dict(id='w',title='等待作答',source='state',contains='待作答')],links=[])
        self.save();self.home=Homepage(self.vault,self.root)
    def tearDown(self):self.tmp.cleanup()
    def save(self):(self.root/'homepage.json').write_text(json.dumps(self.config),encoding='utf-8')
    def test_no_binding_is_empty_not_mock(self):
        (self.root/'homepage.json').unlink();self.assertFalse(self.home.snapshot(self.day)['configured'])
    def test_only_current_heading_not_historical_schedule(self):
        out=self.home.snapshot(self.day);self.assertEqual(len(out['actions']),1);self.assertEqual(out['actions'][0]['title'],'原错题复习');self.assertEqual(len(out['schedule']),2)
    def test_uncertain_not_inferred_done_or_overdue(self):
        self.assertEqual(self.home.snapshot(self.day)['actions'][0]['status'],'待确认')
        self.assertEqual(self.home.snapshot(self.day)['schedule'][1]['status'],'原计划')
    def test_updated_is_not_reported(self):
        out=self.home.snapshot(self.day);self.assertEqual(out['reported_until'],'2026-10-06');self.assertEqual(out['sources'][0]['updated'],'2026-10-07')
    def test_source_body_is_not_returned(self):
        out=self.home.snapshot(self.day);self.assertNotIn('历史',json.dumps(out,ensure_ascii=False));self.assertNotIn('path',out['sources'][0])
    def test_read_only_and_cache(self):
        before=self.note.read_bytes();first=self.home.snapshot(self.day);self.assertIs(first,self.home.snapshot(self.day));self.assertEqual(before,self.note.read_bytes())
    def test_change_in_source_invalidates_cache_and_resolves_waiting(self):
        self.home.snapshot(self.day);self.note.write_text(self.note.read_text(encoding='utf-8').replace('待作答','已完成'),encoding='utf-8');self.assertEqual(self.home.snapshot(self.day)['waiting'],[])
    def test_missing_heading_fails_closed(self):
        self.config['sources'][0]['heading']='不存在';self.save();out=self.home.snapshot(self.day);self.assertFalse(out['sources'][0]['available']);self.assertEqual(out['projects'][0]['status'],'待核对')
    def test_source_escape_absolute_and_original_rejected(self):
        for path in ('../secret.md',str(self.note.resolve()),'原始资料/private.md'):
            with self.assertRaises(ValueError):self.home.path(path)
    def test_reference_only_selected_ids(self):
        self.assertEqual(self.home.reference('state'),'处理文件/测试主题/安排.md')
        with self.assertRaises(ValueError):self.home.reference('../secret.md')
    def test_output_note_can_be_explicitly_selected(self):
        path=self.vault/'输出文件/测试.md';path.parent.mkdir();path.write_text('test',encoding='utf-8');self.config['sources'].append(dict(id='output',path='输出文件/测试.md'));self.save();self.assertEqual(self.home.reference('output'),'输出文件/测试.md')
    def test_missing_source_is_unavailable(self):
        self.note.unlink();out=self.home.snapshot(self.day);self.assertFalse(out['sources'][0]['available']);self.assertEqual(out['actions'],[])
    def test_date_boundary_does_not_activate_past_plan(self):
        self.assertEqual(self.home.snapshot(dt.date(2026,10,9))['actions'],[])
    def test_nested_heading_boundary_and_wikilink_plain_text(self):
        self.assertEqual(section('## A\nfirst\n### Sub\nsecond\n## B\nold','A'),'first\n### Sub\nsecond')
        self.assertEqual(plain('**[[folder/note|显示名]]**'),'显示名')
    def test_wikilink_alias_pipe_is_not_a_table_boundary(self):
        self.assertEqual(list(table_rows('| A | [[folder/note|显示名]] | 末列 |')),[['A','显示名','末列']])
    def test_invalid_binding_shape_and_duplicate_sources_fail_closed(self):
        self.config['sources']=[self.config['sources'][0],self.config['sources'][0]];self.save();self.assertFalse(self.home.snapshot(self.day)['configured'])
        self.config['sources']='invalid';self.save();self.assertFalse(self.home.snapshot(self.day)['configured'])
    def test_current_overview_is_live_and_selected_only(self):
        self.config['overview']=[dict(id='subject',title='科目',source='state',table_key='科目')];self.save()
        out=self.home.snapshot(self.day);self.assertEqual(out['overview'][0]['summary'],'内容已准备，待作答')
        self.note.write_text(self.note.read_text(encoding='utf-8').replace('待作答','已作答，结果待验收'),encoding='utf-8')
        self.assertIn('结果待验收',self.home.snapshot(self.day)['overview'][0]['summary'])
    def test_deferred_and_attention_are_explicit_flags_not_inferred(self):
        self.config['projects'][0].update(deferred=True,attention=False);self.config['waiting'][0]['attention']='true';self.save()
        out=self.home.snapshot(self.day);self.assertTrue(out['projects'][0]['deferred']);self.assertFalse(out['waiting'][0]['attention'])
    def test_overview_source_missing_is_not_fake_status(self):
        self.config['overview']=[dict(id='s',title='科目',source='missing',table_key='科目')];self.save()
        out=self.home.snapshot(self.day)['overview'][0];self.assertFalse(out['available']);self.assertEqual(out['status'],'待核对')
