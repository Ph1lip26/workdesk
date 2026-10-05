// Empty synthetic home only. No account, private paths, or model invocation.
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const desk=require('../desktop/main.cjs');
const checks=[];
const check=(name,actual,expected=true)=>{assert.equal(actual,expected,name);checks.push(name);console.log('PASS',name)};
(async()=>{
 try{
  await desk.startup;const w=desk.window,wc=w.webContents,js=code=>wc.executeJavaScript(code);
  check('fresh install starts setup',wc.getURL().endsWith('/desktop/setup.html'));
  check('setup has native caption overlay',await js('navigator.windowControlsOverlay.visible'));
  check('setup title integrated with page',await js("getComputedStyle(document.querySelector('.window-chrome')).backgroundColor===getComputedStyle(document.documentElement).backgroundColor"));
  check('setup title can drag',await js("getComputedStyle(document.querySelector('.window-chrome')).getPropertyValue('app-region')"),'drag');
  check('setup leaves space for native controls',await js("document.querySelector('.window-title').getBoundingClientRect().right<=navigator.windowControlsOverlay.getTitlebarAreaRect().right"));
  check('setup content below title',await js("document.querySelector('main').getBoundingClientRect().top>=40"));
  check('empty config contains no vault',await js("window.workdesk.getSettings().then(c=>!c.vault_path)"));
  check('invalid config cannot start service',await js("window.workdesk.saveSettings({vault_path:''}).then(r=>r.ok===false)"));
  check('invalid config is not saved',fs.existsSync(path.join(app.getPath('userData'),'config.json')),false);
  check('Node remains unavailable',await js("typeof require==='undefined'&&typeof process==='undefined'"));
  w.close();check('setup close hides instead of destroying',w.isVisible(),false);desk.show();check('setup reopens',w.isVisible());await new Promise(r=>setTimeout(r,300));
  await wc.capturePage().then(img=>fs.writeFileSync(path.join(app.getPath('userData'),'native-setup.png'),img.toPNG()));
  fs.writeFileSync(path.join(app.getPath('userData'),'native-setup.json'),JSON.stringify({ok:true,checks},null,2));
  await desk.quit();
 }catch(e){console.error(e.stack);app.exit(1)}
})();
