// macOS-only, empty synthetic profile; no credentials, vault content or model calls.
const {app,Menu}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
assert.equal(process.platform,'darwin');
const payload=process.env.WORKDESK_TEST_PAYLOAD,home=process.env.WORKDESK_HOME;
assert.ok(payload&&home&&path.resolve(home).startsWith(path.resolve(__dirname,'../build')+path.sep));
Object.defineProperty(app,'isPackaged',{value:true});Object.defineProperty(process,'resourcesPath',{value:path.join(payload,'Contents/Resources')});
const desk=require(path.join(process.resourcesPath,'app.asar/desktop/main.cjs'));
const checks=[];const check=(name,value)=>{assert.ok(value,name);checks.push(name)};
(async()=>{try{
 await desk.startup;const wc=desk.window.webContents,js=s=>wc.executeJavaScript(s);
 check('fresh setup',wc.getURL().endsWith('/desktop/setup.html'));
 check('macOS platform styling',await js("document.documentElement.dataset.platform==='darwin'"));
 check('traffic light space',await js("parseInt(getComputedStyle(document.querySelector('.window-chrome')).paddingLeft)>=90"));
 check('isolated renderer',await js("typeof require==='undefined'&&typeof process==='undefined'"));
 check('native edit and quit menus',Menu.getApplicationMenu().items.length===3);
 const vault=path.join(home,'synthetic-vault');for(const name of ['处理文件','原始资料'])fs.mkdirSync(path.join(vault,name),{recursive:true});
 await js(`window.workdesk.saveSettings(${JSON.stringify({vault_path:vault})});true`);
 for(let i=0;i<150&&!wc.getURL().startsWith('http://127.0.0.1:');i++)await new Promise(r=>setTimeout(r,200));
 check('bundled Python backend starts',wc.getURL().startsWith('http://127.0.0.1:'));
 const response=await fetch(desk.origin+'/health');check('service health',(await response.json()).service==='workdesk');
 check('configured native paths',JSON.parse(fs.readFileSync(path.join(home,'config.json'))).vault_path===vault);
 check('no preloaded account',!fs.existsSync(path.join(home,'private/auth.json')));
 check('database created outside app',fs.existsSync(path.join(home,'data/state.sqlite3')));
 fs.writeFileSync(path.join(home,'mac-smoke.json'),JSON.stringify({ok:true,checks},null,2));
 console.log('Mac smoke:',checks.length,'checks passed');await desk.quit();
}catch(e){console.error(e.stack);try{await desk.quit()}catch{}app.exit(1)}})();
