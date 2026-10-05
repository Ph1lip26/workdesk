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
