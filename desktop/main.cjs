const {app,BrowserWindow,Tray,Menu,dialog,ipcMain,shell,nativeImage} = require('electron');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {trusted,safeExternal,loadConfig,saveConfig,request}=require('./platform.cjs');
if(process.env.WORKDESK_HOME)app.setPath('userData',path.resolve(process.env.WORKDESK_HOME));
const home=app.getPath('userData');
const setupURL=require('node:url').pathToFileURL(path.join(__dirname,'setup.html')).href;
let window,tray,origin='',backend=null,quitting=false,startup;
const locked=app.requestSingleInstanceLock();
if(!locked)app.quit();
else {
  app.on('second-instance',()=>show());
  app.on('activate',()=>show());
  startup=app.whenReady().then(create);startup.catch(fail);
  // Closing is not exit; tasks remain in the independent local service.
  app.on('window-all-closed',()=>{});
}
function show(){if(window){window.show();if(window.isMinimized())window.restore();window.focus()}}
function bundle(){return app.isPackaged?path.join(process.resourcesPath,'backend'):path.join(__dirname,'../backend')}
function runtime(){return app.isPackaged?path.join(process.resourcesPath,'runtime'):path.join(__dirname,'../build/runtime')}
function python(){return process.env.WORKDESK_PYTHON || path.join(runtime(),process.platform==='win32'?'python.exe':'bin/python3')}
function fail(e){fs.mkdirSync(home,{recursive:true});fs.appendFileSync(path.join(home,'desktop.log'),`${new Date().toISOString()} ${e.message}\n`);dialog.showErrorBox('Workdesk',`${e.message}\n已有私人数据保留。`)}
async function create(){
  window=new BrowserWindow({width:1440,height:920,minWidth:800,minHeight:560,title:'Workdesk · 个人工作台',backgroundColor:'#141414',
    titleBarStyle:'hidden',...(process.platform!=='darwin'?{titleBarOverlay:{color:'#141414',symbolColor:'#c8c8c8',height:40}}:{}),
    icon:path.join(__dirname,'../assets/app.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:false}});
  window.on('close',e=>{if(!quitting){e.preventDefault();window.hide()}});
  window.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
  window.webContents.session.setPermissionCheckHandler(()=>false);
  window.webContents.session.on('will-download',e=>e.preventDefault());
  window.webContents.on('will-navigate',(e,url)=>{if(url===setupURL || (origin&&trusted(url,origin)))return;e.preventDefault();if(safeExternal(url))shell.openExternal(url)});
  window.webContents.setWindowOpenHandler(({url})=>{if(safeExternal(url))shell.openExternal(url);return {action:'deny'}});
  let icon=nativeImage.createFromPath(path.join(__dirname,'../assets/icon.png'));
  tray=new Tray(icon.resize({width:20,height:20}));tray.setToolTip('Workdesk · 个人工作台');tray.on('double-click',show);
  tray.setContextMenu(Menu.buildFromTemplate([{label:'打开工作台',click:show},{label:'重新加载界面',click:()=>{show();window.webContents.reload()}},
    {label:'设置',click:async()=>{show();if(await idle())await window.loadURL(setupURL);else dialog.showMessageBox(window,{message:'有任务或后台操作，完成后再修改设置。'})}},
    {type:'separator'},{label:'彻底退出（不打断任务）',click:quit}]));
  Menu.setApplicationMenu(null);
  ipcMain.handle('settings:get',(e)=>{authorizeSetup(e);return loadConfig(home)});
  ipcMain.handle('settings:choose',async(e,kind)=>{
    authorizeSetup(e);if(!['vault_path','codex_path','obsidian_path','media_path'].includes(kind))throw Error('不支持的路径类型');
    const r=await dialog.showOpenDialog(window,{properties:[kind.endsWith('_path')&&['vault_path','media_path'].includes(kind)?'openDirectory':'openFile']});
    return r.canceled?'':r.filePaths[0];
  });
  ipcMain.handle('settings:save',async(e,input)=>{
    authorizeSetup(e);
    try{
      const c={};for(const k of ['vault_path','codex_path','obsidian_path','media_path','hf_endpoint'])c[k]=typeof input?.[k]==='string'?input[k].trim():'';
      if(!path.isAbsolute(c.vault_path) || !fs.statSync(c.vault_path).isDirectory())throw Error('请选择有效知识库文件夹');
      for(const dir of ['处理文件','原始资料'])if(!fs.existsSync(path.join(c.vault_path,dir)))throw Error(`知识库缺少「${dir}」目录；请先确认知识库结构`);
      for(const k of ['codex_path','obsidian_path'])if(c[k]&&(!path.isAbsolute(c[k])||!fs.statSync(c[k]).isFile()))throw Error('外部程序路径无效');
      if(c.media_path){if(!path.isAbsolute(c.media_path)||!fs.statSync(c.media_path).isDirectory())throw Error('素材目录无效');const rel=path.relative(c.vault_path,c.media_path);if(!rel.startsWith('..')&&!path.isAbsolute(rel))throw Error('私人素材目录不能放在知识库内部')}
      if(c.hf_endpoint&&!['https://hf-mirror.com'].includes(c.hf_endpoint))throw Error('下载来源无效');
      if(!await idle())throw Error('任务未完成，不能切换配置');
      await stopBackend();saveConfig(home,c);await startBackend();return {ok:true};
    }catch(err){return {ok:false,error:err.message}}
  });
  if(loadConfig(home).vault_path)await startBackend();else await window.loadURL(setupURL);
}
function authorizeSetup(e){if(e.sender!==window.webContents || e.senderFrame?.url!==setupURL)throw Error('只允许本机设置页使用此接口')}
async function getToken(){const page=await request(origin,'/');const m=page.match(/name="workbench-token" content="([^"]+)"/);if(!m)throw Error('后台令牌无效');return m[1]}
async function idle(){if(!origin)return true;try{await request(origin,'/health')}catch{return true}try{const s=JSON.parse(await request(origin,'/api/state',await getToken()));return !s.syncing&&!s.authchecking&&!s.jobs.some(j=>['queued','running'].includes(j.status))}catch{return false}}
async function stopBackend(){if(!origin)return;try{await request(origin,'/health')}catch{origin='';return}await request(origin,'/api/shutdown',await getToken(),'{}');for(let n=0;n<30;n++){try{await request(origin,'/health');await new Promise(r=>setTimeout(r,200))}catch{origin='';return}}throw Error('后台仍在退出，没有强制终止它')}
async function startBackend(){
  fs.mkdirSync(home,{recursive:true});
  const stateFile=path.join(home,'backend.json');
  try{const s=JSON.parse(fs.readFileSync(stateFile,'utf8'));const candidate=`http://127.0.0.1:${s.port}`;const health=JSON.parse(await request(candidate,'/health'));if(health.service==='workdesk'&&health.instance===s.instance){origin=candidate;await window.loadURL(origin);return}}catch{}
  const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
  const instance=crypto.randomUUID();origin=`http://127.0.0.1:${port}`;
  const env={...process.env,WORKDESK_HOME:home,WORKDESK_CONFIG:path.join(home,'config.json'),WORKDESK_INSTANCE:instance,
    PLAYWRIGHT_BROWSERS_PATH:path.join(runtime(),'browsers'),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'};
  for(const k of Object.keys(env))if(/^(OPENAI_|DEEPSEEK_|GH_TOKEN$|GITHUB_TOKEN$)/.test(k))delete env[k];
  const log=fs.openSync(path.join(home,'backend.log'),'a');
  backend=spawn(python(),[path.join(bundle(),'server.py'),'--port',String(port)],{cwd:bundle(),env,windowsHide:true,detached:true,stdio:['ignore',log,log]});
  backend.on('error',fail);backend.unref();fs.closeSync(log);
  fs.writeFileSync(stateFile,JSON.stringify({port,instance,pid:backend.pid}),{mode:0o600});
  for(let n=0;n<100;n++){
    await new Promise(r=>setTimeout(r,250));
    try{const h=JSON.parse(await request(origin,'/health'));if(h.service==='workdesk'&&h.instance===instance){await window.loadURL(origin);return}}catch{}
  }
  throw Error('后台启动失败，请查看本机 backend.log；可从托盘设置检查路径');
}
async function quit(){
  if(quitting)return;
  try{if(!await idle())throw Error('有排队任务、运行任务、同步或登录检查，不能彻底退出。关闭窗口会继续处理。');
    await stopBackend();quitting=true;tray?.destroy();app.quit();
  }catch(e){show();dialog.showMessageBox(window,{message:e.message})}
}
// Main-process only: the renderer receives no test, process, or filesystem bridge.
module.exports={get startup(){return startup},get window(){return window},get origin(){return origin},idle,stopBackend,quit,show};
