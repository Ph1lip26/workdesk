const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('overlapping refreshes share one promise and retain one trailing request',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../backend/static/app.js'),'utf8');
 const start=source.indexOf('function refresh(){'),end=source.indexOf("\n$('source').onchange",start);
 let calls=0,finish;
 const context=vm.createContext({document:{hidden:false},readState:()=>{calls++;return new Promise(resolve=>finish=resolve)}});
 vm.runInContext('let refreshPromise=null,refreshAgain=false;'+source.slice(start,end),context);
 const first=vm.runInContext('refresh()',context),second=vm.runInContext('refresh()',context);
 assert.equal(first,second);assert.equal(calls,1);
 finish(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);
 finish(true);assert.equal(await first,true);
});
test('unchanged health refresh retains chart nodes and hover state',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../backend/static/health.js'),'utf8');
 const start=source.indexOf('async function refreshHealth('),end=source.indexOf('\nfunction openWeightEditor',start);
 let renders=0;
 const context=vm.createContext({currentModule:'health',api:async()=>({records:[]}),renderHealth:()=>renders++,renderHealthHome(){},toast(){}});
 vm.runInContext("let healthBusy=false,healthRefreshPromise=null,healthState=null,healthFingerprint='',healthSyncResult=null;"+source.slice(start,end),context);
 await vm.runInContext('refreshHealth()',context);await vm.runInContext('refreshHealth()',context);
 assert.equal(renders,1);
 await vm.runInContext('refreshHealth({sync:true})',context);assert.equal(renders,2);
});
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
test('startup has no opening refresh subscription or remote request',()=>{
 const f=fixture();assert.equal(f.listener,undefined);assert.deepEqual(f.calls,[]);
 assert.equal(f.run('typeof scheduleOpeningRefresh'),'undefined');
 assert.equal(f.run('typeof refreshAllModules'),'undefined');
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
