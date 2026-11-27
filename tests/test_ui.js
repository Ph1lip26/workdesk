const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const elements={search:{value:''},status:{value:'all'},sort:{value:'collection'}};
const context=vm.createContext({document:{querySelector:()=>({content:'test-token'}),getElementById:id=>elements[id]},Set,Map,Number,URL,URLSearchParams});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../backend/static/app.js'),'utf8').split('function render(){')[0],context);
const fixture={videos:[
{id:'1000000000000000000',title:'旧视频最近收藏',author:'甲',favorite:1,favorite_position:0,published_at:10,note:'处理文件/AI学习/笔记.md',raw:'原始资料/底稿.md',kind:'video'},
{id:'1000000000000000004',title:'新发布较早收藏',author:'乙',favorite:1,favorite_position:1,published_at:30,note:'',raw:'原始资料/底稿2.md',kind:'video'},
{id:'1000000000000000003',title:'正在处理',author:'丙',favorite:1,favorite_position:2,published_at:20,note:'',raw:'',kind:'video'},
{id:'1000000000000000001',title:'本地素材',author:'丁',favorite:0,favorite_position:null,published_at:0,note:'',raw:'',kind:'video'},
{id:'1000000000000000002',title:'图文',author:'戊',favorite:1,favorite_position:3,published_at:0,note:'',raw:'',kind:'images'}
],jobs:[{video:'1000000000000000003',status:'running'}],membership:[{folder:'f',video:'1000000000000000004',position:0},{folder:'f',video:'1000000000000000000',position:1}]};
vm.runInContext('state='+JSON.stringify(fixture),context);
const get=expr=>JSON.parse(JSON.stringify(vm.runInContext(expr,context)));
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name)};
test('hidden windows do not poll even with active work',()=>{assert.equal(get('statePollDelay(state,true)'),0)});
test('repeated background read failures back off until next successful read',()=>{
 assert.equal(get('statePollDelay(state,false,1)'),5000);
 assert.equal(get('statePollDelay(state,false,3)'),20000);
 assert.equal(get('statePollDelay(state,false,40)'),60000);
 assert.equal(get('statePollDelay(state,true,40)'),0);
});
test('visible idle polling is slower but active jobs and login retain fast updates',()=>{
 assert.equal(get('statePollDelay({jobs:[]},false)'),15000);
 for(const state of [{jobs:[{status:'queued'}]},{jobs:[{status:'running'}]},{syncing:true},{authchecking:true},null]){
  context.pollFixture=state;assert.equal(get('statePollDelay(pollFixture,false)'),3500);
 }
 assert.equal(get("statePollDelay({jobs:[{status:'needs_review'},{status:'failed'}]},false)"),15000);
});
test('raw-only can distill but note and running item cannot enqueue',()=>{assert.equal(get('eligible(state.videos[1])'),true);assert.equal(get('eligible(state.videos[0])'),false);assert.equal(get('eligible(state.videos[2])'),false)});
test('saved notes remain selectable for action ideas without becoming enqueue-eligible',()=>{assert.equal(get('selectable(state.videos[0])'),true);assert.equal(get('eligible(state.videos[0])'),false);assert.equal(get('selectable(state.videos[2])'),false)});
test('explicit login failure offers login instead of generic error',()=>{const n=get("syncNotice({error_code:'login_required'},{logged_in:false},165)");assert.equal(n.needsLogin,true);assert.match(n.message,/165/);assert.match(n.message,/尚未登录/)});
test('confirmed login does not keep stale login prompt',()=>{const n=get("syncNotice({error_code:'login_required'},{logged_in:true},165)");assert.equal(n.needsLogin,false);assert.match(n.message,/登录已确认/)});
test('network failure is not called login expiry',()=>{const n=get("syncNotice({error_code:'read_failed'},{logged_in:false,error_code:'auth_check_failed'},165)");assert.equal(n.needsLogin,false);assert.doesNotMatch(n.message,/尚未登录/)});
test('brand ink optical center ignores transparent canvas and dark background',()=>{
 const pixels=new Uint8ClampedArray(8*4);for(let x=0;x<8;x++)pixels[x*4+3]=255;
 for(const x of [2,3,4])for(let c=0;c<3;c++)pixels[x*4+c]=255;
 context.brandPixels=Array.from(pixels);assert.equal(get('brandInkShift(brandPixels,8,1)'),.0625);
});
test('symmetric light ink stays centered and empty branding stays safe',()=>{
 context.brandPixels=Array.from({length:8*4},(_,i)=>[2,5].includes(Math.floor(i/4))?255:0);
 assert.ok(Math.abs(get('brandInkShift(brandPixels,8,1)'))<1e-10);
 assert.equal(get('brandInkShift(new Array(32).fill(0),8,1)'),0);
});
test('unbalanced branding cannot shift out of its logo slot',()=>{
 context.brandPixels=Array.from({length:8*4},(_,i)=>i<4?255:0);
 assert.equal(get('brandInkShift(brandPixels,8,1)'),.12);
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../backend/static/purchases.js'),'utf8').split('function renderPurchases(){')[0],context);
elements['purchase-search']={value:''};elements['purchase-filter']={value:'all'};
const purchaseFixture={records:[{id:'a',title:'合成设备',category:'数码',needs:'轻便',conclusion:'等待正式信息',wait_condition:'公布后核实',status:'waiting',origin:'advice',budget:'100元',updated:'2026-01-01',candidates:[{name:'测试候选',price:'90元',channel:'合成渠道',checked_at:'2025-01-01'}]},{id:'b',title:'测试配件',category:'设备',needs:'耐用',conclusion:'已选定',wait_condition:'',status:'decided',origin:'user',candidates:[]}]};
vm.runInContext('purchaseState='+JSON.stringify(purchaseFixture),context);
test('purchase search composes with explicit status',()=>{elements['purchase-search'].value='测试候选';assert.equal(get('purchaseVisible().length'),1);elements['purchase-filter'].value='decided';assert.equal(get('purchaseVisible().length'),0);elements['purchase-filter'].value='all';elements['purchase-search'].value=''});
test('purchase context preserves provenance and dated price boundary',()=>{const brief=get('purchaseBrief(purchaseState.records[0])');assert.match(brief,/AI建议/);assert.match(brief,/2025-01-01/);assert.match(brief,/不是实时市场信息/);assert.match(brief,/不替我作购买决定/)});
test('purchase context has no assumed release date or final model',()=>{const brief=get('purchaseBrief(purchaseState.records[0])');assert.match(brief,/未指定，按条件回看/);assert.match(brief,/不代表发布日期或购买承诺/)});
test('purchase context remains text and never renders markup',()=>{context.recordWithMarkup={...purchaseFixture.records[0],title:'<script>not executable</script>'};assert.match(get('purchaseBrief(recordWithMarkup)'),/<script>not executable<\/script>/)});
test('decision selection survives refresh and safely falls back under filtering',()=>{
 vm.runInContext("purchaseSelectedId='b'",context);assert.equal(get('selectedPurchase().id'),'b');
 elements['purchase-filter'].value='waiting';assert.equal(get('selectedPurchase().id'),'a');
 elements['purchase-search'].value='does not exist';assert.equal(get('selectedPurchase()'),null);
 elements['purchase-search'].value='';elements['purchase-filter'].value='all';vm.runInContext("purchaseSelectedId='missing'",context);assert.equal(get('selectedPurchase().id'),'a');
});
test('decision detail escapes saved text while preserving complete fields',()=>{
 context.detailFixture={...purchaseFixture.records[0],needs:'<script>private text</script>',questions:'Full unanswered question',review_date:''};
 const html=get('purchaseDetail(detailFixture)');assert.match(html,/&lt;script&gt;private text&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Full unanswered question/);assert.match(html,/2025-01-01/);assert.match(html,/90元/);
});
test('detail links reject local schemes, script schemes and embedded credentials',()=>{
 for(const url of ['javascript:alert(1)','file:///private','https://user:password@example.com']){context.linkFixture=url;assert.equal(get("purchaseLink(linkFixture,'资料')"),'')}
 context.linkFixture='https://example.com/item?q=a&b=c';assert.match(get("purchaseLink(linkFixture,'资料')"),/noopener noreferrer/);assert.match(get("purchaseLink(linkFixture,'资料')"),/&amp;/);
});
test('refresh feedback distinguishes elapsed work, partial proof and success',()=>{
 const running=get("syncFeedback({syncing:true,progress:{started:100,phase:'favorites',message:'Reading 12'},sync:{}},145000)");
 assert.equal(running.running,true);assert.match(running.title,/12/);assert.match(running.detail,/45/);
 const partial=get("syncFeedback({syncing:false,sync:{ok:true,complete:true,folders_complete:false,count:12,updated:123,duration:7.4}})");
 assert.match(partial.title,/完整性待核验/);assert.doesNotMatch(partial.title,/刷新完成/);assert.match(partial.detail,/7/);
 const complete=get("syncFeedback({syncing:false,sync:{ok:true,complete:true,folders_complete:true,count:12,updated:123,duration:7.4}})");
 assert.match(complete.title,/刷新完成/);assert.match(complete.title,/12/);
 const failed=get("syncFeedback({syncing:false,sync:{ok:false,updated:123}})");assert.match(failed.title,/原有收藏已保留/);
});
test('current queue hides success without mutating history',()=>{
 const jobs=['queued','running','needs_review','failed','cancelled','completed','skipped'].map((status,i)=>({id:String(i),status}));
 context.queueFixture=jobs;
 assert.deepEqual(get('queueItems(queueFixture).map(j=>j.status)'),['queued','running','needs_review','failed','cancelled']);
 assert.equal(jobs.length,7);assert.equal(get('queueItems([]).length'),0);
});
test('library defaults to unsaved with all and saved still available',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../backend/static/index.html'),'utf8');
 assert.match(html,/<option value="new" selected>/);assert.match(html,/<option value="all">/);assert.match(html,/<option value="done">/);
});
test('catalog sends filters and selection instead of loading all metadata',()=>{
 elements.status.value='raw';elements.search.value='合成';
 vm.runInContext("pageNumber=2;folder='f';selection.add(state.videos[1].id)",context);
 const query=new URLSearchParams(get('windowQuery().toString()'));
 assert.equal(query.get('paged'),'1');assert.equal(query.get('page'),'2');assert.equal(query.get('folder'),'f');
 assert.equal(query.get('filter'),'raw');assert.equal(query.get('q'),'合成');
 assert.equal(query.get('include'),fixture.videos[1].id);assert.equal(get('eligible(state.videos[1])'),true);
});
test('shared draft guard routes backdrop and Escape without bypassing the editor',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../backend/static/app.js'),'utf8');
 const section=code.slice(code.indexOf('const editorIds='),code.indexOf("window.addEventListener('beforeunload'"));
 const listeners={};let guarded=0,dirty=true;
 const dialog={open:true,addEventListener:(event,fn)=>listeners[event]=fn,getBoundingClientRect:()=>({left:10,right:50,top:10,bottom:50})};
 const vmContext=vm.createContext({$:()=>dialog,dialog,pending:()=>dirty,requestClose:()=>{guarded++}});
 vm.runInContext(section+"bindEditor('weighteditor',requestClose,pending)",vmContext);
 const e={target:dialog,isPrimary:true,pointerId:1,clientX:2,clientY:2,preventDefault(){}};
 assert.equal(vm.runInContext('hasPendingEditor()',vmContext),true);
 listeners.pointerup(e);assert.equal(guarded,0);
 listeners.pointerdown(e);listeners.pointerup(e);listeners.cancel(e);assert.equal(guarded,2);assert.equal(dialog.open,true);
 dirty=false;assert.equal(vm.runInContext('hasPendingEditor()',vmContext),false);
});
console.log(passed+' frontend logic tests passed.');
