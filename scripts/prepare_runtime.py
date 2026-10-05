"""Build an anonymous Windows runtime, never copy the developer's environment."""
import base64,hashlib,json,os,shutil,subprocess,sys,urllib.request,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BUILD=ROOT/'build';RUNTIME=BUILD/'runtime'
VERSION='3.13.16'

def download(url,target):
    print('Downloading',target.name,flush=True)
    if os.name=='nt':
        env=dict(os.environ,WORKDESK_DOWNLOAD_URL=url,WORKDESK_DOWNLOAD_FILE=str(target.resolve()))
        # PowerShell uses the Windows TLS/proxy stack; no certificate bypass.
        subprocess.run(['pwsh','-NoProfile','-Command',
            "$ErrorActionPreference='Stop'; Invoke-WebRequest -Uri $env:WORKDESK_DOWNLOAD_URL -OutFile $env:WORKDESK_DOWNLOAD_FILE -TimeoutSec 300"],env=env,check=True)
    else:
        with urllib.request.urlopen(url,timeout=90) as response,target.open('wb') as f:shutil.copyfileobj(response,f)

def metadata(url):
    target=BUILD/'python-metadata.json'
    if not target.exists():download(url,target)
    entry=json.loads(target.read_text(encoding='utf-8-sig'))
    if isinstance(entry.get('catalogEntry'),str):
        download(entry['catalogEntry'],target)
        entry=json.loads(target.read_text(encoding='utf-8-sig'))
    if entry.get('packageHashAlgorithm')!='SHA512':raise RuntimeError('Official package hash is unavailable')
    return entry

def main():
    if os.name!='nt':raise SystemExit('This release runtime recipe targets Windows x64; macOS build is future work.')
    BUILD.mkdir(exist_ok=True);RUNTIME.mkdir(exist_ok=True)
    if not (RUNTIME/'python.exe').exists():
        package=BUILD/'python.nupkg';url=f'https://api.nuget.org/v3-flatcontainer/python/{VERSION}/python.{VERSION}.nupkg'
        if not package.exists():download(url,package)
        info=metadata(f'https://api.nuget.org/v3/registration5-semver1/python/{VERSION}.json')
        expected=base64.b64decode(info['packageHash'])
        if hashlib.sha512(package.read_bytes()).digest()!=expected:raise RuntimeError('Python package SHA512 mismatch')
        with zipfile.ZipFile(package) as z:
            for info in z.infolist():
                if not info.filename.startswith('tools/'):continue
                relative=Path(info.filename[len('tools/'):])
                if not relative.parts or '..' in relative.parts:continue
                dest=RUNTIME/relative
                if info.is_dir():dest.mkdir(parents=True,exist_ok=True)
                else:dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(info))
        package.unlink()
    py=RUNTIME/'python.exe'
    env=dict(os.environ,PYTHONUTF8='1',PYTHONIOENCODING='utf-8',PLAYWRIGHT_BROWSERS_PATH=str(RUNTIME/'browsers'),
             PIP_CACHE_DIR=str(BUILD/'pip-cache'),HF_HOME=str(BUILD/'model-cache'))
    subprocess.run([str(py),'-m','ensurepip','--upgrade'],env=env,check=True)
    requirements=ROOT/'backend/requirements-lock.txt'
    if not requirements.exists():requirements=ROOT/'backend/requirements.txt'
    subprocess.run([str(py),'-m','pip','install','--disable-pip-version-check','--no-compile','-r',str(requirements)],env=env,check=True)
    subprocess.run([str(py),'-m','playwright','install','chromium'],env=env,check=True)
    installed=subprocess.check_output([str(py),'-m','pip','freeze'],env=env,text=True,encoding='utf-8')
    (RUNTIME/'DEPENDENCIES.txt').write_text(installed,encoding='utf-8')
    # Bytecode from local install paths is not part of the release payload.
    for cache in RUNTIME.rglob('__pycache__'):
        if cache.is_dir() and cache.resolve().is_relative_to(RUNTIME.resolve()):shutil.rmtree(cache)
    (RUNTIME/'BUILD_SOURCE.json').write_text(json.dumps(dict(python_version=VERSION,
        source=f'https://api.nuget.org/v3-flatcontainer/python/{VERSION}/python.{VERSION}.nupkg',
        built_from='official-python-package-and-public-wheel-distributions'),indent=2),encoding='utf-8')
    print('Clean runtime ready. No model weights or private profiles bundled.',flush=True)

if __name__=='__main__':main()
