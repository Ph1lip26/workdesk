"""Assert that the actual packaged Mac executable boots its bundled backend."""
import json,os,re,subprocess,sys,time,urllib.request
from pathlib import Path

def main():
    if sys.platform!='darwin':raise SystemExit('Packaged Mac boot check requires macOS')
    root=Path(__file__).resolve().parents[1];home=root/'build/mac-packaged-boot'
    if home.exists():raise RuntimeError('Use a fresh synthetic boot directory')
    app=root/'build/dist-mac/mac-arm64/Workdesk.app';exe=app/'Contents/MacOS/Workdesk'
    assert exe.is_file();home.mkdir();vault=home/'synthetic-vault'
    for name in ('处理文件','原始资料'):(vault/name).mkdir(parents=True,exist_ok=True)
    (home/'config.json').write_text(json.dumps(dict(vault_path=str(vault))),encoding='utf-8')
    env=dict(os.environ,WORKDESK_HOME=str(home));env.pop('ELECTRON_RUN_AS_NODE',None)
    env.pop('WORKDESK_PYTHON',None);env.pop('WORKDESK_CONFIG',None)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));origin=None;headers=None
    with (home/'boot.log').open('w') as log:
        process=subprocess.Popen([str(exe)],env=env,stdout=log,stderr=log)
        try:
            for _ in range(150):
                assert process.poll() is None,'Packaged executable exited; inspect synthetic boot.log'
                try:
                    state=json.loads((home/'backend.json').read_text());origin=f"http://127.0.0.1:{int(state['port'])}"
                    with opener.open(origin+'/health',timeout=1) as r:health=json.load(r)
                    if health['instance']==state['instance'] and health['service']=='workdesk':break
                except (OSError,ValueError,KeyError):pass
                time.sleep(.2)
            else:raise RuntimeError('Actual packaged backend did not start')
            with opener.open(origin+'/',timeout=5) as r:page=r.read().decode('utf-8')
            token=re.search(r'name="workbench-token" content="([^"]+)"',page).group(1)
            headers={'Origin':origin,'X-Workbench-Token':token,'Content-Type':'application/json'}
            assert (home/'data/state.sqlite3').is_file()
            (home/'result.json').write_text(json.dumps(dict(ok=True,actual_packaged_executable=True)),encoding='utf-8')
            print('PASS actual packaged Mac executable and bundled Python backend')
        finally:
            try:
                if origin and headers:
                    request=urllib.request.Request(origin+'/api/shutdown',data=b'{}',headers=headers,method='POST')
                    with opener.open(request,timeout=15) as r:assert json.load(r)['ok']
            finally:
                if process.poll() is None:process.terminate();process.wait(timeout=15)

if __name__=='__main__':main()
