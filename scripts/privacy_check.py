"""Fail-closed source and payload gate. Runtime paths/records are never publishable."""
import argparse,hashlib,json,re,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SKIP={'node_modules','build','.git','__pycache__','.playwright-cli'}
BLOCKED={'config.json','homepage.json','appsettings.json','auth.json','snapshot.json','state.sqlite3','.env'}
RULES={
 'absolute_windows_path':re.compile(r'(?<![\w])(?:[A-Z]:\\|[A-Z]:/)[^\n\r\"\']+',re.I),
 'absolute_home_path':re.compile(r'/(?:Users|home)/[^\s/]+/'),
 'private_key':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 'github_token':re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})\b'),
 'api_key':re.compile(r'\bsk-[A-Za-z0-9_-]{24,}\b'),
 'cookie_value':re.compile(r'(?i)(?:sessionid|ttwid|sid_guard)\s*[=:]\s*[\"\']?[A-Za-z0-9_%.-]{16,}'),
 'non_synthetic_video_id':re.compile(r'(?<![\w])([2-9]\d{14,21})(?![\w])'),
}
def source_files():
    for p in ROOT.rglob('*'):
        if p.is_file() and not any(part in SKIP for part in p.relative_to(ROOT).parts):yield p
def inspect(files,base=ROOT):
    problems=[]
    for p in files:
        rel=str(p.relative_to(base))
        if p.name.lower() in BLOCKED or p.suffix.lower() in {'.db','.sqlite3','.jsonl','.log','.pem','.key','.pfx'}:
            problems.append((rel,'private_or_generated_file'));continue
        if p.suffix.lower() in {'.png','.ico'}:continue
        try:text=p.read_text(encoding='utf-8-sig')
        except UnicodeError:problems.append((rel,'unexpected_binary'));continue
        for name,rule in RULES.items():
            if rule.search(text):problems.append((rel,name))
        extra=os_extra_patterns()
        for pattern in extra:
            if pattern and pattern in text:problems.append((rel,'local_private_marker'))
    return problems
def os_extra_patterns():
    import os
    return os.environ.get('WORKDESK_PRIVATE_MARKERS','').split('|')
def main():
    p=argparse.ArgumentParser();p.add_argument('--tracked',action='store_true');p.add_argument('--payload',type=Path);p.add_argument('--own-source',type=Path)
    a=p.parse_args()
    if a.tracked:
        names=subprocess.check_output(['git','-C',str(ROOT),'ls-files','-z'],text=True).split('\0')
        files=[ROOT/x for x in names if x]
    else:files=list(source_files())
    problems=inspect(files)
    if a.own_source:
        own=list(f for f in a.own_source.rglob('*') if f.is_file())
        problems.extend(inspect(own,a.own_source))
        for f in own:
            rel=f.relative_to(a.own_source)
            if rel.as_posix()=='package.json':continue # Builder strips development-only fields.
            source=ROOT/rel
            if rel.parts[0] not in {'desktop','assets'} or not source.is_file() or hashlib.sha256(f.read_bytes()).digest()!=hashlib.sha256(source.read_bytes()).digest():
                problems.append((str(rel),'unexpected_desktop_payload'))
    if a.payload:
        # Runtime distributions are upstream binaries, not user profiles. Only
        # check our own backend/desktop/config area plus forbidden runtime names.
        forbidden={'auth.json','config.json','homepage.json','cookies.json','state.sqlite3','snapshot.json'}
        for f in a.payload.rglob('*'):
            if f.is_file() and f.name.lower() in forbidden:problems.append((f.name,'private_payload_file'))
            if f.is_file() and (f.suffix=='.pyc' or '.links' in f.parts):problems.append((f.name,'local_path_payload'))
        packages=a.payload/'resources/runtime/Lib/site-packages'
        if any(packages.glob('av*')):problems.append(('runtime/av','decoder_must_be_obtained_locally'))
        backend=a.payload/'resources/backend'
        if not backend.is_dir():problems.append(('resources/backend','missing_backend_payload'))
        else:
            own=list(f for f in backend.rglob('*') if f.is_file())
            problems.extend(inspect(own,backend))
            for f in own:
                source=ROOT/'backend'/f.relative_to(backend)
                if not source.is_file() or hashlib.sha256(f.read_bytes()).digest()!=hashlib.sha256(source.read_bytes()).digest():
                    problems.append((str(f.relative_to(backend)),'unexpected_backend_payload'))
    if problems:
        print(json.dumps(dict(ok=False,problems=problems),ensure_ascii=False,indent=2));sys.exit(1)
    print(json.dumps(dict(ok=True,source_files=len(files),payload_checked=bool(a.payload)),ensure_ascii=False))
if __name__=='__main__':main()
