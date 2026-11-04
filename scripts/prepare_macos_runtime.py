"""Pinned, relocatable Apple Silicon runtime. Run only on a clean macOS arm64 checkout."""
import hashlib,json,os,platform,shutil,subprocess,sys,tarfile,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUILD=ROOT/'build';RUNTIME=BUILD/'runtime'
URL='https://github.com/astral-sh/python-build-standalone/releases/download/20261026/cpython-3.13.18%2B20261026-aarch64-apple-darwin-install_only.tar.gz'
SHA256='e5af2fde6a937a0e0c795a0c595c4efb70578d57463a2657c819992b9b9acbac'

def main():
    if sys.platform!='darwin' or platform.machine() not in ('arm64','aarch64'):
        raise SystemExit('Requires a macOS Apple Silicon host; cross-copying Windows binaries is not supported.')
    if RUNTIME.exists():raise SystemExit('Use a fresh build checkout: runtime already exists, not replacing it.')
    BUILD.mkdir(exist_ok=True);archive=BUILD/'mac-python.tar.gz'
    with urllib.request.urlopen(URL,timeout=120) as r,archive.open('wb') as out:shutil.copyfileobj(r,out)
    with archive.open('rb') as f:
        if hashlib.file_digest(f,'sha256').hexdigest()!=SHA256:raise RuntimeError('Standalone Python SHA256 mismatch')
    staging=BUILD/'mac-python-extract';staging.mkdir()
    with tarfile.open(archive) as tar:tar.extractall(staging,filter='data')
    (staging/'python').rename(RUNTIME)
    py=RUNTIME/'bin/python3'
    env=dict(os.environ,PYTHONDONTWRITEBYTECODE='1',PYTHONNOUSERSITE='1',
             PLAYWRIGHT_BROWSERS_PATH=str(RUNTIME/'browsers'),PIP_CACHE_DIR=str(BUILD/'pip-cache'))
    for name in ('PYTHONHOME','PYTHONPATH'):env.pop(name,None)
    subprocess.run([str(py),'-m','pip','install','--only-binary=:all:','--no-compile','-r',str(ROOT/'backend/requirements-lock.txt')],env=env,check=True)
    subprocess.run([str(py),'-m','playwright','install','chromium'],env=env,check=True)
    installed=subprocess.check_output([str(py),'-m','pip','freeze'],env=env,text=True)
    (RUNTIME/'DEPENDENCIES.txt').write_text(installed,encoding='utf-8')
    (RUNTIME/'BUILD_SOURCE.json').write_text(json.dumps(dict(source=URL,sha256=SHA256,arch='arm64',platform='darwin'),indent=2),encoding='utf-8')
    # No locally compiled bytecode paths in the payload. This is our fresh build tree only.
    for cache in RUNTIME.rglob('__pycache__'):
        if cache.is_dir() and cache.resolve().is_relative_to(RUNTIME.resolve()):shutil.rmtree(cache)
    archive.unlink();staging.rmdir()
    print('Prepared pinned macOS arm64 Python and Chromium; no account, model or private data copied.')

if __name__=='__main__':main()
