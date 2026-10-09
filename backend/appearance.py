"""Validated private appearance preference. No OS settings are changed."""
import json
import os
import uuid
from pathlib import Path

MODES = ('day', 'night', 'system')


def read_mode(root):
    try:
        data = json.loads((Path(root)/'appearance.json').read_text(encoding='utf-8-sig'))
        mode = data.get('mode') if isinstance(data, dict) else None
        return mode if mode in MODES else 'night'
    except (OSError, ValueError):
        return 'night'


def save_mode(root, mode):
    if not isinstance(mode, str) or mode not in MODES:
        raise ValueError('请选择白昼、黑夜或跟随系统')
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    target = root/'appearance.json'
    temporary = root/('appearance-'+uuid.uuid4().hex+'.tmp')
    try:
        temporary.write_text(json.dumps({'mode': mode}), encoding='utf-8')
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return {'ok': True, 'mode': mode}
