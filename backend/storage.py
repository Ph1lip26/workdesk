"""Shared JSON persistence; Windows readers can briefly lock the destination."""
import json,os,time
from pathlib import Path

def read_json(p,default=None):
    try:return json.loads(Path(p).read_text(encoding='utf-8-sig'))
    except (OSError,ValueError):return default

def atomic_json(p,v,*,indent=2):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True)
    temporary=p.with_suffix('.tmp')
    temporary.write_text(json.dumps(v,ensure_ascii=False,indent=indent),encoding='utf-8')
    for attempt in range(30):
        try:os.replace(temporary,p);return
        except PermissionError:
            if attempt==29:raise
            time.sleep(.05)
