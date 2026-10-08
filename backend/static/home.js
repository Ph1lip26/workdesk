/* Taste read: quiet personal status tiles, not a report or a KPI wall.
   Homepage content is read-only. Reordering persists only generic tile IDs. */
const moduleRegistry={home:{title:'首页',view:'homeview',nav:null,button:'homemodule'},douyin:{title:'抖音收藏',view:'douyinview',nav:'douyinnav',button:'douyinmodule'}};
const HOME_CARD_IDS=['status','next','focus','douyin','later','materials'];
let currentModule='home',homeState=null,homeFingerprint='',homeBusy=false,homeDetail=null;
let homeOrder=[...HOME_CARD_IDS],homeSavedOrder=[...HOME_CARD_IDS],homePendingSaves=0,homeSaveChain=Promise.resolve(),homeDrag=null,homeDeferredRender=false;
const homeFlipAnimations=new Map(),homeLandingGhosts=new Set(),moduleScroll={home:0,douyin:0};
const homeArrow=document.querySelector('#enqueue svg').outerHTML,homeRefresh=document.querySelector('#sync svg').outerHTML;
const homeGrip='<svg data-lucide="grip-vertical" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" /></svg>';
const sourceMeta=id=>homeState?.sources.find(s=>s.id===id);
const sourceDate=id=>sourceMeta(id)?.updated||'日期未提供';
const sourceButton=(id,label='打开资料')=>'<button class="home-source quiet" data-home-source="'+esc(id)+'" '+(sourceMeta(id)?.available?'':'disabled')+'>'+esc(label)+homeArrow+'</button>';
const validHomeOrder=order=>Array.isArray(order)&&order.length===HOME_CARD_IDS.length&&order.every(x=>HOME_CARD_IDS.includes(x))&&new Set(order).size===order.length;
function selectModule(name,{animate=true}={}){
 if(!moduleRegistry[name])return;
 finishHomeDrag(true);homeLandingGhosts.forEach(g=>g.remove());homeLandingGhosts.clear();
 const ws=document.querySelector('.workspace');moduleScroll[currentModule]=ws.scrollTop;
 stopNavigationAnimation();currentModule=name;document.body.dataset.module=name;
 for(const [key,m] of Object.entries(moduleRegistry)){
  $(m.view).hidden=key!==name;if(m.nav)$(m.nav).hidden=key!==name;
  $(m.button).classList.toggle('active',key===name);
  if(key===name)$(m.button).setAttribute('aria-current','page');else $(m.button).removeAttribute('aria-current');
 }
 $('paneltitle').textContent=moduleRegistry[name].title;
 $('modulepanel').setAttribute('aria-label',moduleRegistry[name].title+'导航');
 $('selectionbar').hidden=name!=='douyin'||!selection.size;
 document.querySelector('.skip-link').href=name==='home'?'#homeview':'#library';
 document.querySelector('.skip-link').textContent=name==='home'?'跳到首页内容':'跳到作品列表';
 document.title='Workdesk · '+moduleRegistry[name].title;history.replaceState(null,'','#'+name);
 updateNavigationToggle();ws.scrollTop=moduleScroll[name];
 if(name==='home'){refreshHomepage();renderHomepageSummary()}
 if(animate&&navigationMotionEnabled())$(moduleRegistry[name].view).animate([{opacity:.4,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'cubic-bezier(.22,1,.36,1)'});
}
function homeTile(id,title,body,footer='',wide=false){
 const moduleCard=id==='douyin'||id==='materials';
 return '<article class="home-tile '+(wide?'home-tile-wide':'')+(moduleCard?' home-module-card':'')+'" data-home-card="'+id+'" role="listitem" aria-label="'+esc(title)+'"'+(moduleCard?' data-module-route="douyin"':'')+'><div class="tile-heading"><h2>'+esc(title)+'</h2><button class="tile-handle" data-home-handle="'+id+'" aria-label="调整'+esc(title)+'的位置" aria-describedby="home-drag-help" aria-pressed="false" title="拖动换位置；空格开始，方向键移动，回车确认">'+homeGrip+'</button></div><div class="tile-body">'+body+'</div>'+(footer?'<div class="tile-foot">'+footer+'</div>':'')+'</article>';
}
function homeRows(entries,kind,{compact=false}={}){
 return entries.map(item=>'<button class="tile-record '+(compact?'tile-record-compact':'')+'" data-home-detail="'+esc(kind+':'+item.id)+'"><span class="tile-record-top"><span>'+esc(item.title)+'</span><small>'+esc(item.status||'记录')+'</small></span>'+(compact?'':'<span class="tile-record-summary">'+esc(item.summary)+'</span>')+homeArrow+'</button>').join('');
}
function renderHomepage(){
 if(homeDrag){homeDeferredRender=true;return}
 const data=homeState;if(!data)return;homeDeferredRender=false;
 const head='<header class="home-top"><h1>首页</h1><div class="home-top-actions"><button id="home-reset" class="quiet" title="恢复默认卡片顺序">恢复布局</button><button id="home-refresh" class="quiet" aria-label="重新读取首页">'+homeRefresh+'</button></div></header>';
 const moduleTile=()=>homeTile('douyin','抖音收藏','<div id="home-module-summary"><p class="tile-note">正在读取收藏数据…</p></div>','<a class="home-source quiet module-entry" href="#douyin" data-go-module="douyin" data-go-source="favorites">打开收藏'+homeArrow+'</a><button class="home-source quiet" data-home-queue>处理队列'+homeArrow+'</button>');
 const materialsTile=()=>homeTile('materials','本地素材','<div id="home-material-summary"><p class="tile-note">正在读取素材记录…</p></div>','<a class="home-source quiet module-entry" href="#douyin" data-go-source="local">查看全部素材'+homeArrow+'</a><span>内容记录</span>');
 if(!data.configured){
  $('homeview').innerHTML=head+'<p class="home-binding-note">'+esc(data.error||'个人状态资料尚未绑定；工作台功能仍可使用。')+'</p><div id="home-cards" class="home-card-grid" role="list" aria-label="工作台功能">'+moduleTile()+materialsTile()+'</div>';
  renderHomepageSummary();applyHomeOrder(homeOrder);return;
 }
 const overview=data.overview||[],upcoming=data.schedule.slice(0,2);
 const attention=[...data.waiting.filter(x=>!x.deferred).map(x=>({...x,kind:'waiting'})),...data.projects.filter(x=>x.attention).map(x=>({...x,kind:'projects'}))];
 const later=[...data.projects.filter(x=>x.deferred).map(x=>({...x,kind:'projects'})),...data.waiting.filter(x=>x.deferred).map(x=>({...x,kind:'waiting'}))];
 const phase='<div class="tile-phase"><h3>'+esc(data.stage.title||'当前阶段')+'</h3><p>'+esc(data.stage.subtitle)+'</p></div>';
 const statusBody=phase+(overview.length?'<div class="status-grid">'+overview.slice(0,4).map(o=>'<button class="status-record" data-home-detail="overview:'+esc(o.id)+'"><strong>'+esc(o.title)+'</strong><span>'+esc(o.summary)+'</span></button>').join('')+'</div>':'<p class="tile-note">'+esc(data.stage.focus)+'</p>')+'<p class="tile-evidence">'+(data.reported_until?'最新实报 '+esc(data.reported_until):'实报日期未提供')+'</p>';
 const route=data.stages.map(s=>s.title).join(' → ');
 const nextBody=upcoming.length?upcoming.map(item=>'<button class="tile-record schedule-record" data-home-detail="schedule:'+esc(item.id)+'"><span class="schedule-date">'+(item.status==='待确认'?'原 ':'')+esc(item.date.slice(5).replace('-','/'))+'</span><span class="schedule-copy"><span class="tile-record-top"><small>'+(item.status==='待确认'?'日期待确认':'计划')+' · '+esc(item.category)+'</small></span><span class="tile-record-summary">'+esc(item.title)+'</span></span>'+homeArrow+'</button>').join(''):'<p class="tile-note">近期没有明确日期的安排</p>';
 const focusBody=attention.length?attention.slice(0,2).map(x=>homeRows([x],x.kind,{compact:true})).join(''):'<p class="tile-note">暂无待确认事项</p>';
 const laterBody=later.length?later.slice(0,2).map(x=>homeRows([x],x.kind,{compact:true})).join(''):'<p class="tile-note">暂无明确的稍后计划</p>';
 const more=(kind,count,label)=>'<button class="home-source quiet" data-home-list="'+kind+'">'+(count>2?'全部 '+count+' 项':label)+homeArrow+'</button>';
 const tiles=[
  homeTile('status','当前状态',statusBody,'<span class="stage-line">'+esc(route)+'</span>'+sourceButton(data.stage.source,'查看状态')),
  homeTile('next','近期安排',nextBody,more('next',data.schedule.length,'查看安排')+'<span>已有记录</span>'),
  homeTile('focus','需要留意',focusBody,'<span>未确认</span>'+more('focus',attention.length,'查看详情')),
  moduleTile(),
  homeTile('later','稍后计划',laterBody,'<span>尚未启动</span>'+more('later',later.length,'查看详情')),
  materialsTile()
 ];
 $('homeview').innerHTML=head+'<p id="home-drag-help" class="sr-only">拖动右上角换位置。键盘空格或回车拿起，方向键移动，回车放下，Escape取消。</p><div id="home-cards" class="home-card-grid" role="list" aria-label="个人状态卡片">'+tiles.join('')+'</div><p id="home-layout-status" class="sr-only" role="status" aria-live="polite"></p>';
 syncHomeOrder();renderHomepageSummary();applyHomeOrder(homeOrder);
}
function renderHomepageSummary(){
 if(homeDrag)return;
 const target=$('home-module-summary');if(!target)return;if(!state){for(const el of [target,$('home-material-summary')])if(el){el.innerHTML='<p class="tile-note">数据尚未连接，不显示推测数值。</p>';delete el.dataset.content}return}
 const favorites=state.videos.filter(v=>v.favorite),done=favorites.filter(saved).length;
 const running=state.jobs.filter(j=>['running','queued'].includes(j.status)).length,review=state.jobs.filter(j=>j.status==='needs_review').length;
 const latest=state.jobs.filter(j=>j.note&&['completed','skipped'].includes(j.status)).sort((a,b)=>b.updated-a.updated)[0];
 const html='<div class="collection-total"><strong>'+favorites.length+'</strong><span>条收藏</span></div><p class="collection-meta">已入库 '+done+' · 未入库 '+(favorites.length-done)+(running?' · 处理中 '+running:'')+(review?' · 待归类 '+review:'')+'</p>'+(latest?'<button class="latest-note quiet" data-open-job="'+esc(latest.id)+'"><span>最近入库</span><strong>'+esc(cleanTitle(state.videos.find(v=>v.id===latest.video)?.title||'知识笔记'))+'</strong>'+homeArrow+'</button>':'<p class="tile-note">选择值得留下的内容</p>');
 if(target.dataset.content!==html){target.innerHTML=html;target.dataset.content=html}
 const materialTarget=$('home-material-summary');
 if(materialTarget){
  const allDone=state.videos.filter(saved).length;
  const materialHtml='<div class="material-total"><strong>'+state.videos.length+'</strong><span>条内容记录</span></div><p class="material-meta">已入库 '+allDone+' · 未入库 '+(state.videos.length-allDone)+'</p><p class="tile-note material-note">包含收藏与已处理内容</p>';
  if(materialTarget.dataset.content!==materialHtml){materialTarget.innerHTML=materialHtml;materialTarget.dataset.content=materialHtml}
 }
 syncHomeOrder();
}
function syncHomeOrder(){
 if(homeDrag||homePendingSaves||!state)return;
 const order=validHomeOrder(state.home_card_order)?state.home_card_order:HOME_CARD_IDS;
 homeSavedOrder=[...order];if(JSON.stringify(homeOrder)!==JSON.stringify(order))applyHomeOrder(order);
}
async function refreshHomepage(){
 if(homeBusy)return;homeBusy=true;
 try{const data=await api('home'),key=JSON.stringify(data);homeState=data;if(key!==homeFingerprint){renderHomepage();homeFingerprint=key}}
 catch(e){if(!homeState){homeState={configured:false,error:'个人资料读取失败：'+e.message};renderHomepage()}else toast(e.message)}
 finally{homeBusy=false}
}
function showHomeDetail(kind,id){
 const item=homeState?.[kind]?.find(s=>s.id===id);if(!item)return;
 homeDetail=item;$('home-detail-title').textContent=item.title;
 $('home-detail-content').innerHTML='<p class="detail-status">'+esc(item.status||'记录')+(item.origin==='advice'?' · AI建议':' · 库内记录')+'</p><p class="detail-body">'+esc(item.summary)+'</p>'+(item.trigger?'<p class="detail-trigger">回看条件：'+esc(item.trigger)+'</p>':'')+'<div class="detail-source"><span>'+esc(sourceMeta(item.source)?.title||'资料入口')+' · '+esc(sourceDate(item.source))+'</span>'+sourceButton(item.source)+'</div><p class="detail-boundary">只读摘要，不改日期、不标记完成。</p>';
 if(!$('homedetail').open)$('homedetail').showModal();
}
function showHomeList(kind){
 if(!homeState)return;
 const data=homeState,titles={next:'近期安排',focus:'需要留意',later:'稍后计划'};
 if(!titles[kind])return;
 const entries=kind==='next'?data.schedule.map(x=>({...x,kind:'schedule'})):kind==='focus'?
 [...data.waiting.filter(x=>!x.deferred).map(x=>({...x,kind:'waiting'})),...data.projects.filter(x=>x.attention).map(x=>({...x,kind:'projects'}))]:
 [...data.projects.filter(x=>x.deferred).map(x=>({...x,kind:'projects'})),...data.waiting.filter(x=>x.deferred).map(x=>({...x,kind:'waiting'}))];
 $('home-detail-title').textContent=titles[kind];homeDetail=null;
 $('home-detail-content').innerHTML=(entries.length?entries.map(x=>homeRows([{...x,summary:(kind==='next'?(x.status==='待确认'?'原日期 ':'计划日期 ')+x.date+' · ':'')+(x.summary||'')}],x.kind)).join(''):'<p class="detail-body">暂无已有记录</p>')+'<p class="detail-boundary">只读摘要，不改日期、不标记完成。点击条目查看来源。</p>';
 if(!$('homedetail').open)$('homedetail').showModal();
}
function announceHomeLayout(text){if($('home-layout-status'))$('home-layout-status').textContent=text}
function applyHomeOrder(order,animate=false){
 if(!validHomeOrder(order))return;
 const grid=$('home-cards');homeOrder=[...order];if(!grid)return;
 const cards=[...grid.children],before=new Map(cards.map(c=>[c,c.getBoundingClientRect()])),focused=document.activeElement;
 homeFlipAnimations.forEach(a=>a.cancel());homeFlipAnimations.clear();
 const statusCard=cards.find(c=>c.dataset.homeCard==='status');
 statusCard?.classList.remove('home-tile-wide');statusCard?.classList.add('home-tile-compact');
 for(const id of order){const card=cards.find(c=>c.dataset.homeCard===id);if(card)grid.append(card)}
 if(grid.contains(focused))focused.focus({preventScroll:true});
 if(animate&&navigationMotionEnabled())for(const card of cards){
  if(card===homeDrag?.card)continue;
  const old=before.get(card),now=card.getBoundingClientRect(),dx=old.left-now.left,dy=old.top-now.top;
  if(Math.abs(dx)+Math.abs(dy)<1)continue;
  const a=card.animate([{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'none'}],{duration:220,easing:'cubic-bezier(.22,1,.36,1)'});
  homeFlipAnimations.set(card,a);a.finished.then(()=>{if(homeFlipAnimations.get(card)===a)homeFlipAnimations.delete(card)}).catch(()=>{});
 }
}
function persistHomeOrder(){
 const order=[...homeOrder];homePendingSaves++;announceHomeLayout('正在保存布局');
 homeSaveChain=homeSaveChain.then(async()=>{
  try{const result=await api('home_layout',{order});homeSavedOrder=[...result.order];if(state)state.home_card_order=[...result.order];announceHomeLayout('布局已保存')}
  catch(e){if(homePendingSaves===1){applyHomeOrder(homeSavedOrder,true);toast('布局未保存：'+e.message)}announceHomeLayout('布局未保存')}
  finally{homePendingSaves--}
 });return homeSaveChain;
}
function moveHomeCard(id,target){
 const from=homeOrder.indexOf(id),to=homeOrder.indexOf(target);if(from<0||to<0||from===to)return;
 const order=[...homeOrder];order.splice(from,1);order.splice(to,0,id);applyHomeOrder(order,true);
 announceHomeLayout(homeDrag.handle.closest('article').getAttribute('aria-label')+'，第'+(to+1)+'张');
}
function activateHomeDrag(d){
 d.active=true;d.card.classList.add('home-card-moving');d.handle.setAttribute('aria-pressed','true');
 document.body.classList.add('home-sorting');announceHomeLayout('已拿起卡片，可移动位置；Escape取消');
 if(d.keyboard)return;
 const r=d.card.getBoundingClientRect(),ghost=d.card.cloneNode(true);
 ghost.removeAttribute('data-home-card');ghost.removeAttribute('role');ghost.setAttribute('aria-hidden','true');ghost.className='home-tile home-drag-preview';
 ghost.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));ghost.querySelectorAll('button,a,input,select').forEach(e=>e.tabIndex=-1);ghost.style.width=r.width+'px';ghost.style.height=r.height+'px';
 d.offsetX=d.x-r.left;d.offsetY=d.y-r.top;d.ghost=ghost;document.body.append(ghost);
 d.frame=requestAnimationFrame(homeDragFrame);
}
function homeDragFrame(){
 const d=homeDrag;if(!d?.active||d.keyboard)return;
 const ws=document.querySelector('.workspace'),r=ws.getBoundingClientRect();
 if(d.y>r.bottom-48)ws.scrollTop+=Math.min(14,(d.y-r.bottom+48)/3);
 else if(d.y<r.top+48)ws.scrollTop-=Math.min(14,(r.top+48-d.y)/3);
 d.ghost.style.transform='translate('+(d.x-d.offsetX)+'px,'+(d.y-d.offsetY)+'px) scale(1.012)';
 const hit=document.elementFromPoint(d.x,d.y)?.closest('#home-cards>[data-home-card]');
 if(hit&&hit!==d.card)moveHomeCard(d.id,hit.dataset.homeCard);
 d.frame=requestAnimationFrame(homeDragFrame);
}
function finishHomeDrag(cancel=false){
 const d=homeDrag;if(!d)return;
 homeDrag=null;cancelAnimationFrame(d.frame);d.card.classList.remove('home-card-moving');d.handle.setAttribute('aria-pressed','false');document.body.classList.remove('home-sorting');
 if(d.capture?.hasPointerCapture(d.pointerId))d.capture.releasePointerCapture(d.pointerId);
 if(cancel){applyHomeOrder(d.before,true);announceHomeLayout('已取消移动')}
 else if(d.active&&JSON.stringify(d.before)!==JSON.stringify(homeOrder))persistHomeOrder();
 if(d.ghost){
  const g=d.ghost;
  if(!cancel&&navigationMotionEnabled()){
   const r=d.card.getBoundingClientRect(),from=g.getBoundingClientRect();homeLandingGhosts.add(g);
   g.animate([{transform:'translate('+from.left+'px,'+from.top+'px) scale(1.012)',opacity:.9},{transform:'translate('+r.left+'px,'+r.top+'px) scale(1)',opacity:0}],{duration:180,easing:'cubic-bezier(.22,1,.36,1)'}).finished.finally(()=>{g.remove();homeLandingGhosts.delete(g)});
  }else g.remove();
 }
 if(d.active)d.handle.focus({preventScroll:true});
 if(homeDeferredRender)renderHomepage();else renderHomepageSummary();
}
document.addEventListener('pointerdown',e=>{
 const handle=e.target.closest('[data-home-handle]');if(!handle||e.button!==0||currentModule!=='home'||document.querySelector('dialog:modal'))return;
 finishHomeDrag(true);homeLandingGhosts.forEach(g=>g.remove());homeLandingGhosts.clear();
 const grid=$('home-cards');handle.focus({preventScroll:true});e.preventDefault();grid.setPointerCapture(e.pointerId);
 homeDrag={id:handle.dataset.homeHandle,card:handle.closest('article'),handle,capture:grid,pointerId:e.pointerId,before:[...homeOrder],startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,active:false};
});
document.addEventListener('pointermove',e=>{
 const d=homeDrag;if(!d||d.keyboard||d.pointerId!==e.pointerId)return;
 d.x=e.clientX;d.y=e.clientY;if(!d.active&&Math.hypot(d.x-d.startX,d.y-d.startY)>6)activateHomeDrag(d);
});
document.addEventListener('pointerup',e=>{if(homeDrag&&!homeDrag.keyboard&&homeDrag.pointerId===e.pointerId)finishHomeDrag()});
document.addEventListener('pointercancel',e=>{if(homeDrag?.pointerId===e.pointerId)finishHomeDrag(true)});
document.addEventListener('lostpointercapture',e=>{if(homeDrag?.pointerId===e.pointerId)finishHomeDrag(true)});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&homeDrag){e.preventDefault();finishHomeDrag(true);return}
 const handle=e.target.closest('[data-home-handle]');if(!handle)return;
 if(!homeDrag&&[' ','Enter'].includes(e.key)){e.preventDefault();homeDrag={id:handle.dataset.homeHandle,card:handle.closest('article'),handle,before:[...homeOrder],keyboard:true,active:false};activateHomeDrag(homeDrag);return}
 if(!homeDrag?.keyboard)return;
 if([' ','Enter'].includes(e.key)){e.preventDefault();finishHomeDrag();return}
 if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){
  e.preventDefault();const next=homeOrder.indexOf(homeDrag.id)+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);
  if(next>=0&&next<homeOrder.length)moveHomeCard(homeDrag.id,homeOrder[next]);
 }
});
window.addEventListener('blur',()=>finishHomeDrag(true));window.addEventListener('resize',()=>{finishHomeDrag(true);applyHomeOrder(homeOrder)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)finishHomeDrag(true)});
document.addEventListener('click',async e=>{
 const b=e.target.closest('button,a');if(!b)return;
 if(b.dataset.goSource){e.preventDefault();selectModule('douyin');selectSource(b.dataset.goSource);document.querySelector('.workspace').scrollTop=0;return}
 if(b.dataset.goModule){e.preventDefault();selectModule(b.dataset.goModule);return}
 if(b.hasAttribute('data-home-queue')){selectModule('douyin');$('queuepanel').showModal();return}
 if(b.dataset.homeDetail){const [kind,...id]=b.dataset.homeDetail.split(':');showHomeDetail(kind,id.join(':'));return}
 if(b.dataset.homeList){showHomeList(b.dataset.homeList);return}
 if(b.dataset.homeSource){b.disabled=true;try{await api('open_home_note',{source:b.dataset.homeSource})}catch(err){toast(err.message)}finally{b.disabled=false}return}
 if(b.id==='home-reset'){finishHomeDrag(true);applyHomeOrder(HOME_CARD_IDS,true);await persistHomeOrder();return}
 if(b.id==='home-refresh'){homeFingerprint='';await refresh();await refreshHomepage()}
});
$('homemodule').onclick=()=>{if(currentModule!=='home')selectModule('home')};
$('douyinmodule').onclick=()=>currentModule==='douyin'?toggleNavigation():selectModule('douyin');
$('closehomedetail').onclick=()=>$('homedetail').close();
window.addEventListener('hashchange',()=>{const name=location.hash.slice(1);if(name in moduleRegistry&&name!==currentModule)selectModule(name)});
selectModule(location.hash==='#douyin'||location.hash==='#library'?'douyin':'home',{animate:false});
setInterval(()=>{if(currentModule==='home')refreshHomepage()},15000);
