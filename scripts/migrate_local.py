"""Copy queue metadata into a new local home; credentials and media are never copied."""
import argparse,json,sqlite3
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('--source-home',type=Path,required=True);p.add_argument('--dest-home',type=Path,required=True)
    p.add_argument('--vault',type=Path,required=True);p.add_argument('--media',type=Path);p.add_argument('--codex',type=Path);p.add_argument('--obsidian',type=Path)
    a=p.parse_args()
    for item in (a.source_home,a.dest_home,a.vault,a.media,a.codex,a.obsidian):
        if item and not item.is_absolute():raise SystemExit('Use absolute local paths')
    source=a.source_home.resolve();dest=a.dest_home.resolve();vault=a.vault.resolve()
    if source==dest or dest.is_relative_to(vault):raise SystemExit('Destination must be a separate private runtime home')
    if a.media and a.media.resolve().is_relative_to(vault):raise SystemExit('Media must be outside the vault')
    database=source/'data/state.sqlite3'
    if not database.is_file():raise SystemExit('Source queue database is missing')
    target=dest/'data/state.sqlite3'
    if target.exists() or (dest/'config.json').exists():raise SystemExit('Destination already has data; nothing overwritten')
    if not (vault/'处理文件').is_dir() or not (vault/'原始资料').is_dir():raise SystemExit('Vault structure is missing')
    with sqlite3.connect(database.as_uri()+'?mode=ro',uri=True) as old:
        if old.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','running')").fetchone()[0]:raise SystemExit('Finish or cancel active source jobs before migration')
        target.parent.mkdir(parents=True,exist_ok=True)
        with sqlite3.connect(target) as new:
            old.backup(new)
            new.execute("INSERT OR REPLACE INTO settings VALUES('paused','1')")
            account=json.dumps({'logged_in':False,'needs_login':True,'message':'新电脑或新版首次使用，请在更多中扫码登录。'},ensure_ascii=False)
            new.execute("INSERT OR REPLACE INTO settings VALUES('account',?)",(account,))
    config={'vault_path':str(vault),'media_path':str(a.media.resolve()) if a.media else '',
        'codex_path':str(a.codex.resolve()) if a.codex else '', 'obsidian_path':str(a.obsidian.resolve()) if a.obsidian else ''}
    (dest/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Local queue copied. Original data unchanged. Login credentials were NOT copied; queue starts paused.')

if __name__=='__main__':main()
