"""Obtain the decoder in the user's local environment, not in public binaries.

PyAV's public Windows wheel contains GPL-enabled FFmpeg. We do not redistribute
that wheel inside Workdesk's installer. The user installs the pinned upstream
wheel locally on first video use; image-only processing does not need it.
"""
import importlib.util,os,subprocess,threading
from runtime import ROOT,PYTHON
LOCK=threading.Lock()

def ensure_decoder(logfile):
    target=ROOT/'components'
    if importlib.util.find_spec('av'):return
    env=dict(os.environ,PYTHONPATH=str(target),PIP_CACHE_DIR=str(ROOT/'cache/pip'),PYTHONUTF8='1',PYTHONDONTWRITEBYTECODE='1')
    with LOCK:
        # A completed prior local install can be reused after process restart.
        probe=[str(PYTHON),'-c',"import av; assert av.__version__=='18.0.0'"]
        if subprocess.run(probe,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0).returncode==0:return
        target.mkdir(parents=True,exist_ok=True)
        with open(logfile,'a',encoding='utf-8') as log:
            subprocess.run([str(PYTHON),'-m','pip','--isolated','install','--disable-pip-version-check','--no-compile',
                '--only-binary=:all:','--no-deps','--index-url','https://pypi.org/simple','--target',str(target),'av==18.0.0'],
                env=env,stdout=log,stderr=log,timeout=600,check=True,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            subprocess.run(probe,env=env,stdout=log,stderr=log,timeout=30,check=True,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
