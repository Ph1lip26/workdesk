const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 const calls=[],messages=[],element={value:'night',disabled:false},root={dataset:{appearance:'night'}};
 let now=10000,openingListener,themeListener;const media={matches:false,addEventListener:(_name,fn)=>themeListener=fn};
 const context=vm.createContext({document:{documentElement:root,hidden:false,addEventListener(){}},window:{workdesk:{onOpened:fn=>openingListener=fn,applyAppearance:async mode=>calls.push(['native',mode])}},
  $:()=>element,api:async(name,payload)=>{calls.push([name,payload]);return name==='appearance'?{mode:payload.mode}:{ok:true}},
  refresh:async()=>calls.push(['library']),refreshHomepage:async()=>calls.push(['home']),refreshPurchases:async()=>calls.push(['purchases']),toast:m=>messages.push(m),
  Date:{now:()=>now},setTimeout:()=>1,clearTimeout(){},matchMedia:()=>media});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../backend/static/theme.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../backend/static/shell.js'),'utf8'),context);
 return {context,calls,messages,element,root,run:s=>vm.runInContext(s,context),advance:()=>now+=2000,setDark:value=>{media.matches=value;themeListener()},get listener(){return openingListener}};
}
test('open refresh includes all modules and coalesces one opening gesture',async()=>{
 const f=fixture();assert.equal(typeof f.listener,'function');await f.run('refreshAllModules()');await f.run('refreshAllModules()');
 assert.deepEqual(f.calls.map(c=>c[0]),['open_refresh','library','home','purchases']);
 f.advance();await f.run('refreshAllModules()');assert.equal(f.run('openingRefreshCount'),2);
 assert.equal(f.calls.filter(c=>c[0]==='open_refresh').length,2);
});
test('concurrent opening refresh does not start another request',async()=>{
 const f=fixture();let complete;
 f.context.api=()=>new Promise(r=>complete=r);
 const first=f.run('refreshAllModules()');f.advance();const second=f.run('refreshAllModules()');
 assert.equal(f.run('openingRefreshCount'),1);complete({ok:true});await Promise.all([first,second]);
});
test('failed opening keeps old content and enables the next opening',async()=>{
 const f=fixture();f.context.api=async()=>{throw Error('offline')};await f.run('refreshAllModules()');
 assert.equal(f.calls.length,0);assert.equal(f.run('openingRefresh'),null);assert.equal(f.run('lastOpeningReport.ok'),false);assert.equal(f.messages.length,1);
});
test('appearance saves first, applies native chrome and retains the choice',async()=>{
 const f=fixture();await f.run("changeAppearance('day')");assert.equal(f.root.dataset.appearance,'day');assert.equal(f.element.disabled,false);
 assert.deepEqual(f.calls.map(c=>c[0]),['appearance','native']);
});
test('failed theme save restores previous UI, failed chrome does not undo a saved mode',async()=>{
 const f=fixture();f.context.api=async()=>{throw Error('disk failure')};await f.run("changeAppearance('day')");assert.equal(f.root.dataset.appearance,'night');
 f.context.api=async()=>({mode:'day'});f.context.window.workdesk.applyAppearance=async()=>{throw Error('chrome failure')};
 await f.run("changeAppearance('day')");assert.equal(f.root.dataset.appearance,'day');assert.equal(f.element.disabled,false);assert.equal(f.messages.length,2);
});
test('system mode remembers the preference while resolving current OS colors live',async()=>{
 const f=fixture();await f.run("changeAppearance('system')");assert.equal(f.element.value,'system');assert.equal(f.root.dataset.appearanceMode,'system');assert.equal(f.root.dataset.appearance,'day');
 f.setDark(true);assert.equal(f.root.dataset.appearance,'night');assert.equal(f.element.value,'system');
 f.setDark(false);assert.equal(f.root.dataset.appearance,'day');assert.deepEqual(f.calls.map(c=>c[0]),['appearance','native']);
});
test('explicit modes ignore OS changes; a saved system choice resolves before any body exists',async()=>{
 const f=fixture();await f.run("changeAppearance('day')");f.setDark(true);assert.equal(f.root.dataset.appearance,'day');
 await f.run("changeAppearance('night')");f.setDark(false);assert.equal(f.root.dataset.appearance,'night');
 f.root.dataset.appearance='system';delete f.root.dataset.appearanceMode;
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../backend/static/theme.js'),'utf8'),f.context);
 assert.equal(f.root.dataset.appearanceMode,'system');assert.equal(f.root.dataset.appearance,'day');
});
