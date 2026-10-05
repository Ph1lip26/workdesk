// Run with Electron, not a renderer test framework; excluded from the installer.
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const payload=process.env.WORKDESK_TEST_PAYLOAD;
if(payload){Object.defineProperty(app,'isPackaged',{value:true});Object.defineProperty(process,'resourcesPath',{value:path.join(path.resolve(payload),'resources')})}
const desk=require(payload?path.join(process.resourcesPath,'app.asar/desktop/main.cjs'):'../desktop/main.cjs');
const {request}=require('../desktop/platform.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[];
function check(name,actual,expected=true){assert.equal(actual,expected,name);checks.push(name);console.log('PASS',name)}
(async()=>{
 try{
  await desk.startup;const w=desk.window,wc=w.webContents;
  const errors=[];wc.on('console-message',(_event,...args)=>{const details=args[0];if(details?.level==='error')errors.push(details.message)});
  async function js(code){return wc.executeJavaScript(code)}
  for(let n=0;n<80;n++){if(await js("document.querySelectorAll('.card').length===30"))break;await sleep(100)}
  check('native window loaded local service',wc.getURL().startsWith(desk.origin));
  check('page contains thirty cards',await js("document.querySelectorAll('.card').length"),30);
  check('no Node in renderer',await js("typeof require==='undefined' && typeof process==='undefined'"));
  const pref=wc.getLastWebPreferences();check('sandbox enabled',pref.sandbox);check('context isolation enabled',pref.contextIsolation);check('Node integration disabled',pref.nodeIntegration,false);
  check('native caption buttons overlay page',await js('navigator.windowControlsOverlay.visible'));
  check('integrated drag strip is forty pixels',await js("document.querySelector('.window-chrome').getBoundingClientRect().height"),40);
  check('title strip can drag window',await js("getComputedStyle(document.querySelector('.window-chrome')).getPropertyValue('app-region')"),'drag');
  check('safe title width respects native buttons',await js("document.querySelector('.window-title').getBoundingClientRect().right<=navigator.windowControlsOverlay.getTitlebarAreaRect().right"));
  check('no floating navigation dialog',await js("document.getElementById('navdrawer')===null"));
  const originalPanel=await js("document.getElementById('modulepanel').parentElement.id");
  for(const width of [1080,960,800]){
   w.setContentSize(width,720);await sleep(100);
   // Overlay frames can add a two-DIP client inset on Windows; test CSS widths.
   const actualWidth=await js('innerWidth');if(actualWidth!==width)w.setContentSize(width-(actualWidth-width),720);
   await sleep(350);check(`${width}: viewport within native inset tolerance`,Math.abs(await js('innerWidth')-width)<=2);
   check(`${width}: compact panel starts closed`,await js("document.getElementById('modulepanel').inert"));
   await js("document.getElementById('navtoggle').click()");await sleep(350);
   check(`${width}: panel joined to rail`,await js("document.getElementById('modulepanel').getBoundingClientRect().left===document.querySelector('.module-rail').getBoundingClientRect().right"));
   check(`${width}: content sits beside panel`,await js("Math.abs(document.querySelector('.workspace').getBoundingClientRect().left-document.getElementById('modulepanel').getBoundingClientRect().right)<1"));
   check(`${width}: navigation never opens a modal`,await js("!document.querySelector('dialog:modal')"));
   check(`${width}: navigation does not lock or blur content`,await js("getComputedStyle(document.querySelector('.workspace')).overflowY==='auto'&&getComputedStyle(document.querySelector('.workspace')).filter==='none'&&getComputedStyle(document.querySelector('.workspace')).backdropFilter==='none'"));
   check(`${width}: scrollbar reaches viewport edge`,await js("Math.abs(document.querySelector('.workspace').getBoundingClientRect().right-innerWidth)<1"));
   check(`${width}: rail and panel below integrated chrome`,await js("document.querySelector('.module-rail').getBoundingClientRect().top===40&&document.getElementById('modulepanel').getBoundingClientRect().top===40"));
   check(`${width}: panel remains in original host`,await js("document.getElementById('modulepanel').parentElement.id"),originalPanel);
   if(width===960)await wc.capturePage().then(img=>fs.writeFileSync(path.join(app.getPath('userData'),'native-compact-open.png'),img.toPNG()));
   await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await sleep(350);
   check(`${width}: Escape closes and restores rail focus`,await js("document.getElementById('modulepanel').inert&&document.activeElement.id==='navtoggle'"));
  }
  await js("document.getElementById('douyinmodule').click()");await sleep(350);
  await js("document.querySelector('.workspace').click()");await sleep(350);
  check('outside click closes attached panel',await js("document.getElementById('modulepanel').inert"));
  await js("document.getElementById('navtoggle').click();document.getElementById('closenav').click()");await sleep(350);
  check('close button closes attached panel',await js("document.getElementById('modulepanel').inert"));
  await js("document.getElementById('navtoggle').click();document.querySelector('[data-source=local]').click()");await sleep(350);
  check('source selection closes panel',await js("document.getElementById('modulepanel').inert"));
  await js("document.getElementById('navtoggle').click();document.querySelector('[data-source=favorites]').click()");
  w.setContentSize(1440,920);await sleep(350);
  check('wide resize restores joined panel',await js("!document.getElementById('modulepanel').inert&&Math.abs(document.querySelector('.workspace').getBoundingClientRect().left-312)<1"));
  await js("document.getElementById('navtoggle').click()");await sleep(350);
  check('wide collapse frees content space',await js("document.getElementById('modulepanel').inert&&Math.abs(document.querySelector('.workspace').getBoundingClientRect().left-72)<1"));
  await js("document.getElementById('navtoggle').click()");await sleep(350);
  check('first work is newest favorite',await js("document.querySelector('.card').dataset.id"),'1000000000000000001');
  check('existing note is recognized',await js("document.querySelector('.card').dataset.status"),'done');
  check('saved work cannot re-enqueue',await js("document.querySelector('.card input').disabled"));
  await js("document.getElementById('nextpage').click()");
  check('second page starts at thirty-one',await js("document.querySelector('.card').dataset.id"),'1000000000000000031');
  await js("document.getElementById('nextpage').click()");
  check('last page has five cards',await js("document.querySelectorAll('.card').length"),5);
  await js("document.getElementById('status').value='done';document.getElementById('status').dispatchEvent(new Event('change'))");
  check('filter clamps page',await js("document.querySelectorAll('.card').length"),1);
  check('done filter contains existing note',await js("document.querySelector('.card').dataset.status"),'done');
  await js("document.getElementById('queueopen').click()");
  check('queue dialog opens',await js("document.getElementById('queuepanel').open"));
  await js("document.getElementById('queuepanel').close();document.getElementById('toolsopen').click()");
  check('tools dialog opens',await js("document.getElementById('tools').open"));
  await js("document.getElementById('tools').close()");
  const bounds=w.getBounds();w.maximize();await sleep(300);check('native maximize works',w.isMaximized());w.unmaximize();await sleep(300);
  w.minimize();await sleep(200);check('native minimize works',w.isMinimized());desk.show();await sleep(200);w.setBounds(bounds);
  check('settings bridge refuses workbench page',await js("window.workdesk.getSettings().then(()=>false,()=>true)"));
  check('idle state before close',await desk.idle());
  const before=JSON.parse(await request(desk.origin,'/health'));
  w.close();await sleep(200);check('window close hides',w.isVisible(),false);
  const after=JSON.parse(await request(desk.origin,'/health'));
  check('close keeps same background instance',after.instance,before.instance);
  desk.show();check('window can reopen',w.isVisible());
  await wc.capturePage().then(img=>fs.writeFileSync(path.join(app.getPath('userData'),'native-smoke.png'),img.toPNG()));
  check('no page console errors',errors.length,0);
  fs.writeFileSync(path.join(app.getPath('userData'),'native-smoke.json'),JSON.stringify({ok:true,checks},null,2));
  console.log(`Native smoke: ${checks.length} checks passed`);await desk.quit();
 }catch(e){console.error(e.stack);try{await desk.stopBackend()}catch{};app.exit(1)}
})();
