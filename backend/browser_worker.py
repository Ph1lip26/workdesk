"""Read-only Douyin browser bridge. Auth stays outside the vault and project."""
import json, os, re, sys, time, traceback
from pathlib import Path
from urllib.parse import urlparse, parse_qs

def atomic_json(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp'); tmp.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    # Windows readers briefly hold destination handles without delete sharing.
    for attempt in range(30):
        try:os.replace(tmp,path);return
        except PermissionError:
            if attempt==29:raise
            time.sleep(.05)

def walk(value):
    if isinstance(value, dict):
        yield value
        for v in value.values(): yield from walk(v)
    elif isinstance(value, list):
        for v in value: yield from walk(v)

def login_required_text(text):
    # A generic "登录" button/footer is not proof that authentication expired.
    return any(marker in text for marker in ('未登录','登录后即可观看喜欢、收藏的视频'))

def login_prompt(page):
    try:return login_required_text(page.locator('body').inner_text(timeout=3000))
    except Exception:return False

def retry_collection_scroll(page):
    """Recover a stalled rendered list; never manufacture collection API calls."""
    page.evaluate("""() => {
        const candidates=[...document.querySelectorAll('main,section,div')].filter(el=>{
            const r=el.getBoundingClientRect(),s=getComputedStyle(el);
            return r.width>400 && r.height>200 && r.bottom>0 && r.top<innerHeight &&
                el.scrollHeight>el.clientHeight+100 && /auto|scroll/.test(s.overflowY);
        });
        const target=candidates.sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight)[0] || document.scrollingElement;
        if(target)target.scrollTop=Math.max(0,target.scrollHeight-target.clientHeight-200);
    }""")
    page.mouse.wheel(0,1200)

def wait_until(page, predicate, timeout_ms=1800):
    """Pump Playwright events until actual collection evidence arrives."""
    elapsed=0
    while not predicate() and elapsed<timeout_ms:
        step=min(100,timeout_ms-elapsed);page.wait_for_timeout(step);elapsed+=step
    return bool(predicate())

def normalize_video(a):
    vid = str(a.get('aweme_id') or '')
    if not re.fullmatch(r'\d{15,22}', vid): return None
    v = a.get('video') or {}; cover = v.get('cover') or a.get('cover') or {}
    return dict(id=vid, title=(a.get('desc') or '未命名视频')[:1000], author=(a.get('author') or {}).get('nickname','未知作者'),
                duration=(v.get('duration') or 0)/1000, cover=(cover.get('url_list') or [''])[0],
                url=f'https://www.douyin.com/video/{vid}', kind='images' if a.get('images') else 'video',
                published_at=int(a.get('create_time') or 0))

def extract_response(data, url):
    """Only called for collection responses; never imports recommended feeds."""
    videos = {}; folders = {}; membership = []
    q = parse_qs(urlparse(url).query)
    fid = str((q.get('collects_id') or q.get('collection_id') or [''])[0])
    for a in walk(data):
        item = normalize_video(a)
        if item:
            videos[item['id']] = item
            if fid: membership.append((fid,item['id']))
        f = a.get('collects_id') or a.get('collection_id')
        name = a.get('collects_name') or a.get('collection_name') or (a.get('name') if f else None)
        if f and name: folders[str(f)] = dict(id=str(f),name=str(name)[:200])
    return list(videos.values()),list(folders.values()),membership

def main():
    from playwright.sync_api import sync_playwright
    private = Path(sys.argv[1]); inbox = private/'inbox'; inbox.mkdir(parents=True,exist_ok=True)
    visible='--visible' in sys.argv;context_closed=False
    ctx=None; page=None; videos={};folders={};membership={};favorite_order={};pagination={};responses=0;active=False;diagnostics=[];folder_pages={}
    def state(**kw): atomic_json(private/'browser-state.json', dict(updated=time.time(),protocol=2,pid=os.getpid(),visible=visible,**kw))
    def capture(r):
        nonlocal responses
        if not active: return
        u=r.url; path=urlparse(u).path
        # /aweme/favorite/ is the user's LIKES, not saved collections. Ignore prefetches.
        if urlparse(u).hostname!='www.douyin.com' or not any(k in path for k in ('/aweme/listcollection/','/collects/list/','/collects/video/list/')): return
        try:
            d=r.json()
            if not isinstance(d,dict): return
            if d.get('status_code',0) not in (0,None): return
            vv,ff,mm=extract_response(d,u)
            diagnostics.append(dict(path=path,keys=list(d)[:18],videos=len(vv),folders=len(ff),has_more=d.get('has_more')))
            for a in vv: videos[a['id']]=a
            if '/aweme/listcollection/' in path:
                for a in vv:favorite_order.setdefault(a['id'],len(favorite_order))
            for a in ff: folders[a['id']]=a
            for pair in mm:membership.setdefault(pair,len(membership))
            responses+=1
            folder_list=('/collects/list' in path or '/collection/list' in path) and '/video/' not in path
            if folder_list:
                folder_pages[path]=dict(has_more=d.get('has_more'),count=len(ff))
            elif vv or 'aweme_list' in d:
                group=(parse_qs(urlparse(u).query).get('collects_id') or ['all'])[0]
                pagination[group]=dict(has_more=d.get('has_more'),count=len(vv),path=path,serial=responses)
        except Exception: pass
    with sync_playwright() as p:
        def on_closed():
            nonlocal context_closed,visible
            context_closed=True;visible=False
            state(status='closed',message='登录窗口已关闭，后续在后台复用登录状态')
        def ensure_page():
            nonlocal ctx,page,context_closed
            if ctx is None or context_closed:
                state(status='starting',message='后台连接初始化' if not visible else '扫码窗口初始化')
                ctx=p.chromium.launch_persistent_context(str(private/'profile'),headless=not visible,locale='zh-CN',viewport={'width':1250,'height':850},accept_downloads=False)
                page=None
                context_closed=False;ctx.on('close',on_closed)
            if page is None or page.is_closed():
                page=ctx.pages[0] if ctx.pages else ctx.new_page();page.on('response',capture)
        state(status='starting',message='后台连接初始化' if not visible else '扫码窗口初始化')
        ensure_page()
        if visible:
            try:page.goto('https://www.douyin.com/user/self?showTab=favorite_collection',wait_until='domcontentloaded',timeout=45000)
            except Exception:pass
            state(status='login_window',message='完成扫码后关闭窗口；刷新在后台进行')
        else:state(status='idle',message='后台连接就绪')
        while True:
            for cmdfile in sorted(inbox.glob('*.json')):
                cmd={}
                try:
                    cmd=json.loads(cmdfile.read_text(encoding='utf-8')); cmdfile.unlink()
                    if cmd.get('action')!='close':ensure_page()
                    if cmd.get('action')=='inspect':
                        text=page.locator('body').inner_text(timeout=5000)
                        page.screenshot(path=str(private/'browser-view.png'))
                        atomic_json(private/'results'/f"{cmd['id']}.json",dict(ok=True,text=text[:24000],url=page.url))
                    elif cmd.get('action')=='close':
                        try:ctx.close()
                        except Exception:pass
                        atomic_json(private/'results'/f"{cmd['id']}.json",dict(ok=True));state(status='closed',message='登录状态已保存，后台连接已关闭');return
                    elif cmd.get('action')=='check_login':
                        active=False;observed=[]
                        def auth_response(r):
                            if '/aweme/listcollection/' not in urlparse(r.url).path:return
                            try:
                                d=r.json()
                                if d.get('status_code',0)==0 and 'aweme_list' in d:observed.append(True)
                            except Exception:pass
                        page.on('response',auth_response)
                        try:
                            state(status='checking',message='后台检查登录')
                            page.goto('https://www.douyin.com/user/self?showTab=favorite_collection',wait_until='domcontentloaded',timeout=45000)
                            for _ in range(15):
                                if observed:break
                                page.wait_for_timeout(700)
                        finally:page.remove_listener('response',auth_response)
                        required=login_prompt(page);logged=bool(observed) and not required
                        result=dict(ok=True,logged_in=logged,needs_login=required,error_code='' if logged else 'login_required' if required else 'auth_unconfirmed',
                                    message='登录有效，无需扫码' if logged else '抖音尚未登录，请打开扫码窗口；旧收藏已保留' if required else '后台未能确认登录，可能是网络或页面验证；可重试检查')
                        atomic_json(private/'results'/f"{cmd['id']}.json",result)
                        state(status='ready' if logged else 'login_required',message=result['message'])
                    elif cmd.get('action')=='sync':
                        videos={};folders={};membership={};favorite_order={};pagination={};responses=0;active=True;diagnostics=[];folder_pages={}
                        started=time.time();deadline=started+480;folder_done=0
                        def progress(phase,message):
                            state(status='syncing',phase=phase,message=message,started=started,elapsed=round(time.time()-started,1),count=len(favorite_order),folder_count=len(folders),folder_done=folder_done)
                        progress('connecting','正在连接抖音收藏页')
                        page.goto('https://www.douyin.com/user/self?showTab=favorite_collection',wait_until='domcontentloaded',timeout=60000)
                        wait_until(page,lambda:bool(favorite_order) or login_prompt(page),timeout_ms=4000)
                        if not favorite_order and login_prompt(page):
                            active=False
                            result=dict(ok=False,error_code='login_required',needs_login=True,message='抖音尚未登录，请扫码登录后刷新；旧收藏已保留',
                                        videos=[],folders=[],membership=[],favorite_order=[],complete=False,folders_complete=False)
                            atomic_json(private/'results'/f"{cmd['id']}.json",result)
                            state(status='login_required',message=result['message']);continue
                        # Use rendered UI, never synthesize signed private API requests.
                        for label in (() if favorite_order else ('收藏','收藏作品')):
                            loc=page.get_by_text(label,exact=True)
                            if loc.count():
                                try: loc.first.click(timeout=4000);wait_until(page,lambda:bool(favorite_order),2500);break
                                except Exception: pass
                        video_tab=page.get_by_text('视频',exact=True)
                        for i in range(0 if favorite_order else video_tab.count()):
                            if video_tab.nth(i).is_visible():
                                try:video_tab.nth(i).click(timeout=4000);wait_until(page,lambda:bool(favorite_order),2000);break
                                except Exception:pass
                        idle=0; previous=-1
                        for _ in range(min(int(cmd.get('max_scrolls',120)),500)):
                            if time.time()>deadline:break
                            if pagination.get('all',{}).get('has_more') in (0,False) and favorite_order:break
                            serial=pagination.get('all',{}).get('serial',0)
                            progress('favorites',f'已读取 {len(favorite_order)} 条收藏，正在检查分页')
                            page.mouse.move(900,650);page.mouse.wheel(0,1800)
                            wait_until(page,lambda:pagination.get('all',{}).get('serial',0)!=serial)
                            now=len(videos)
                            idle=idle+1 if now==previous else 0;previous=now
                            if pagination.get('all',{}).get('has_more') in (0,False) and videos: break
                            if idle in (4,8,12):
                                retry_collection_scroll(page);wait_until(page,lambda:pagination.get('all',{}).get('serial',0)!=serial,2500)
                            if idle>=16: break
                        # Load folders only AFTER reaching the end of the main video collection.
                        folder_selector=page.get_by_text('收藏夹',exact=True)
                        progress('folders','正在核对收藏夹')
                        if folder_selector.count():
                            try:folder_selector.first.click(timeout=4000);wait_until(page,lambda:bool(folder_pages),2500)
                            except Exception:pass
                        previous_f=-1;folder_idle=0
                        for _ in range(120):
                            if time.time()>deadline:break
                            if folder_pages and all(f.get('has_more') in (0,False) for f in folder_pages.values()):break
                            before=responses;page.mouse.move(300,650);page.mouse.wheel(0,1500)
                            wait_until(page,lambda:responses!=before,1200)
                            folder_idle=folder_idle+1 if previous_f==len(folders) else 0;previous_f=len(folders)
                            if folder_idle>=6:break
                        # Discover and visit existing collection UI tabs where available.
                        names=[f['name'] for f in folders.values()]
                        for name in names:
                            if time.time()>deadline:break
                            loc=page.get_by_text(name,exact=True)
                            if not loc.count(): continue
                            try:
                                fid=next((f['id'] for f in folders.values() if f['name']==name),'')
                                progress('folders',f'核对收藏夹 {folder_done+1} / {len(names)}')
                                serial=pagination.get(fid,{}).get('serial',0)
                                loc.first.click(timeout=4000);wait_until(page,lambda:pagination.get(fid,{}).get('serial',0)!=serial,2500)
                                last=-1;idle=0
                                for _ in range(120):
                                    if time.time()>deadline:break
                                    if pagination.get(fid,{}).get('has_more') in (0,False):break
                                    n=len(membership);serial=pagination.get(fid,{}).get('serial',0);page.mouse.wheel(0,1800)
                                    wait_until(page,lambda:pagination.get(fid,{}).get('serial',0)!=serial,1500)
                                    idle=idle+1 if last==n else 0;last=n
                                    if idle>=6:break
                                folder_done+=1
                                progress('folders',f'已核对 {folder_done} / {len(names)} 个收藏夹')
                            except Exception:continue
                        active=False
                        complete=bool(videos) and pagination.get('all',{}).get('has_more') in (0,False)
                        folders_complete=bool(folder_pages) and all(f.get('has_more') in (0,False) for f in folder_pages.values()) and (not folders or all(pagination.get(f,{}).get('has_more') in (0,False) for f in folders))
                        result=dict(ok=bool(favorite_order),videos=list(videos.values()),folders=list(folders.values()),membership=list(membership),favorite_order=list(favorite_order),
                                    complete=complete,folders_complete=folders_complete,pagination=pagination,folder_pages=folder_pages,diagnostics=diagnostics,response_count=responses,
                                    message=('收藏分页及现有收藏夹均已核验' if complete and folders_complete else '收藏分页已到末尾；收藏夹完整性仍需核验' if complete else '仅确认当前读取范围；未证明全部收藏读取完成') if videos else '未读到收藏数据，请检查登录/验证码；未清空旧列表')
                        atomic_json(private/'results'/f"{cmd['id']}.json",result)
                        atomic_json(private/'last-sync-proof.json',dict(complete=complete,folders_complete=folders_complete,pagination=pagination,folder_pages=folder_pages,diagnostics=diagnostics,count=len(favorite_order),folder_count=len(folders),favorite_order=list(favorite_order)))
                        state(status='ready' if videos else 'login_required',message=result['message'],count=len(videos))
                    elif cmd.get('action')=='detail':
                        active=False;detail=[]
                        def on_detail(r):
                            if '/aweme/detail' in urlparse(r.url).path:
                                try:
                                    d=r.json().get('aweme_detail');
                                    if d:detail.append(d)
                                except Exception:pass
                        page.on('response',on_detail)
                        try:
                            page.goto(f"https://www.douyin.com/video/{cmd['video_id']}",wait_until='domcontentloaded',timeout=60000)
                            for _ in range(25):
                                if detail:break
                                page.wait_for_timeout(700)
                        finally:page.remove_listener('response',on_detail)
                        atomic_json(private/'results'/f"{cmd['id']}.json",dict(ok=bool(detail),detail=detail[-1] if detail else None))
                except Exception as e:
                    active=False
                    closed=type(e).__name__=='TargetClosedError' or context_closed or page is None or page.is_closed()
                    (private/'browser-error.log').write_text(traceback.format_exc(),encoding='utf-8')
                    message='后台连接中断，正在恢复；旧收藏已保留' if closed else '后台读取未成功；旧收藏已保留，请重试或检查登录'
                    atomic_json(private/'results'/f"{cmd.get('id','error')}.json",dict(ok=False,error_code='browser_closed' if closed else 'read_failed',message=message))
                    state(status='closed' if closed else 'error',message=message)
            try:
                if not page.is_closed() and not context_closed:page.wait_for_timeout(400)
                else:time.sleep(.3)
            except Exception:time.sleep(.3)

if __name__=='__main__':
    try:main()
    except Exception:
        Path(sys.argv[1],'browser-error.log').write_text(traceback.format_exc(),encoding='utf-8')
        if len(sys.argv)>1:atomic_json(Path(sys.argv[1])/'browser-state.json',dict(status='error',message='浏览器启动失败，请查看本机依赖'))
        sys.exit(1)
