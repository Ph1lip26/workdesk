"""Obtain the decoder in the user's local environment, not in public binaries.

PyAV's public Windows wheel contains GPL-enabled FFmpeg. We do not redistribute
that wheel inside Workdesk's installer. The user installs the pinned upstream
wheel locally on first video use; image-only processing does not need it.
"""
import os,subprocess,threading,uuid
from runtime import ROOT,PYTHON,creation_flags
LOCK=threading.Lock()
VERSION='18.0.0'
LOADER_MARKER='# Workdesk managed decoder loader\n'

class DecoderUnavailable(RuntimeError):
    pass

def decoder_probe(target,env):
    # Explicit precedence protects against an unrelated/namespace av in cwd.
    code=("import sys; sys.path.insert(0,sys.argv[1]); import av; "
          "assert getattr(av,'__version__',None)==sys.argv[2], 'decoder version missing or mismatched'; "
          "assert callable(getattr(av,'open',None)) and av.library_versions, 'decoder API incomplete'; "
          "print('decoder validated: '+av.__version__)")
    return subprocess.run([str(PYTHON),'-c',code,str(target),VERSION],env=env,cwd=ROOT,
        capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30,
        creationflags=creation_flags())

def ensure_decoder(logfile):
    target=ROOT/'components'
    env=dict(os.environ,PYTHONPATH=str(target),PIP_CACHE_DIR=str(ROOT/'cache/pip'),PYTHONUTF8='1',PYTHONDONTWRITEBYTECODE='1')
    with LOCK:
        # find_spec alone accepts incomplete namespace packages, not a decoder.
        try:
            probe=decoder_probe(target,env)
            if probe.returncode==0:return
            target.mkdir(parents=True,exist_ok=True)
            with open(logfile,'a',encoding='utf-8') as log:
                log.write('\nDecoder preflight failed; installing into a fresh local component directory.\n')
                log.write((probe.stdout+probe.stderr)[-6000:]);log.flush()
                # Never replace a loaded or unreadable package in place on Windows.
                fresh=target/('decoder-av-'+VERSION+'-'+uuid.uuid4().hex)
                subprocess.run([str(PYTHON),'-m','pip','--isolated','install','--disable-pip-version-check','--no-compile',
                    '--only-binary=:all:','--no-deps','--index-url','https://pypi.org/simple','--target',str(fresh),'av=='+VERSION],
                    env=env,cwd=ROOT,stdout=log,stderr=log,timeout=600,check=True,
                    creationflags=creation_flags())
                probe=decoder_probe(fresh,env)
                log.write((probe.stdout+probe.stderr)[-6000:]);log.flush()
                if probe.returncode:raise DecoderUnavailable('视频解码组件修复后仍未通过检查；队列已暂停，请重试。详情在本机组件日志')
                loader=target/'av.py'
                if loader.exists() and not loader.read_text(encoding='utf-8').startswith(LOADER_MARKER):
                    raise DecoderUnavailable('本机存在非 Workdesk 管理的 av.py；组件未替换，队列已暂停。详情在本机组件日志')
                code=(LOADER_MARKER+"import importlib.util as _util, sys as _sys\nfrom pathlib import Path as _Path\n"
                    +"_package=_Path(__file__).parent/"+repr(fresh.name)+"/'av'\n"
                    +"_spec=_util.spec_from_file_location(__name__,_package/'__init__.py',submodule_search_locations=[str(_package)])\n"
                    +"_module=_util.module_from_spec(_spec)\n_sys.modules[__name__]=_module\n_spec.loader.exec_module(_module)\n")
                previous=loader.read_bytes() if loader.exists() else None
                pending=target/('av-'+uuid.uuid4().hex+'.tmp')
                pending.write_text(code,encoding='utf-8')
                os.replace(pending,loader)
                try:
                    probe=decoder_probe(target,env)
                    log.write((probe.stdout+probe.stderr)[-6000:]);log.flush()
                    if probe.returncode:raise DecoderUnavailable('视频解码组件切换后未通过检查；队列已暂停。详情在本机组件日志')
                except Exception:
                    if previous is None:loader.unlink()
                    else:
                        pending.write_bytes(previous);os.replace(pending,loader)
                    raise
        except (subprocess.SubprocessError,OSError) as error:
            raise DecoderUnavailable('视频解码组件安装或加载失败；队列已暂停，中间素材已保留。详情在本机组件日志') from error
