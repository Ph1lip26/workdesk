"""Synthetic native smoke fixture. Never reads the developer's vault or account."""
import json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
home=ROOT/'build/native-test';home.mkdir(parents=True,exist_ok=True)
os.environ['WORKDESK_HOME']=str(home)
sys.path.insert(0,str(ROOT/'backend'))
from core import Store
vault=home/'vault';topic=vault/'处理文件/测试主题';topic.mkdir(parents=True,exist_ok=True)
raw=vault/'原始资料/已处理';raw.mkdir(parents=True,exist_ok=True)
(topic/'_索引.md').write_text('# 测试主题\n',encoding='utf-8')
first='1000000000000000001'
(topic/'测试笔记.md').write_text(f'---\nsource: "https://www.douyin.com/video/{first}"\n---\n# 测试笔记',encoding='utf-8')
db=Store(home/'data/state.sqlite3')
db.execute('DELETE FROM jobs');db.execute('DELETE FROM videos');db.execute('DELETE FROM folders');db.execute('DELETE FROM membership')
for n in range(65):
    vid=str(int(first)+n);db.upsert(dict(id=vid,title=f'测试作品 {n+1}',author='测试作者'),favorite=True)
    db.execute('UPDATE videos SET favorite_position=? WHERE id=?',(n,vid))
db.execute('INSERT INTO folders VALUES(?,?)',('fixture-folder','测试收藏夹'))
db.execute('INSERT INTO membership VALUES(?,?,?)',('fixture-folder',first,0))
db.set_setting('paused','1')
(home/'config.json').write_text(json.dumps({'vault_path':str(vault),'codex_path':'','obsidian_path':''},ensure_ascii=False),encoding='utf-8')
print('Synthetic fixture ready: 65 works, one existing note. No private input.')

# Generic homepage records exercise bindings without copying personal facts.
import datetime
day=datetime.date.today()
plan=topic/'测试安排.md'
rows='\n'.join(f'| {(day+datetime.timedelta(days=n)).month}/{(day+datetime.timedelta(days=n)).day} | 计划 | 练习 | 合成安排 {n+1} | '+('新日期待确认，未收到完成反馈' if n==0 else '原计划，未实施')+' |' for n in range(7))
plan.write_text(f'---\nupdated: {day}\nstatus: 早期规划\n---\n# 测试安排\n## 当前状态\n最新实报截至{day:%m-%d}\n| 项目 | 状态 |\n| 项目甲 | 准备完成、未验收 |\n## 每日计划\n| 日期 | 星期 | 类型 | 安排 | 记录 |\n|---|---|---|---|---|\n{rows}\n',encoding='utf-8')
sources=[dict(id='current',path='处理文件/测试主题/测试安排.md',heading='当前状态',title='测试状态'),dict(id='plan',path='处理文件/测试主题/测试安排.md',heading='每日计划',title='测试安排')]
data=dict(schema=1,primary_source='current',stage=dict(title='测试阶段',subtitle='合成首页，不包含个人资料',focus='核验资料与安排的关系',source='current'),sources=sources,
          stages=[dict(id=f'stage{n}',title=title,status='当前' if n==0 else '未来阶段',summary='合成阶段说明',source='current') for n,title in enumerate(['阶段一','阶段二','阶段三','阶段四'])],
          plans=[dict(source='plan',year=day.year,title='测试安排')],
          projects=[dict(id=f'project{n}',title=f'合成项目 {n+1}',status='进行中' if n<2 else '早期规划',summary='未验收，不将计划当作完成。',source='current') for n in range(5)],
          waiting=[dict(id='waiting1',title='日期需要确认',summary='尚未确定新日期',status='待确认',source='plan',contains='待确认')],
          links=[dict(id='link1',title='测试资料',source='current')])
data['overview']=[dict(id=f'subject{n}',title=f'科目 {n+1}',source='current',table_key='项目甲',status='当前记录') for n in range(4)]
for n,project in enumerate(data['projects']):
    project['deferred']=n>=2
    project['attention']=n==1
(home/'homepage.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
