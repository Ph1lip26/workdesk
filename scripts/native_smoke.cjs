// Run with Electron, not a renderer test framework; excluded from the installer.
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixtureHome,createSmokeLogger}=require('./smoke_io.cjs');
const fixture=fixtureHome(process.env.WORKDESK_HOME,path.resolve(__dirname,'..'));
fs.mkdirSync(fixture,{recursive:true});
const log=createSmokeLogger(path.join(fixture,'native-smoke-checks.log'));
const payload=process.env.WORKDESK_TEST_PAYLOAD;
if(payload){Object.defineProperty(app,'isPackaged',{value:true});Object.defineProperty(process,'resourcesPath',{value:path.join(path.resolve(payload),'resources')})}
const desk=require(payload?path.join(process.resourcesPath,'app.asar/desktop/main.cjs'):'../desktop/main.cjs');
const {request}=require('../desktop/platform.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[];
function check(name,actual,expected=true){assert.equal(actual,expected,name);checks.push(name);log.info('PASS '+name)}
(async()=>{
 try{
  await desk.startup;const w=desk.window,wc=w.webContents;
  // Only the isolated test: desktop tools may minimize this window while frame
  // probes run. Do not let a hidden fixture stall its promises or rAF loops;
  // the real application's normal background policy remains unchanged.
  wc.setBackgroundThrottling(false);
  const errors=[];wc.on('console-message',(_event,...args)=>{const details=args[0];if(details?.level==='error')errors.push(details.message)});
  async function js(code){return wc.executeJavaScript(code)}
  async function navigationSettled(){
   await sleep(50);
   for(let n=0;n<40;n++){
    if(await js("!document.body.classList.contains('nav-moving')&&document.getAnimations().every(a=>a.playState!=='running'||!a.effect?.target?.matches('.module-panel,.panel-heading,.panel-nav,.panel-footer,.workspace,.cards,.card,#douyinmodule,#douyinmodule svg,#navtoggle svg path:last-child,.window-chrome'))"))return;
    await sleep(50);
   }
   const pending=await js("document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.target?.matches('.module-panel,.panel-heading,.panel-nav,.panel-footer,.workspace,.cards,.card,#douyinmodule,#douyinmodule svg,#navtoggle svg path:last-child,.window-chrome')).map(a=>({target:a.effect.target.id||a.effect.target.className.baseVal||a.effect.target.className,type:a.constructor.name,time:a.currentTime,duration:a.effect.getTiming().duration,iterations:a.effect.getTiming().iterations}))");
   const state=await js("({moving:document.body.classList.contains('nav-moving'),reflow:!!navigationReflow,generation:navigationGeneration,animations:navigationAnimations.map(a=>({state:a.playState,time:a.currentTime,pending:a.pending})),visibility:document.visibilityState})");
   throw Error('Navigation did not settle within two seconds: '+JSON.stringify({pending,state}));
  }
  for(let n=0;n<80;n++){if(await js("typeof homeState!=='undefined'&&homeState?.configured&&document.querySelectorAll('.card').length===30"))break;await sleep(100)}
  check('native default page is personal home',await js("document.body.dataset.module==='home'&&!document.getElementById('homeview').hidden"));
  check('homepage has a real stage and four current subjects',await js("document.querySelector('.tile-phase h3').textContent==='测试阶段'&&document.querySelectorAll('.status-record').length===4"));
  check('homepage and library are separate registered modules',await js("Object.keys(moduleRegistry).length===2&&document.getElementById('douyinview').hidden"));
  check('home has six movable cards',await js("document.querySelectorAll('#home-cards>[data-home-card]').length===6"));
  check('home has no secondary navigation',await js("document.getElementById('panelhost').hidden&&document.getElementById('navtoggle').hidden&&document.getElementById('modulepanel').inert"));
  check('home content starts at primary rail',await js("Math.abs(document.querySelector('.workspace').getBoundingClientRect().left-document.querySelector('.module-rail').getBoundingClientRect().right)<1"));
  for(const [width,height] of [[1440,920],[1080,620],[800,560]]){
   w.setContentSize(width,height);await sleep(180);
   check(`${width}: native logo has optical ink alignment`,await js("document.querySelector('.workspace-logo').dataset.brandAligned==='true'&&getComputedStyle(document.querySelector('.workspace-logo')).objectFit==='cover'"));
   check(`${width}: native wordmark shares the rail center`,await js("(()=>{const n=document.querySelector('.workspace-name').getBoundingClientRect(),r=document.querySelector('.module-rail').getBoundingClientRect();return Math.abs(n.left+n.width/2-r.left-r.width/2)<.1})()"));
   check(`${width}: native logo slot fits without flex shrinking`,await js("(()=>{const i=document.querySelector('.workspace-logo'),r=i.getBoundingClientRect(),m=document.querySelector('.workspace-mark').getBoundingClientRect(),n=document.querySelector('.workspace-name').getBoundingClientRect();return getComputedStyle(i).flexShrink==='0'&&r.top>=m.top&&r.bottom<=m.bottom&&n.bottom<=m.bottom})()"));
   for(const compact of [false,true]){
    await js(compact?"applyHomeOrder(['next','focus','status','douyin','later','materials'])":"applyHomeOrder(HOME_CARD_IDS)");
    const viewportEvidence=await js("(()=>{const ws=document.querySelector('.workspace'),r=ws.getBoundingClientRect();return {viewport:[innerWidth,innerHeight,devicePixelRatio],scroll:[ws.scrollHeight,ws.clientHeight],cards:[...document.querySelectorAll('#home-cards article')].map(c=>{const b=c.getBoundingClientRect(),foot=c.querySelector('.tile-foot').getBoundingClientRect();return {id:c.dataset.homeCard,scroll:[c.scrollHeight,c.clientHeight],bottom:b.bottom,workspaceBottom:r.bottom,footBottom:foot.bottom,height:b.height}})}})()");
    if(viewportEvidence.scroll[0]>viewportEvidence.scroll[1]+1||viewportEvidence.cards.some(c=>c.bottom>c.workspaceBottom||c.scroll[0]>c.scroll[1]+1||c.footBottom>c.bottom)){
     fs.writeFileSync(path.join(fixture,'home-viewport-failure.json'),JSON.stringify(viewportEvidence,null,2));
     await wc.capturePage().then(img=>fs.writeFileSync(path.join(fixture,'home-viewport-failure.png'),img.toPNG()));
    }
    check(`${width}x${height} ${compact?'reordered':'default'}: native home fits one viewport`,await js("(()=>{const ws=document.querySelector('.workspace'),r=ws.getBoundingClientRect();return ws.scrollHeight<=ws.clientHeight+1&&[...document.querySelectorAll('#home-cards article')].every(c=>{const b=c.getBoundingClientRect(),foot=c.querySelector('.tile-foot').getBoundingClientRect();return b.bottom<=r.bottom&&c.scrollHeight<=c.clientHeight+1&&foot.bottom<=b.bottom})})()"));
   }
  }
  w.setContentSize(1440,920);await sleep(180);await js("applyHomeOrder(HOME_CARD_IDS)");
  check('native homepage has opaque steel status material',await js("getComputedStyle(document.querySelector('[data-home-card=status]')).backgroundColor==='rgb(46, 48, 52)'&&getComputedStyle(document.querySelector('[data-home-card=status]')).backdropFilter==='none'"));
  check('native homepage header has no date or clock',await js("!document.querySelector('.home-top p,.home-top time')"));
  check('native evidence date remains visible',await js("document.querySelector('.tile-evidence').textContent.includes('最新实报')"));
  check('native generic brand fallback is local and loaded',await js("(()=>{const img=document.querySelector('.workspace-logo');return img.complete&&img.naturalWidth===512&&img.getAttribute('src')==='/brand'})()"));
  check('native large-window summaries use the revised readable hierarchy',await js("parseFloat(getComputedStyle(document.querySelector('.tile-record-summary')).fontSize)>=16&&parseFloat(getComputedStyle(document.querySelector('.collection-total strong')).fontSize)>parseFloat(getComputedStyle(document.querySelector('.tile-phase h3')).fontSize)"));
  check('native cards have natural larger corners and one shared brushed metal finish',await js("parseFloat(getComputedStyle(document.querySelector('.home-tile')).borderRadius)>=28&&(()=>{const s=[...document.querySelectorAll('.home-tile')].map(c=>getComputedStyle(c));return s.every(c=>c.backgroundImage.includes('repeating-linear-gradient'))&&new Set(s.map(c=>c.backgroundColor)).size===1&&new Set(s.map(c=>c.backgroundImage)).size===1})()"));
  check('native local-material card shows records with honest wording',await js("document.querySelector('.material-total strong').textContent==='65'&&document.querySelector('.material-note').textContent.includes('包含收藏')"));
  check('native material cards have no backdrop filter workload',await js("getComputedStyle(document.querySelector('.home-tile')).backdropFilter==='none'&&getComputedStyle(document.body,'::before').pointerEvents==='none'"));
  // Real pointer input needs a settled, active window; the launcher itself is hidden.
  desk.show();await sleep(250);
  const localPoint=await js("(()=>{const r=document.querySelector('[data-home-card=materials] h2').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
  wc.sendInputEvent({type:'mouseMove',...localPoint});wc.sendInputEvent({type:'mouseDown',...localPoint,button:'left',clickCount:1});wc.sendInputEvent({type:'mouseUp',...localPoint,button:'left',clickCount:1});await sleep(350);
  check('native local whole-card link opens the actual local list',await js("currentModule==='douyin'&&view==='local'&&document.querySelectorAll('.card').length===30"));
  await js("document.getElementById('homemodule').click()");await sleep(350);
  const modulePoint=await js("(()=>{const r=document.querySelector('[data-home-card=douyin] h2').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
  wc.sendInputEvent({type:'mouseMove',...modulePoint});wc.sendInputEvent({type:'mouseDown',...modulePoint,button:'left',clickCount:1});wc.sendInputEvent({type:'mouseUp',...modulePoint,button:'left',clickCount:1});await sleep(350);
  check('native whole-card heading enters Douyin',await js("currentModule==='douyin'"));
  await js("document.getElementById('homemodule').click()");await sleep(350);
  check('native home module data returns without a secondary menu',await js("document.getElementById('panelhost').hidden&&document.querySelector('.collection-total strong').textContent==='65'"));
  const homeJobsBefore=await js("JSON.stringify(state.jobs)");
  await js("applyHomeOrder(HOME_CARD_IDS);persistHomeOrder()");
  const dragPoints=await js("(()=>{const a=document.querySelector('[data-home-handle=focus]').getBoundingClientRect(),b=document.querySelector('[data-home-card=douyin]').getBoundingClientRect();return {from:{x:Math.round(a.left+a.width/2),y:Math.round(a.top+a.height/2)},to:{x:Math.round(b.left+b.width/2),y:Math.round(b.top+100)}}})()");
  wc.sendInputEvent({type:'mouseMove',...dragPoints.from});wc.sendInputEvent({type:'mouseDown',...dragPoints.from,button:'left',clickCount:1});
  wc.sendInputEvent({type:'mouseMove',x:dragPoints.from.x+30,y:dragPoints.from.y+15});await sleep(120);
  check('native pointer drag lifts a card',await js("Boolean(homeDrag?.active&&document.querySelector('.home-drag-preview'))"));
  for(let n=1;n<=12;n++){wc.sendInputEvent({type:'mouseMove',x:Math.round(dragPoints.from.x+(dragPoints.to.x-dragPoints.from.x)*n/12),y:Math.round(dragPoints.from.y+(dragPoints.to.y-dragPoints.from.y)*n/12)});await sleep(15)}
  wc.sendInputEvent({type:'mouseUp',...dragPoints.to,button:'left',clickCount:1});await sleep(350);await js("homeSaveChain");
  check('native card order changes and persists',await js("homeOrder.indexOf('focus')>2&&JSON.stringify(state.home_card_order)===JSON.stringify(homeOrder)"));
  check('native drag preview cleans up',await js("!homeDrag&&!document.querySelector('.home-drag-preview')&&!document.body.classList.contains('home-sorting')"));
  await js("applyHomeOrder(HOME_CARD_IDS);persistHomeOrder()");await js("homeSaveChain");
  check('homepage layout leaves processing jobs unchanged',await js("JSON.stringify(state.jobs)")===homeJobsBefore);
  desk.show();await sleep(150);await wc.capturePage().then(img=>fs.writeFileSync(path.join(app.getPath('userData'),'native-home.png'),img.toPNG()));
  await js("document.querySelector('[data-home-card=later] .tile-record').click()");check('homepage deferred plan opens readable detail',await js("document.getElementById('homedetail').open&&document.getElementById('home-detail-content').textContent.includes('未验收')"));
  await js("document.getElementById('homedetail').close();document.getElementById('douyinmodule').click()");await sleep(300);
  check('module switch preserves mounted library',await js("document.body.dataset.module==='douyin'&&document.querySelectorAll('.card').length===30"));
  check('native window loaded local service',wc.getURL().startsWith(desk.origin));
  check('page contains thirty cards',await js("document.querySelectorAll('.card').length"),30);
  check('native motion preference is detectable',await js("typeof matchMedia('(prefers-reduced-motion:reduce)').matches==='boolean'"));
  await js("api('navigation_motion',{mode:'system'}).then(()=>refresh())");await sleep(100);
  check('system motion mode honors native reduced motion',await js("!matchMedia('(prefers-reduced-motion:reduce)').matches||getComputedStyle(document.getElementById('modulepanel')).transitionDuration==='0s'"));
  await js("api('navigation_motion',{mode:'on'}).then(()=>refresh())");await sleep(100);
  check('explicit app opt-in enables navigation only',await js("document.body.dataset.navigationMotion==='on'&&getComputedStyle(document.getElementById('modulepanel')).transitionDuration.includes('0.34s')"));
  check('scrollbar uses rounded Chromium styling',await js("getComputedStyle(document.querySelector('.workspace')).scrollbarColor==='auto'&&getComputedStyle(document.querySelector('.workspace'),'::-webkit-scrollbar').width==='10px'"));
  const thumbStyle=await js("(()=>{const s=getComputedStyle(document.querySelector('.workspace'),'::-webkit-scrollbar-thumb');return {radius:s.borderRadius,border:s.borderLeftWidth,clip:s.backgroundClip}})()");
  // Chromium rounds physical border pixels at fractional Windows display scales.
  check('scrollbar has a slim rounded thumb',thumbStyle.radius==='999px'&&thumbStyle.clip==='padding-box'&&Math.abs(parseFloat(thumbStyle.border)-2)<.5);
  check('scrollbar track blends into page',await js("getComputedStyle(document.querySelector('.workspace'),'::-webkit-scrollbar-track').backgroundColor==='rgba(0, 0, 0, 0)'"));
  check('native scrollbar arrows are removed',await js("getComputedStyle(document.querySelector('.workspace'),'::-webkit-scrollbar-button').display==='none'"));
  check('dialogs and navigation share scrollbar styling',await js("['.panel-nav','#queuepanel'].every(q=>getComputedStyle(document.querySelector(q),'::-webkit-scrollbar').width==='10px')"));
  desk.show();await sleep(300);await wc.capturePage().then(img=>fs.writeFileSync(path.join(app.getPath('userData'),'native-library.png'),img.toPNG()));
  const scrollPoint=await js("(()=>{const e=document.querySelector('.workspace'),r=e.getBoundingClientRect();return {x:Math.round(r.right-5),y:Math.round(r.top+20)}})()");
  wc.sendInputEvent({type:'mouseMove',...scrollPoint});
  wc.sendInputEvent({type:'mouseDown',...scrollPoint,button:'left',clickCount:1});
  wc.sendInputEvent({type:'mouseMove',x:scrollPoint.x,y:scrollPoint.y+180});
  wc.sendInputEvent({type:'mouseUp',x:scrollPoint.x,y:scrollPoint.y+180,button:'left',clickCount:1});await sleep(150);
  check('custom thumb can still drag the native scroll area',await js("document.querySelector('.workspace').scrollTop>0"));
  await js("document.querySelector('.workspace').scrollTop=0");
  const settingsBefore=await js("(()=>{const w=document.querySelector('.workspace'),r=document.querySelector('.card').getBoundingClientRect();return{client:w.clientWidth,left:r.left,width:r.width}})()");
  await js("document.getElementById('toolsopen').click()");await sleep(100);
  const settingsAfter=await js("(()=>{const w=document.querySelector('.workspace'),r=document.querySelector('.card').getBoundingClientRect();return{client:w.clientWidth,left:r.left,width:r.width}})()");
  console.log('SETTINGS_GEOMETRY',JSON.stringify({before:settingsBefore,after:settingsAfter}));
  check('settings does not resize the background scroll area',settingsBefore.client,settingsAfter.client);
  check('settings does not shift or resize cards',Math.abs(settingsBefore.left-settingsAfter.left)<.1&&Math.abs(settingsBefore.width-settingsAfter.width)<.1);
  await js("document.getElementById('tools').close()");await sleep(100);
  check('closing settings preserves background geometry',await js("document.querySelector('.workspace').clientWidth"),settingsBefore.client);
  wc.sendInputEvent({type:'mouseWheel',x:scrollPoint.x-100,y:scrollPoint.y+150,deltaY:-400,canScroll:true});await sleep(200);
  check('wheel scrolling is preserved',await js("document.querySelector('.workspace').scrollTop>0"));
  await js("document.querySelector('.workspace').scrollTop=0");
  check('no Node in renderer',await js("typeof require==='undefined' && typeof process==='undefined'"));
  const pref=wc.getLastWebPreferences();check('sandbox enabled',pref.sandbox);check('context isolation enabled',pref.contextIsolation);check('Node integration disabled',pref.nodeIntegration,false);
  check('native caption buttons overlay page',await js('navigator.windowControlsOverlay.visible'));
  check('integrated drag strip is forty pixels',await js("document.querySelector('.window-chrome').getBoundingClientRect().height"),40);
  check('title strip can drag window',await js("getComputedStyle(document.querySelector('.window-chrome')).getPropertyValue('app-region')"),'drag');
  check('safe title width respects native buttons',await js("document.querySelector('.window-title').getBoundingClientRect().right<=navigator.windowControlsOverlay.getTitlebarAreaRect().right"));
  check('brand text belongs to first rail',await js("document.querySelector('.module-rail .workspace-name').textContent==='Workdesk'&&getComputedStyle(document.querySelector('.window-title')).display==='none'"));
  check('brand rail extends to top edge',await js("document.querySelector('.module-rail').getBoundingClientRect().top===0&&document.querySelector('.workspace-mark').getBoundingClientRect().top<40"));
  check('brand does not sit behind title drag strip',await js("document.querySelector('.window-chrome').getBoundingClientRect().left>=document.querySelector('.module-rail').getBoundingClientRect().right"));
  check('redundant panel texts removed',await js("!document.querySelector('.panel-heading p')&&!document.querySelector('.panel-footer')&&!document.body.innerText.includes('本机工作台')"));
  // Test inherited visibility and painted glyphs, not only container opacity.
  // A late visibility switch can hide an entire otherwise-correct fade.
  for(const width of [1440,960]){
   w.setContentSize(width,720);await navigationSettled();
   if(await js("document.getElementById('navtoggle').getAttribute('aria-expanded')==='true'")){await js('toggleNavigation()');await navigationSettled()}
   // Sample the middle of the 360ms text fade. A capture near its leading edge
   // may still be the compositor's preceding dark frame; it is not a no-text bug.
   await js('toggleNavigation()');await sleep(180);
   const text=await js("(()=>{const el=document.querySelector('.panel-link>span'),r=el.getBoundingClientRect(),rgb=e=>getComputedStyle(e).backgroundColor.match(/\\d+/g).slice(0,3).map(Number);return {visibility:getComputedStyle(el).visibility,titleVisibility:getComputedStyle(document.querySelector('.panel-heading h2')).visibility,alpha:+getComputedStyle(document.querySelector('.panel-nav')).opacity,panel:rgb(document.getElementById('modulepanel')),row:rgb(el.closest('.panel-link')),rect:r.toJSON(),dpr:devicePixelRatio}})()");
   check(`${width}: native text is visible during the fade`,text.visibility==='visible'&&text.titleVisibility==='visible');
   check(`${width}: native text actually has an intermediate fade`,text.alpha>.02&&text.alpha<.9);
   const image=await wc.capturePage(),png=image.toPNG(),pixels=image.toBitmap();
   const iw=png.readUInt32BE(16),ih=png.readUInt32BE(20);
   assert.equal(pixels.length,iw*ih*4,'Native bitmap pixel dimensions');
   // Compare to the real blended row background, not a palette-specific RGB
   // threshold. Otherwise a quieter dark surface incorrectly reports no glyphs.
   const base=text.panel.map((v,i)=>v*(1-text.alpha)+text.row[i]*text.alpha);
   let ink=0;
   for(let y=Math.max(0,Math.floor(text.rect.top*text.dpr));y<Math.min(ih,Math.ceil(text.rect.bottom*text.dpr));y++){
    for(let x=Math.max(0,Math.floor(text.rect.left*text.dpr));x<Math.min(iw,Math.ceil(text.rect.right*text.dpr));x++){
     const i=(y*iw+x)*4;if(pixels[i+2]-base[0]>5&&pixels[i+1]-base[1]>5&&pixels[i]-base[2]>5)ink++;
    }
   }
   fs.writeFileSync(path.join(app.getPath('userData'),`native-text-${width}.png`),png);
   log.info('PAINTED_TEXT '+JSON.stringify({width,ink,text,image:{width:iw,height:ih}}));
   check(`${width}: actual native screenshot contains partially revealed lettering`,ink>20);
   await navigationSettled();
   check(`${width}: native lettering finishes fully legible`,await js("getComputedStyle(document.querySelector('.panel-nav')).opacity==='1'&&getComputedStyle(document.querySelector('.panel-link>span')).visibility==='visible'"));
  }
  for(const width of [1440,960]){
   w.setContentSize(width,720);await navigationSettled();
   for(const reverse of [false,false,true]){
    const frames=await js(`(async()=>{
     const ws=document.querySelector('.workspace'),button=document.getElementById('navtoggle');
     const sample=()=>{const r=ws.getBoundingClientRect(),s=getComputedStyle(ws);return {right:r.right,viewport:innerWidth,left:r.left,gutter:ws.offsetWidth-ws.clientWidth,transform:s.transform,color:s.scrollbarColor,overflow:document.documentElement.scrollWidth>innerWidth}};
     const frames=[sample()];button.click();const start=performance.now();let reversed=false;
     await new Promise(resolve=>{const tick=now=>{frames.push(sample());if(${reverse}&&!reversed&&now-start>70){button.click();reversed=true}if(now-start<650)requestAnimationFrame(tick);else resolve()};requestAnimationFrame(tick)});
     return frames;
    })()`);
    console.log('NAVIGATION_FRAMES',JSON.stringify({width,reverse,count:frames.length,rightError:Math.max(...frames.map(f=>Math.abs(f.right-f.viewport))),gutters:[...new Set(frames.map(f=>f.gutter))]}));
    check(`${width}/${reverse}: right edge anchored in every animation frame`,frames.every(f=>Math.abs(f.right-f.viewport)<1));
    // offsetWidth/clientWidth are independently rounded at fractional DPI.
    // A one-CSS-pixel quantization is not a change from 10px to native 15px.
    check(`${width}/${reverse}: native scrollbar gutter stable within integer rounding`,frames.every(f=>Math.abs(f.gutter-frames[0].gutter)<=1));
    check(`${width}/${reverse}: scroll frame never translated or restyled`,frames.every(f=>f.transform==='none'&&f.color==='auto'&&!f.overflow));
    check(`${width}/${reverse}: animation actually samples intermediate positions`,frames.length>5&&frames.some(f=>Math.abs(f.left-72)>1&&Math.abs(f.left-312)>1));
   }
  }
  w.setContentSize(1440,920);await navigationSettled();
  if(await js("document.getElementById('modulepanel').inert")){await js("document.getElementById('navtoggle').click()");await navigationSettled()}
  check('no floating navigation dialog',await js("document.getElementById('navdrawer')===null"));
  const originalPanel=await js("document.getElementById('modulepanel').parentElement.id");
  for(const width of [1080,960,800]){
   w.setContentSize(width,720);await sleep(100);
   // Overlay frames can add a two-DIP client inset on Windows; test CSS widths.
   const actualWidth=await js('innerWidth');if(actualWidth!==width)w.setContentSize(width-(actualWidth-width),720);
   await navigationSettled();check(`${width}: viewport within native inset tolerance`,Math.abs(await js('innerWidth')-width)<=2);
   check(`${width}: compact panel starts closed`,await js("document.getElementById('modulepanel').inert"));
   await js("document.getElementById('navtoggle').click()");await navigationSettled();
    const join=await js("({left:document.getElementById('modulepanel').getBoundingClientRect().left,rail:document.querySelector('.module-rail').getBoundingClientRect().right})");
    console.log('NATIVE_PANEL_JOIN',JSON.stringify({width,...join}));
    // Fractional Windows display scales can leave sub-pixel transform rounding.
    check(`${width}: panel joined to rail`,Math.abs(join.left-join.rail)<1);
   check(`${width}: content sits beside panel`,await js("Math.abs(document.querySelector('.workspace').getBoundingClientRect().left-document.getElementById('modulepanel').getBoundingClientRect().right)<1"));
   check(`${width}: navigation never opens a modal`,await js("!document.querySelector('dialog:modal')"));
   check(`${width}: navigation does not lock or blur content`,await js("getComputedStyle(document.querySelector('.workspace')).overflowY==='auto'&&getComputedStyle(document.querySelector('.workspace')).filter==='none'&&getComputedStyle(document.querySelector('.workspace')).backdropFilter==='none'"));
   check(`${width}: scrollbar reaches viewport edge`,await js("Math.abs(document.querySelector('.workspace').getBoundingClientRect().right-innerWidth)<1"));
   check(`${width}: full-height rail and panel below integrated chrome`,await js("document.querySelector('.module-rail').getBoundingClientRect().top===0&&document.getElementById('modulepanel').getBoundingClientRect().top===40"));
   check(`${width}: panel remains in original host`,await js("document.getElementById('modulepanel').parentElement.id"),originalPanel);
   if(width===960)await wc.capturePage().then(img=>fs.writeFileSync(path.join(app.getPath('userData'),'native-compact-open.png'),img.toPNG()));
   await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await navigationSettled();
   check(`${width}: Escape closes and restores rail focus`,await js("document.getElementById('modulepanel').inert&&document.activeElement.id==='navtoggle'"));
  }
  await js("document.getElementById('douyinmodule').click()");await navigationSettled();
  await js("document.querySelector('.workspace').click()");await navigationSettled();
  check('outside click closes attached panel',await js("document.getElementById('modulepanel').inert"));
  await js("document.getElementById('navtoggle').click();document.getElementById('closenav').click()");await navigationSettled();
  check('close button closes attached panel',await js("document.getElementById('modulepanel').inert"));
  await js("document.getElementById('navtoggle').click();document.querySelector('[data-source=local]').click()");await navigationSettled();
  check('source selection closes panel',await js("document.getElementById('modulepanel').inert"));
  check('module and fold control share expanded state',await js("document.getElementById('douyinmodule').getAttribute('aria-expanded')===document.getElementById('navtoggle').getAttribute('aria-expanded')"));
  await js("document.getElementById('douyinmodule').click()");await sleep(50);
  check('panel visibly moves during expansion',await js("(()=>{const p=document.getElementById('modulepanel').getBoundingClientRect(),rail=document.querySelector('.module-rail').getBoundingClientRect();return p.left<rail.right&&p.right>rail.right})()"));
  check('official arrow changes independently of the icon frame',await js("getComputedStyle(document.querySelector('#navtoggle svg')).transform==='none'&&document.querySelector('#navtoggle svg path:last-child').getAnimations().some(a=>a.playState==='running')"));
  await sleep(400);await js("document.getElementById('douyinmodule').click()");await sleep(320);
  check('module button toggles its attached panel closed',await js("document.getElementById('modulepanel').inert"));
  await js("api('navigation_motion',{mode:'off'}).then(()=>refresh())");await sleep(100);
  check('off setting removes panel and icon transitions',await js("getComputedStyle(document.getElementById('modulepanel')).transitionDuration==='0s'&&getComputedStyle(document.querySelector('#navtoggle svg path:last-child')).transitionDuration==='0s'"));
  await js("api('navigation_motion',{mode:'on'}).then(()=>refresh())");await sleep(100);
  await js("document.getElementById('navtoggle').click();document.querySelector('[data-source=favorites]').click()");
  w.setContentSize(1440,920);
  for(let n=0;n<30;n++){await sleep(100);if(await js("!document.getElementById('modulepanel').inert&&Math.abs(document.querySelector('.workspace').getBoundingClientRect().left-312)<1"))break}
  check('wide resize restores joined panel',await js("!document.getElementById('modulepanel').inert&&Math.abs(document.querySelector('.workspace').getBoundingClientRect().left-312)<1"));
  await js("document.getElementById('navtoggle').click()");await navigationSettled();
  check('wide collapse frees content space',await js("document.getElementById('modulepanel').inert&&Math.abs(document.querySelector('.workspace').getBoundingClientRect().left-72)<1"));
  await js("document.getElementById('navtoggle').click()");await navigationSettled();
  await js("toggleNavigation();navigationAnimations[0]?.cancel()");await sleep(800);
  check('native external effect interruption restores usable flow',await js("!navigationReflow&&!document.body.classList.contains('nav-moving')&&navigationAnimations.length===0&&[...document.querySelectorAll('.card')].every(c=>getComputedStyle(c).position==='static')"));
  await js('toggleNavigation()');await navigationSettled();
  const reflow=await js(`(async()=>{
   const nodes=[...document.querySelectorAll('.card')],before=gridColumnCount(),frames=[],start=performance.now();
   document.getElementById('navtoggle').click();while(performance.now()-start<750){await new Promise(requestAnimationFrame);
    frames.push({moving:!!navigationReflow,rects:nodes.map(c=>{const r=c.getBoundingClientRect();return [r.left,r.top,r.width,r.height]}),opaque:nodes.every(c=>+getComputedStyle(c).opacity===1),glyph:[...document.querySelectorAll('.rail-symbol svg')].reduce((n,c)=>n+(+getComputedStyle(c).opacity),0),right:document.querySelector('.workspace').getBoundingClientRect().right});
   }
   const n=frames.findIndex((f,i)=>i>0&&!f.moving&&frames[i-1].moving);
   return {before,after:gridColumnCount(),frames:frames.length,opaque:frames.every(f=>f.opaque),glyph:Math.min(...frames.map(f=>f.glyph)),edge:Math.max(...frames.map(f=>Math.abs(f.right-innerWidth))),endJump:n<0?999:Math.max(...frames[n].rects.flatMap((r,i)=>r.map((v,j)=>Math.abs(v-frames[n-1].rects[i][j])))),identity:nodes.every((c,i)=>c===document.querySelectorAll('.card')[i]),clean:!navigationReflow&&nodes.every(c=>getComputedStyle(c).position==='static')};
  })()`);
  log.info('NATIVE_GRID_REFLOW '+JSON.stringify(reflow));
  check('native columns change continuously across many frames',reflow.before!==reflow.after&&reflow.frames>20);
  check('native cards remain fully opaque and mounted',reflow.opaque&&reflow.identity);
  check('native glyph never flashes between delayed phases',reflow.glyph>.98);
  check('native reflow has no final geometry jump or stuck layout',reflow.clean&&reflow.endJump<2&&reflow.edge<1);
  await js("document.getElementById('navtoggle').click()");await navigationSettled();
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
  check('modal keeps background scroll locked',await js("getComputedStyle(document.querySelector('.workspace')).overflowY==='hidden'"));
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
  log.info(`Native smoke: ${checks.length} checks passed`);await desk.quit();
 }catch(e){log.error(e.stack);try{await desk.stopBackend()}catch{};app.exit(1)}
})();
