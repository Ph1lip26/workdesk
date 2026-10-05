"""Platform-neutral paths. User configuration never belongs in the source tree."""
import json, os, shutil, sys
from pathlib import Path

BUNDLE = Path(__file__).resolve().parent
default_home = Path(os.environ.get('APPDATA', Path.home()/'.local/share'))/'Workdesk'
ROOT = Path(os.environ.get('WORKDESK_HOME', default_home)).resolve()
CONFIG_PATH = Path(os.environ.get('WORKDESK_CONFIG', ROOT/'config.json'))
try:
    CONFIG = json.loads(CONFIG_PATH.read_text(encoding='utf-8-sig'))
except (OSError, ValueError):
    CONFIG = {}
VAULT = Path(CONFIG.get('vault_path') or ROOT/'unconfigured-vault').resolve()
MEDIA = Path(CONFIG.get('media_path') or ROOT/'media').resolve()
PRIVATE = ROOT/'private'
PYTHON = Path(sys.executable)
SCRIPTS = BUNDLE/'pipeline'
OBSIDIAN = Path(CONFIG.get('obsidian_path') or shutil.which('obsidian') or 'obsidian')
for folder in (ROOT/'data', MEDIA, PRIVATE):
    folder.mkdir(parents=True, exist_ok=True)
os.environ['WORKDESK_HOME'] = str(ROOT)
os.environ['WORKDESK_CONFIG'] = str(CONFIG_PATH)
os.environ['PYTHONUTF8'] = '1'
os.environ['PYTHONPATH'] = str(ROOT/'components')
os.environ['HF_HOME'] = str(ROOT/'cache/huggingface')
if CONFIG.get('hf_endpoint'):
    os.environ['HF_ENDPOINT'] = CONFIG['hf_endpoint']
