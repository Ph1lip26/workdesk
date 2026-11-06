// Synthetic UI responses only: this test must not consume model quota.
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(path.basename(process.env.WORKDESK_HOME||'')!=='native-test')throw Error('Synthetic fixture required');
const payload=process.env.WORKDESK_TEST_PAYLOAD;
if(payload){Object.defineProperty(app,'isPackaged',{value:true});Object.defineProperty(process,'resourcesPath',{value:path.join(path.resolve(payload),'resources')})}
const desk=require(payload?path.join(process.resourcesPath,'app.asar/desktop/main.cjs'):'../desktop/main.cjs'),wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name)};
(async()=>{try{
 await desk.startup;const w=desk.window,wc=w.webContents;wc.setBackgroundThrottling(false);
 const js=s=>wc.executeJavaScript(s.includes('await ')?'(async()=>{'+s+'})()':s).catch(e=>{fs.writeFileSync(path.join(process.env.WORKDESK_HOME,'summary-ui-expression.log'),s);throw e});
 for(let i=0;i<100;i++){if(await js("typeof summaryState!=='undefined'&&homeState?.configured&&purchaseState"))break;await wait(100)}
 await js("await api('purchase_save',{record:{title:'Synthetic summary decision',status:'research',origin:'user',needs:'Synthetic manual needs'}});await refreshPurchases()");
 desk.show();w.setContentSize(1180,760);await wait(350);
 check('six concise cards replace raw subject table',await js("document.querySelectorAll('[data-home-card]').length===6&&!document.querySelector('.status-grid')&&$('home-current-brief')&&$('home-next-brief')"));
 check('fresh opening reads cache only',await js("summaryState.records.length===0&&!summaryState.running"));
 await js("window.__realAPI=api;window.__summaryCalls=[];window.__summaryFake={records:[],running:false};window.__manualBefore=JSON.stringify(purchaseState.records);api=async(name,data)=>{if(name==='summary_refresh'){window.__summaryCalls.push(data.scope);window.__summaryFake={running:true,records:[{scope:data.scope,status:'running',phase:'generating',updated:0,result:{},sources:[]}]};return {ok:true,status:'running',message:'Synthetic generation'}}if(name==='summaries')return window.__summaryFake;return window.__realAPI(name,data)};$('home-refresh').click();$('home-refresh').click()");await wait(250);
 check('double click starts a single refresh and reports busy',await js("window.__summaryCalls.length===1&&$('home-refresh').disabled&&$('summary-home-status').textContent.includes('Codex')"));
 await js("window.__evidence=[{source_id:'s1',quote:'Synthetic dated source evidence'}];window.__summaryFake={running:false,records:[{scope:'home',status:'completed',updated:100,result:{items:[{key:'current',record_id:'',text:'当前专注既定主线，优先处理已有记录中的问题。',when:'',kind:'fact',evidence:window.__evidence},{key:'next',record_id:'',text:'继续已确认的近期安排。',when:'明确条件满足后',kind:'condition',evidence:window.__evidence},{key:'purchase',record_id:purchaseState.records[0].id,text:'暂缓购买，等待条件满足再评估。',when:'',kind:'condition',evidence:window.__evidence}],warnings:[]},sources:[{id:'s1',title:'Synthetic source',path:'',excerpt:true}]}]};await loadSummaries()");
 check('summary updates current, upcoming and purchasing cards',await js("$('home-current-brief').textContent.includes('当前专注')&&$('home-next-brief').textContent.includes('近期安排')&&$('home-purchases-summary').textContent.includes('暂缓购买')"));
 await js('renderHomepageSummary()');
 check('ordinary polling does not restore verbose purchase counters',await js("$('home-purchases-summary').textContent.includes('暂缓购买')&&!$('home-purchases-summary').querySelector('.collection-total')"));
 await js("$('home-current-brief').querySelector('[data-summary-scope]').click()");
 check('evidence inspector is explicit and quotes source',await js("$('homedetail').open&&$('home-detail-content').textContent.includes('Synthetic dated source evidence')"));await js("$('homedetail').close()");
 for(const theme of ['night','day']){await js(`paintAppearance('${theme}')`);await wait(100);fs.writeFileSync(path.join(process.env.WORKDESK_HOME,'summary-home-'+theme+'.png'),(await wc.capturePage()).toPNG())}
 await js("selectModule('purchases',{animate:false});paintSummaries();$('purchase-refresh').click()");await wait(200);
 check('purchase refresh targets selected record',await js("window.__summaryCalls[1]==='purchase:'+purchaseSelectedId"));
 await js("window.__summaryFake.records=[{scope:'purchase:'+purchaseSelectedId,status:'completed',updated:200,result:{items:[{key:'detail',record_id:purchaseSelectedId,text:'这是关联笔记更新后的结论摘要。',when:'',kind:'fact',evidence:window.__evidence}],warnings:['Synthetic warning']},sources:[{id:'s1',title:'Synthetic source',path:'',excerpt:false}]}];window.__summaryFake.running=false;window.__summaryFake.records[0].status='completed';await loadSummaries()");
 check('purchase detail really shows fresh source summary',await js("$('purchase-ai-summary').textContent.includes('更新后的结论')&&$('purchase-list').textContent.includes('手动记录')"));
 check('AI refresh leaves all manual purchase fields intact',await js("JSON.stringify(purchaseState.records)===window.__manualBefore"));
 await js("window.__summaryFake.records[0].status='failed';window.__summaryFake.records[0].error='Synthetic quota failure';await loadSummaries()");
 check('failure preserves old summary with clear error',await js("$('purchase-ai-summary').textContent.includes('Synthetic quota failure')&&$('purchase-ai-summary').textContent.includes('更新后的结论')"));
 await js('paintSidebarSelection()');await wait(300);
 check('secondary selection has one shared highlight',await js("document.querySelectorAll('#panel-selection').length===1&&!$('panel-selection').hidden"));
 check('cached rendering never launches another generation',await js('window.__summaryCalls.length===2'));
 fs.writeFileSync(path.join(process.env.WORKDESK_HOME,'summary-purchase.png'),(await wc.capturePage()).toPNG());
 await js('api=window.__realAPI;clearTimeout(summaryPoll)');
 fs.writeFileSync(path.join(process.env.WORKDESK_HOME,'summary-ui-smoke.json'),JSON.stringify({ok:true,checks},null,2));await desk.quit();
}catch(e){fs.writeFileSync(path.join(process.env.WORKDESK_HOME,'summary-ui-error.log'),e.stack);try{await desk.stopBackend()}catch{}app.exit(1)}})();
