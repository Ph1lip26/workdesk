const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const elements={search:{value:''},status:{value:'all'},sort:{value:'collection'}};
const context=vm.createContext({document:{querySelector:()=>({content:'test-token'}),getElementById:id=>elements[id]},Set,Map,Number});
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
test('saved order is not publication or numeric ID order',()=>assert.deepEqual(get('visible().map(v=>v.id)').slice(0,2),['1000000000000000000','1000000000000000004']));
test('known publication newest first, unknown last',()=>{elements.sort.value='published';assert.deepEqual(get('visible().map(v=>v.published_at)'),[30,20,10,0]);elements.sort.value='collection'});
test('raw or processed note marks saved',()=>{elements.status.value='done';assert.deepEqual(get('visible().map(v=>v.id)'),['1000000000000000000','1000000000000000004']);assert.equal(get('videoState(state.videos[1]).key'),'done')});
test('unsaved excludes both raw and processed notes',()=>{elements.status.value='new';assert.deepEqual(get('visible().map(v=>v.id)'),['1000000000000000003','1000000000000000002'])});
test('raw-only can distill but note and running item cannot enqueue',()=>{assert.equal(get('eligible(state.videos[1])'),true);assert.equal(get('eligible(state.videos[0])'),false);assert.equal(get('eligible(state.videos[2])'),false)});
test('folder source order, not main order',()=>{elements.status.value='all';vm.runInContext("folder='f'",context);assert.deepEqual(get('visible().map(v=>v.id)'),['1000000000000000004','1000000000000000000']);vm.runInContext("folder=''",context)});
test('search composes with saved status and view',()=>{elements.search.value='甲';elements.status.value='done';assert.equal(get('visible().length'),1);elements.search.value='乙';assert.equal(get('visible().length'),1);elements.status.value='new';assert.equal(get('visible().length'),0);elements.search.value='';elements.status.value='all'});
test('image posts can enqueue; local view separated',()=>{assert.equal(get('eligible(state.videos[4])'),true);vm.runInContext("view='local'",context);assert.equal(get('visible().length'),5)});
test('pagination renders thirty and preserves exact slices',()=>{vm.runInContext('pageNumber=1',context);const ids=Array.from({length:65},(_,i)=>i);context.pageFixture=ids;assert.deepEqual(get('pageSlice(pageFixture)'),ids.slice(0,30));vm.runInContext('pageNumber=2',context);assert.deepEqual(get('pageSlice(pageFixture)'),ids.slice(30,60));vm.runInContext('pageNumber=3',context);assert.deepEqual(get('pageSlice(pageFixture)'),ids.slice(60))});
test('filter shrink and empty result clamp page safely',()=>{assert.deepEqual(get('pageSlice([1,2])'),[1,2]);assert.equal(get('pageNumber'),1);vm.runInContext('pageNumber=99',context);assert.deepEqual(get('pageSlice([])'),[]);assert.equal(get('pageNumber'),1)});
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
console.log(passed+' frontend logic tests passed.');
