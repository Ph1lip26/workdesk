// Isolated synthetic fixture only. No login, live vault, or real queue operations.
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createSmokeLogger}=require('./smoke_io.cjs');
const home=process.env.WORKDESK_HOME;
if(!home||path.basename(home)!=='native-test')throw Error('Synthetic native-test fixture required');
const log=createSmokeLogger(path.join(home,'integrated-review.log'));
const desk=require(process.env.WORKDESK_REVIEW_DESKTOP||'../desktop/main.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],measurements=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);log.info('PASS '+name)};
(async()=>{try{
 await desk.startup;const w=desk.window,wc=w.webContents;wc.setBackgroundThrottling(false);
 const errors=[];const js=s=>wc.executeJavaScript(s).catch(e=>{log.error('RENDERER '+s+' '+JSON.stringify(errors));throw e});wc.on('console-message',details=>{if(details?.level==='error'){errors.push(details.message);log.error(details.message)}});
 for(let i=0;i<80;i++){if(await js("typeof homeState!=='undefined'&&homeState?.configured&&state"))break;await wait(100)}
 desk.show();w.setContentSize(1440,900);await wait(500);
 const baseline=!!process.env.WORKDESK_REVIEW_DESKTOP;
 if(!baseline){
  check('initial library filter is unsaved',await js("$('status').value==='new'&&[...$('cards').children].every(c=>c.dataset.status!=='done')"));
  await js("window.__savedJobs=state.jobs;state.jobs=['queued','running','needs_review','failed','cancelled','completed','skipped'].map((status,i)=>({id:'fixture-queue-'+i,video:state.videos[0].id,status,message:'Synthetic queue'}));render();openQueuePage()");
  check('queue shows only five unfinished statuses with matching count',await js("$('jobs').children.length===5&&$('queuecount').textContent==='5'&&!$('jobs').querySelector('.badge.done')"));
  check('history retained and queue title unchanged',await js("state.jobs.length===7&&$('queuepanel').querySelector('h1').textContent==='处理队列'"));
  await js("state.jobs=state.jobs.map(j=>({...j,status:'completed'}));render()");
  check('completion clears current view but not history',await js("state.jobs.length===7&&$('jobs').querySelector('.queue-empty')&&$('queuecount').hidden"));
  await js("state.jobs=window.__savedJobs;render();selectSource('favorites')");
 }
 if(!baseline){for(const [day,value] of [['2025-01-01','90'],['2025-01-05','89.8'],['2025-01-10','89.5']])await js(`api('health_save',{day:'${day}',value:'${value}',unit:'kg'})`);await js('refreshHealth()')}
 // Same fixture, viewport, navigation sequence and frame sampling for both builds.
 await js("selectModule('douyin',{animate:false});updateNavigationMotion('on')");await wait(600);
 for(let i=0;i<6;i++){
  measurements.push(await js(`new Promise(resolve=>{let ts=[],start=performance.now();function frame(t){ts.push(t);if(t-start<650)requestAnimationFrame(frame);else resolve({intervals:ts.slice(1).map((t,i)=>t-ts[i]),elapsed:performance.now()-start})}requestAnimationFrame(frame);toggleNavigation()})`));
  await wait(150);
 }
 if(!baseline){
  for(const theme of ['day','night']){
   await js(`paintAppearance('${theme}');selectModule('home',{animate:false})`);await wait(300);
   check(theme+' six cards keep one material',await js("(()=>{const s=[...document.querySelectorAll('.home-tile')].map(e=>getComputedStyle(e));return s.length===6&&new Set(s.map(x=>x.backgroundImage)).size===1&&new Set(s.map(x=>x.backgroundColor)).size===1&&s.every(x=>x.backdropFilter==='none')})()"));
   check(theme+' fonts consistent',await js("[...document.querySelectorAll('.home-tile h2,.home-tile p')].every(e=>getComputedStyle(e).fontFamily===getComputedStyle(document.body).fontFamily)"));
   check(theme+' neutral surface with readable text',await js("(()=>{const s=getComputedStyle(document.querySelector('.home-tile')),rgb=v=>v.match(/[\\d.]+/g).slice(0,3).map(Number),lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0),bg=rgb(s.backgroundColor),fg=rgb(s.color),a=lum(bg),b=lum(fg);return new Set(bg).size===1&&(Math.max(a,b)+.05)/(Math.min(a,b)+.05)>4.5})()"));
   fs.writeFileSync(path.join(home,'integrated-home-'+theme+'.png'),(await wc.capturePage()).toPNG());
   check(theme+' no noisy texture on cards or selected rail',await js("[...document.querySelectorAll('.home-tile,.rail-button.active')].every(e=>!getComputedStyle(e).backgroundImage.includes('data:image'))"));
   await js("$('tools').showModal()");await wait(350);
   check(theme+' glass has real backdrop blur and translucent fill',await js("(()=>{const s=getComputedStyle($('tools'));return s.backdropFilter.includes('blur(22px)')&&s.backgroundColor.startsWith('rgba(')&&s.backgroundImage.includes('linear-gradient')})()"));
   fs.writeFileSync(path.join(home,'integrated-glass-'+theme+'.png'),(await wc.capturePage()).toPNG());
   await js("$('tools').close()");
   await js("selectModule('douyin',{animate:false});selectSource('favorites');window.__beforePage=pageNumber;window.__beforeSelection=[...selection];document.querySelector('[data-work-detail]').click()");await wait(100);
   check(theme+' nonmodal details without selection change',await js("!!workDetailID&&!$('work-detail').hidden&&!document.querySelector('dialog:modal')&&JSON.stringify([...selection])===JSON.stringify(window.__beforeSelection)"));
   check(theme+' wide master/detail retains list',await js("!$('librarypage').classList.contains('work-detail-full')&&!$('library').inert"));
   fs.writeFileSync(path.join(home,'integrated-detail-'+theme+'.png'),(await wc.capturePage()).toPNG());
   w.setContentSize(900,700);await wait(200);
   check(theme+' narrow detail is a page',await js("$('librarypage').classList.contains('work-detail-full')&&$('library').inert&&getComputedStyle($('work-detail')).position==='relative'"));
   await js("closeWorkDetail()");
   check(theme+' returning preserves page and list focus',await js("pageNumber===window.__beforePage&&!$('library').inert&&document.activeElement.matches('[data-work-detail]')"));
   w.setContentSize(1440,900);await wait(150);
   await js("selectModule('purchases',{animate:false})");await wait(200);
   check(theme+' purchase prose stays bounded',await js("document.querySelector('.purchase-detail-grid').getBoundingClientRect().width<=781"));
   fs.writeFileSync(path.join(home,'integrated-purchase-'+theme+'.png'),(await wc.capturePage()).toPNG());
   await js("selectModule('health',{animate:false});refreshHealth()");await wait(200);
   check(theme+' main chart not icon-sized',await js("document.querySelector('.health-trend .weight-chart').getBoundingClientRect().height>=180"));
   fs.writeFileSync(path.join(home,'integrated-health-'+theme+'.png'),(await wc.capturePage()).toPNG());
  }
  await js("selectModule('home',{animate:false});window.__chart=document.querySelector('#home-health-summary svg');renderHomepageSummary()");
  check('unrelated summary refresh preserves mounted weight chart',await js("window.__chart===document.querySelector('#home-health-summary svg')"));
  for(const size of [[1180,730],[800,560]]){
   w.setContentSize(...size);await wait(200);
   check(size.join('x')+' no horizontal overflow',await js("document.querySelector('.workspace').scrollWidth<=document.querySelector('.workspace').clientWidth+1"));
  }
  await js("selectModule('douyin',{animate:false});updateNavigationMotion('on');toggleNavigation()");await wait(60);await js('toggleNavigation()');await wait(65);await js('toggleNavigation()');await wait(600);
  check('rapid reversal restores normal flow',await js("!navigationReflow&&!document.body.classList.contains('nav-moving')&&[...$('cards').children].every(e=>!e.style.position)"));
  await js("updateNavigationMotion('off');toggleNavigation()");
  check('motion off settles immediately',await js('!navigationReflow'));
  check('no renderer errors',errors.length===0);
 }
 const intervals=measurements.flatMap(m=>m.intervals).sort((a,b)=>a-b);
 const result={ok:true,baseline,checks,frames:intervals.length,p95:intervals[Math.floor(intervals.length*.95)],over50:intervals.filter(t=>t>50).length,processMetrics:app.getAppMetrics().map(m=>({type:m.type,cpu:m.cpu,memory:m.memory})),measurements};
 fs.writeFileSync(path.join(home,baseline?'integrated-baseline.json':'integrated-result.json'),JSON.stringify(result,null,2));await desk.quit();
}catch(e){log.error(e.stack);try{await desk.stopBackend()}catch{}app.exit(1)}})();
