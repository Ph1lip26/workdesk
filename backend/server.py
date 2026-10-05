"""Local-only UI and durable queue. No external inbound access or arbitrary file API."""
import argparse, hmac, json, mimetypes, os, secrets, sys, threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,parse_qs,quote
from core import Service, ROOT, BUNDLE

def main():
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8767);a=p.parse_args()
    service=Service();token=secrets.token_urlsafe(32);host=f'127.0.0.1:{a.port}';origin=f'http://{host}';service.origin=origin;command_lock=threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def send(self,status,body,kind='application/json; charset=utf-8'):
            if isinstance(body,(dict,list)):body=json.dumps(body,ensure_ascii=False).encode('utf-8')
            elif isinstance(body,str):body=body.encode('utf-8')
            self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer');self.send_header('X-Frame-Options','DENY');self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");self.end_headers();self.wfile.write(body)
        def allowed(self,api=False):
            if self.headers.get('Host')!=host:return False
            if self.headers.get('Origin') not in (None,origin):return False
            return not api or hmac.compare_digest(self.headers.get('X-Workbench-Token',''),token)
        def do_GET(self):
            path=urlparse(self.path).path
            if not self.allowed(path.startswith('/api/')):self.send(403,dict(error='仅允许本机工作台访问'));return
            if path=='/':
                page=(BUNDLE/'static/index.html').read_text(encoding='utf-8').replace('__TOKEN__',token)
                self.send(200,page,'text/html; charset=utf-8')
            elif path=='/health':self.send(200,dict(ok=True,service='workdesk',instance=os.environ.get('WORKDESK_INSTANCE','')))
            elif path=='/favicon.ico':self.send(204,b'','image/x-icon')
            elif path=='/api/state':self.send(200,service.snapshot())
            elif path=='/api/preview':
                jid=parse_qs(urlparse(self.path).query).get('id',[''])[0];rows=service.store.rows('SELECT result FROM jobs WHERE id=?',(jid,));self.send(200,json.loads(rows[0]['result']) if rows and rows[0]['result'] else {})
            elif path in ('/app.js','/style.css'):
                self.send(200,(BUNDLE/'static'/path[1:]).read_bytes(),'text/javascript; charset=utf-8' if path.endswith('.js') else 'text/css; charset=utf-8')
            else:self.send(404,dict(error='不存在'))
        def do_POST(self):
            if not self.allowed(True):self.send(403,dict(error='访问被拒绝'));return
            try:length=int(self.headers.get('Content-Length','0'))
            except ValueError:self.send(400,dict(error='请求长度无效'));return
            if not 0<length<=100000:self.send(413,dict(error='请求过大或为空'));return
            try:
                data=json.loads(self.rfile.read(length));name=urlparse(self.path).path.removeprefix('/api/')
                if not isinstance(data,dict):raise ValueError('请求格式错误')
                with command_lock:
                    if service.stop.is_set():raise ValueError('工作台正在退出，请重新打开后操作')
                    if name=='shutdown':
                        if service.store.rows("SELECT id FROM jobs WHERE status IN ('queued','running')") or service.sync_lock.locked() or service.auth_lock.locked():raise ValueError('有排队任务、处理任务、同步或登录检查，不能关闭')
                        # Close only the exact owned login worker, preserving its profile.
                        result=service.bridge.request('close',timeout=20)
                        if not result.get('ok'):raise RuntimeError('后台登录连接尚未关闭；未强制终止进程，请重试')
                        service.stop.set();self.send(200,dict(ok=True));threading.Thread(target=server.shutdown,daemon=True).start();return
                    self.send(200,service.action(name,data))
            except (ValueError,RuntimeError) as e:self.send(400,dict(error=str(e)))
            except Exception:self.send(500,dict(error='本机处理异常；已有数据保留，请检查任务日志'))
    server=ThreadingHTTPServer(('127.0.0.1',a.port),Handler)
    print(json.dumps(dict(service='workdesk',origin=origin),ensure_ascii=False),flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:service.stop.set();server.server_close()

if __name__=='__main__':main()
