// Run with Electron, not a renderer test framework; excluded from the installer.
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const desk=require('../desktop/main.cjs');
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
