"""Isolated shutdown/security tests; no real Service, DB, browser or model work."""
import json,re,socket,sys,threading,time,unittest
from unittest.mock import patch
from urllib.request import Request,urlopen
from urllib.error import HTTPError
sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parents[1]/'backend'))
import server

class FakeService:
    def __init__(self):
        self.stop=threading.Event();self.sync_lock=threading.Lock();self.auth_lock=threading.Lock()
        self.busy=None;self.store=self;self.bridge=self;self.closed=0
    def rows(self,query):
        return [{'id':'test'}] if self.busy and f"'{self.busy}'" in query else []
    def request(self,action,timeout):
        assert action=='close';self.closed+=1;return dict(ok=True)
    def action(self,name,data):return dict(ok=True)
    def snapshot(self):return dict(jobs=[])

class Tests(unittest.TestCase):
    def setUp(self):
        self.s=FakeService()
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));self.port=sock.getsockname()[1]
        self.origin=f'http://127.0.0.1:{self.port}'
        self.patch=patch.object(server,'Service',return_value=self.s);self.patch.start()
        self.old=sys.argv;sys.argv=['server.py','--port',str(self.port)]
        self.thread=threading.Thread(target=server.main,daemon=True);self.thread.start()
        for _ in range(100):
            try:
                with urlopen(self.origin,timeout=1) as r:page=r.read().decode()
                self.token=re.search(r'name="workbench-token" content="([^"]+)"',page)[1];break
            except OSError:time.sleep(.02)
        else:raise RuntimeError('fixture not ready')
    def post(self,headers=None):
        h={'X-Workbench-Token':self.token,'Origin':self.origin,'Content-Type':'application/json'};h.update(headers or {})
        req=Request(self.origin+'/api/shutdown',data=b'{}',headers=h)
        try:
            with urlopen(req,timeout=2) as r:return r.status,json.loads(r.read())
        except HTTPError as e:return e.code,json.loads(e.read())
    def tearDown(self):
        self.s.busy=None
        if self.s.sync_lock.locked():self.s.sync_lock.release()
        if self.s.auth_lock.locked():self.s.auth_lock.release()
        if not self.s.stop.is_set():self.post()
        self.thread.join(3);sys.argv=self.old;self.patch.stop()
    def test_queued_protected(self):
        self.s.busy='queued';self.assertEqual(self.post()[0],400);self.assertFalse(self.s.stop.is_set());self.assertEqual(self.s.closed,0)
    def test_running_protected(self):
        self.s.busy='running';self.assertEqual(self.post()[0],400);self.assertFalse(self.s.stop.is_set())
    def test_sync_protected(self):
        self.s.sync_lock.acquire();self.assertEqual(self.post()[0],400)
    def test_login_protected(self):
        self.s.auth_lock.acquire();self.assertEqual(self.post()[0],400)
    def test_invalid_token_rejected(self):self.assertEqual(self.post({'X-Workbench-Token':'bad'})[0],403)
    def test_foreign_origin_rejected(self):self.assertEqual(self.post({'Origin':'https://example.com'})[0],403)
    def test_idle_exit_closes_owned_bridge(self):
        self.assertEqual(self.post()[0],200);self.assertTrue(self.s.stop.is_set());self.assertEqual(self.s.closed,1)

if __name__=='__main__':unittest.main(verbosity=2)
