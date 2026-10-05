const token=document.querySelector('meta[name=workbench-token]').content;
const $=id=>document.getElementById(id);
let state=null,view='favorites',folder='',selection=new Set(),busy=false,fingerprint='',cardFingerprint='',navFingerprint='',toastTimer;
const PAGE_SIZE=30;
let pageNumber=1;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const check="<svg data-lucide=\"check\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" ><path d=\"M20 6 9 17l-5-5\" /></svg>";
const moreIcon="<svg data-lucide=\"ellipsis\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" ><circle cx=\"12\" cy=\"12\" r=\"1\" /><circle cx=\"19\" cy=\"12\" r=\"1\" /><circle cx=\"5\" cy=\"12\" r=\"1\" /></svg>";
const noteLink=p=>'obsidian://open?vault='+encodeURIComponent(state.vault)+'&file='+encodeURIComponent(p);
const labels={queued:'待处理',running:'处理中',needs_review:'等待归类',failed:'处理失败',completed:'已完成',skipped:'已存在',cancelled:'已取消'};
const saved=v=>Boolean(v.note||v.raw);
const cleanTitle=s=>String(s||'未命名视频').replace(/\s*#[^\s#]*/g,'').trim()||s;
function currentJob(id){return state.jobs.find(j=>j.video===id)}
function videoState(v){if(saved(v))return {key:'done',label:'已入库'};const j=currentJob(v.id);if(j&&['queued','running','needs_review'].includes(j.status))return {key:'pending',label:labels[j.status]};if(j?.status==='failed')return {key:'failed',label:'处理失败'};return {key:'new',label:'未入库'}}
function eligible(v){const j=currentJob(v.id);return !v.note&&(!j||!['queued','running','needs_review'].includes(j.status))}
const workURL=v=>'https://www.douyin.com/'+(v.kind==='images'?'note/':'video/')+v.id;
function scopeItems(){const q=$('search').value.trim().toLowerCase(),members=folder?new Set(state.membership.filter(m=>m.folder===folder).map(m=>m.video)):null;return state.videos.filter(v=>{if(members&&!members.has(v.id))return false;if(!members&&view==='favorites'&&!v.favorite)return false;return !q||(v.title+' '+v.author).toLowerCase().includes(q)})}
function compareIDs(a,b){return a.id.length===b.id.length?b.id.localeCompare(a.id):b.id.length-a.id.length}
function visible(){const filter=$('status').value;const items=scopeItems().filter(v=>filter==='all'||(filter==='done'?saved(v):!saved(v)));const positions=folder?new Map(state.membership.filter(m=>m.folder===folder).map(m=>[m.video,m.position])):null;return items.sort((a,b)=>{if($('sort').value==='published')return (b.published_at||0)-(a.published_at||0)||compareIDs(a,b);if(view==='local'&&!folder)return compareIDs(a,b);const pa=positions?positions.get(a.id):a.favorite_position,pb=positions?positions.get(b.id):b.favorite_position;return (pa??Number.MAX_SAFE_INTEGER)-(pb??Number.MAX_SAFE_INTEGER)||compareIDs(a,b)})}
function pageSlice(items){const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));pageNumber=Math.min(Math.max(1,pageNumber),pages);return items.slice((pageNumber-1)*PAGE_SIZE,pageNumber*PAGE_SIZE)}
function changePage(number){pageNumber=number;render();$('library').scrollIntoView({block:'start'});$('scope').focus({preventScroll:true})}
async function api(path,data){const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{'X-Workbench-Token':token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});const out=await r.json();if(r.status===403){location.reload();throw Error('服务已更新，正在刷新页面')}if(!r.ok)throw Error(out.error||'请求未成功');return out}
function toast(s){clearTimeout(toastTimer);const host=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;host.append($('toast'));$('toast').textContent=s;$('toast').style.display='block';toastTimer=setTimeout(()=>$('toast').style.display='none',4500)}
async function action(name,data={}){try{const out=await api(name,data);fingerprint='';await refresh();return out}catch(e){toast(e.message);return null}}
function renderNavigation(){
 const choice=folder?'folder:'+folder:view;
 $('favoritecount').textContent=state.videos.filter(v=>v.favorite).length;
 $('localcount').textContent=state.videos.length;
 const folderKey=JSON.stringify([state.folders,state.membership]);
 if(folderKey!==navFingerprint){
  $('foldernav').innerHTML=state.folders.map(f=>'<button class="panel-link" data-source="folder:'+esc(f.id)+'" title="'+esc(f.name)+'"><svg data-lucide="folder" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg><span>'+esc(f.name)+'</span><span class="nav-count">'+state.membership.filter(m=>m.folder===f.id).length+'</span></button>').join('');
  $('folders-empty').hidden=Boolean(state.folders.length);navFingerprint=folderKey;
 }
 for(const button of $('modulepanel').querySelectorAll('[data-source]')){
  if(button.dataset.source===choice)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 }
 $('viewtitle').textContent=folder?state.folders.find(f=>f.id===folder)?.name||'收藏夹':view==='local'?'本地素材':'全部收藏';
 $('viewcontext').textContent=folder?'抖音收藏 / 收藏夹':'抖音收藏';
}
function selectSource(value){
 folder=value.startsWith('folder:')?value.slice(7):'';view=folder?'favorites':value;pageNumber=1;
 // Search and status remain explicit user filters when changing the source.
 render();closeCompactNavigation();
 $('library').scrollIntoView({block:'start'});$('scope').focus({preventScroll:true});
}
function render(){
 renderNavigation();
 const allItems=visible(),items=pageSlice(allItems),scoped=scopeItems(),sync=state.sync||{},account=state.account||{},count=state.videos.filter(v=>v.favorite).length;
 const pages=Math.max(1,Math.ceil(allItems.length/PAGE_SIZE));
 $('pagination').hidden=pages<2;
 $('pageinfo').textContent=pageNumber+' / '+pages;
 $('prevpage').disabled=pageNumber===1;$('nextpage').disabled=pageNumber===pages;
 $('pagenumbers').innerHTML=Array.from({length:pages},(_,i)=>i+1).filter(n=>n===1||n===pages||Math.abs(n-pageNumber)<=1).map((n,i,shown)=>(i&&n-shown[i-1]>1?'<span aria-hidden="true">…</span>':'')+'<button data-page="'+n+'" aria-label="第 '+n+' 页" '+(n===pageNumber?'aria-current="page"':'')+'>'+n+'</button>').join('');
 const source=$('source'),choice=folder?'folder:'+folder:view;
 source.innerHTML='<option value="favorites">全部收藏 ('+count+')</option><option value="local">本地素材 ('+state.videos.length+')</option>'+state.folders.map(f=>'<option value="folder:'+esc(f.id)+'">'+esc(f.name)+' ('+state.membership.filter(m=>m.folder===f.id).length+')</option>').join('');
 source.value=choice;
 const done=scoped.filter(saved).length,names={all:'所有状态',new:'未入库',done:'已入库'},counts={all:scoped.length,new:scoped.length-done,done};
 for(const o of $('status').options)o.textContent=names[o.value]+' ('+counts[o.value]+')';
 $('scope').textContent=state.syncing?'正在后台刷新收藏…':allItems.length+' 个作品'+(pages>1?' · 第 '+((pageNumber-1)*PAGE_SIZE+1)+'–'+Math.min(pageNumber*PAGE_SIZE,allItems.length)+' 条':'')+($('sort').value==='published'?'，最近发布在前':'');
 $('sync').disabled=state.syncing;$('sync').querySelector('span').textContent=state.syncing?'刷新中':'刷新收藏';
 document.body.classList.toggle('is-syncing',Boolean(state.syncing));$('sync').setAttribute('aria-busy',String(Boolean(state.syncing)));
 $('notice').hidden=!(sync.updated&&sync.ok===false);
 $('connection').textContent='刷新未成功，已保留 '+count+' 条收藏。可重试或检查登录。';
 $('account-status').textContent=state.authchecking?'正在后台检查登录…':account.message||'刷新和检查登录在后台进行，无需反复扫码。';
 $('login').disabled=state.authchecking||state.syncing;
 $('login').classList.toggle('is-loading',Boolean(state.authchecking));$('login').setAttribute('aria-busy',String(Boolean(state.authchecking)));
 $('openlogin').hidden=!account.needs_login;
 $('diagnostictext').textContent=(sync.detail||sync.message||'尚无同步记录')+'\n'+(state.browser?.message||'');
 $('queuecount').textContent=state.jobs.filter(j=>['queued','running','needs_review'].includes(j.status)).length;$('queuecount').hidden=$('queuecount').textContent==='0';
 $('pause').textContent=state.paused?'继续队列':'暂停后续';
 const openMenus=new Set([...document.querySelectorAll('.card-menu[open]')].map(e=>e.closest('.card').dataset.id));
 const cardsKey=JSON.stringify([pageNumber,$('sort').value,items,items.map(v=>[videoState(v),eligible(v)]),items.length?null:[view,folder,$('search').value,$('status').value]]);
 if(cardsKey!==cardFingerprint){
 $('cards').innerHTML=items.length?items.map(v=>{
   const status=videoState(v),title=cleanTitle(v.title),cover=/^https:\/\//.test(v.cover||'')?'<img src="'+esc(v.cover)+'" loading="lazy" referrerpolicy="no-referrer" alt="'+esc(title)+'的封面">':'<span class="placeholder">暂无封面</span>';
   const tip=v.note?'已有知识笔记':v.raw?'已有原始资料，可继续生成知识笔记':v.kind==='images'?'选择图文：逐张识别原图并生成笔记':status.label;
   const duration=v.duration?Math.floor(v.duration/60)+':'+String(Math.round(v.duration)%60).padStart(2,'0'):v.kind==='images'?'图文':'';
   return '<article class="card '+(selection.has(v.id)?'selected':'')+'" data-id="'+v.id+'" data-status="'+status.key+'"><div class="cover">'+cover+'<label title="'+esc(tip)+'"><input type="checkbox" aria-label="选择作品：'+esc(title)+'" data-video="'+v.id+'" '+(selection.has(v.id)?'checked':'')+' '+(eligible(v)?'':'disabled')+'></label><span class="cover-status '+status.key+'" title="'+esc(tip)+'">'+(status.key==='done'?check:'')+status.label+'</span>'+(duration?'<span class="duration">'+duration+'</span>':'')+'</div><div class="card-content"><a class="card-title" href="'+workURL(v)+'" target="_blank" rel="noopener" title="'+esc(v.title)+'">'+esc(title)+'</a><div class="card-bottom"><span class="author">'+esc(v.author||'作者待确认')+'</span><details class="card-menu" '+(openMenus.has(v.id)?'open':'')+'><summary aria-label="作品选项：'+esc(title)+'">'+moreIcon+'</summary><div><a href="'+workURL(v)+'" target="_blank" rel="noopener">查看原作品</a>'+(saved(v)?'<a class="note-action" data-open-video="'+v.id+'" href="'+noteLink(v.note||v.raw)+'">'+(v.note?'打开知识笔记':'打开原始资料')+'</a>':'')+(v.raw&&!v.note?'<span class="muted">已入库的是原始资料；勾选可继续生成知识笔记。</span>':'')+(v.kind==='images'?'<span class="muted">按原图顺序逐张识别；动态片段不分析。</span>':'')+'</div></details></div>'+($('sort').value==='published'?'<div class="published-date">'+(v.published_at?new Date(v.published_at*1000).toLocaleDateString('zh-CN'):'发布时间未知')+'</div>':'')+'</div></article>';
 }).join(''):'<div class="empty">'+(folder?'这个收藏夹没有匹配的视频。':$('search').value||$('status').value!=='all'?'没有匹配的视频。':'尚未读取到收藏，点击刷新收藏。')+'</div>';
 cardFingerprint=cardsKey;
 }
 // Keep mounted cards on selection-only updates: CSS transitions, image state and focus survive.
 for(const card of $('cards').querySelectorAll('.card')){
   const selected=selection.has(card.dataset.id);card.classList.toggle('selected',selected);
   card.querySelector('[data-video]').checked=selected;
 }
 const candidates=items.filter(eligible),selectedVisible=candidates.filter(v=>selection.has(v.id)).length;
 $('selectall').disabled=!candidates.length;$('selectall').checked=candidates.length>0&&selectedVisible===candidates.length;$('selectall').indeterminate=selectedVisible>0&&selectedVisible<candidates.length;
 $('selectionbar').hidden=!selection.size;$('selected').textContent='已选 '+selection.size+' 条';$('enqueue').disabled=!selection.size;
 $('enqueue').querySelector('span').textContent=selection.size&&[...selection].every(id=>state.videos.find(v=>v.id===id)?.raw)?'生成知识笔记':'加入知识库';
 $('jobs').innerHTML=state.jobs.length?state.jobs.map(j=>{const v=state.videos.find(v=>v.id===j.video),badge=['completed','skipped'].includes(j.status)?'done':j.status==='failed'?'failed':'pending';return '<div class="job"><span class="badge '+badge+'">'+(badge==='done'?check:'')+esc(labels[j.status]||j.status)+'</span><p class="job-title">'+esc(cleanTitle(v?.title||j.video))+'</p><p class="job-message">'+esc(j.message)+'</p>'+(j.status==='running'?'<div class="job-progress" aria-label="正在处理"></div>':'')+(j.status==='needs_review'?'<select data-topic="'+j.id+'" aria-label="选择主题"><option value="">选择已有主题</option>'+state.topics.map(t=>'<option value="'+esc(t)+'">'+esc(t)+'</option>').join('')+'</select>':'')+'<div class="job-actions">'+(j.note?'<a data-open-job="'+j.id+'" href="'+noteLink(j.note)+'">打开笔记</a>':'')+(['failed','cancelled'].includes(j.status)?'<button data-retry="'+j.id+'">重试</button>':'')+(j.status==='needs_review'?'<button data-place="'+j.id+'">确认归类</button>':'')+(!['completed','skipped','cancelled'].includes(j.status)?'<button data-cancel="'+j.id+'">取消</button>':'')+'<button data-preview="'+j.id+'">查看草稿</button></div></div>'}).join(''):'<p class="queue-empty">没有待处理的视频。</p>';
}
async function refresh(){if(busy)return;busy=true;try{state=await api('state');for(const id of selection){const v=state.videos.find(x=>x.id===id);if(!v||!eligible(v))selection.delete(id)}const next=JSON.stringify(state);if(next!==fingerprint&&!document.activeElement?.matches('[data-topic]')){render();fingerprint=next}}catch(e){$('notice').hidden=false;$('connection').textContent='本机服务未连接，请重新打开工作台。'}finally{busy=false}}
$('source').onchange=()=>selectSource($('source').value);
$('modulepanel').addEventListener('click',e=>{const button=e.target.closest('[data-source]');if(button&&state)selectSource(button.dataset.source)});
const compactNavigation=matchMedia('(max-width:1100px)');
let panelCollapsed=false,compactPanelOpen=false;
function updateNavigationLayout(){
 // One persistent panel, never moved into a modal/top layer.
 if(compactNavigation.matches&&$('modulepanel').contains(document.activeElement))$('navtoggle').focus({preventScroll:true});
 compactPanelOpen=false;
 document.body.classList.toggle('panel-collapsed',!compactNavigation.matches&&panelCollapsed);
 updateNavigationToggle();
}
function updateNavigationToggle(){
 const expanded=compactNavigation.matches?compactPanelOpen:!panelCollapsed;
 document.body.classList.toggle('nav-open',compactNavigation.matches&&compactPanelOpen);
 $('modulepanel').inert=!expanded;
 $('modulepanel').setAttribute('aria-hidden',String(!expanded));
 $('navtoggle').setAttribute('aria-expanded',String(expanded));
 $('navtoggle').setAttribute('aria-label',expanded?'收起导航':'展开导航');$('navtoggle').title=expanded?'收起导航':'展开导航';
}
function closeCompactNavigation(restoreFocus=false){
 if(!compactNavigation.matches||!compactPanelOpen)return;
 if(restoreFocus)$('navtoggle').focus({preventScroll:true});
 compactPanelOpen=false;updateNavigationToggle();
}
function toggleNavigation(){
 if(compactNavigation.matches)compactPanelOpen=!compactPanelOpen;
 else{panelCollapsed=!panelCollapsed;document.body.classList.toggle('panel-collapsed',panelCollapsed)}
 updateNavigationToggle();
}
$('navtoggle').onclick=toggleNavigation;
$('closenav').onclick=()=>closeCompactNavigation(true);
$('douyinmodule').onclick=()=>{if(compactNavigation.matches)toggleNavigation();else if(panelCollapsed){panelCollapsed=false;document.body.classList.remove('panel-collapsed');updateNavigationToggle()}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&compactPanelOpen&&!document.querySelector('dialog:modal')){e.preventDefault();closeCompactNavigation(true)}});
document.addEventListener('click',e=>{if(!e.target.closest('#modulepanel,.module-rail,dialog')&&!document.querySelector('dialog:modal'))closeCompactNavigation()});
compactNavigation.addEventListener('change',updateNavigationLayout);updateNavigationLayout();
const resetPage=()=>{pageNumber=1;if(state)render()};
$('search').oninput=resetPage;$('status').onchange=resetPage;$('sort').onchange=resetPage;
$('prevpage').onclick=()=>changePage(pageNumber-1);$('nextpage').onclick=()=>changePage(pageNumber+1);
$('sync').onclick=()=>action('sync');$('login').onclick=()=>action('login');$('openlogin').onclick=async()=>{const r=await action('open_login');if(r)toast('扫码完成后关闭窗口，刷新在后台进行')};$('refresh').onclick=async()=>{const r=await action('refresh');if(r)toast('入库状态已重新检查')};
$('toolsopen').onclick=()=>$('tools').showModal();$('closetools').onclick=()=>$('tools').close();$('queueopen').onclick=()=>{closeCompactNavigation();$('queuepanel').showModal()};$('closequeue').onclick=()=>$('queuepanel').close();$('notice-detail').onclick=()=>$('tools').showModal();$('pause').onclick=()=>action(state.paused?'resume':'pause');
$('import').onclick=async()=>{const r=await action('import',{links:$('links').value});if(r){$('links').value='';view='local';folder='';pageNumber=1;render();$('tools').close();toast('已加入待选列表')}};
$('clear').onclick=()=>{selection.clear();render()};
$('selectall').onclick=()=>{const candidates=pageSlice(visible()).filter(eligible);if(candidates.some(v=>selection.has(v.id))){for(const v of candidates)selection.delete(v.id)}else{for(const v of candidates){if(selection.size>=20)break;selection.add(v.id)}}render()};
document.addEventListener('change',e=>{const id=e.target.dataset.video;if(!id)return;if(e.target.checked){if(selection.size>=20){e.target.checked=false;toast('每批最多 20 条');return}selection.add(id)}else selection.delete(id);render();document.querySelector('[data-video='+JSON.stringify(id)+']')?.focus({preventScroll:true})});
$('enqueue').onclick=async()=>{if(!confirm('为所选 '+selection.size+' 条作品生成知识笔记，会使用 Codex 额度。已有原始资料不重复保存，归类不明确时等待你选择。继续？'))return;const r=await action('enqueue',{ids:[...selection]});if(r){selection.clear();render();$('queuepanel').showModal();toast('已加入 '+r.added.length+' 条；跳过 '+r.skipped.length+' 条重复项')}};
document.addEventListener('click',async e=>{const note=e.target.closest('[data-open-job],[data-open-video]');if(note){e.preventDefault();if(note.getAttribute('aria-busy')==='true')return;note.setAttribute('aria-busy','true');try{await api('open_note',note.dataset.openJob?{job:note.dataset.openJob}:{video:note.dataset.openVideo});toast('已在 Obsidian 打开笔记')}catch(err){toast(err.message)}finally{note.removeAttribute('aria-busy')}return}const elPage=e.target.closest('[data-page]');if(elPage){changePage(Number(elPage.dataset.page));return}const cover=e.target.closest('.cover');if(cover&&!e.target.closest('label,input')){const input=cover.querySelector('[data-video]');if(input&&!input.disabled)input.click();return}const el=e.target.closest('button');if(!el)return;const d=el.dataset;if(d.retry)await action('retry',{id:d.retry});if(d.cancel)await action('cancel',{id:d.cancel});if(d.place){const t=document.querySelector('[data-topic="'+d.place+'"]');await action('place',{id:d.place,topic:t.value})}if(d.preview){try{const r=await api('preview?id='+encodeURIComponent(d.preview));$('previewtext').textContent=r.note_markdown?r.note_markdown+'\n\n画面摘要：\n'+r.visual_summary+'\n\n待核实：\n'+(r.uncertainties||[]).join('\n'):'尚未生成草稿。';$('preview').showModal()}catch(err){toast(err.message)}}});
$('closepreview').onclick=()=>$('preview').close();
// Only a complete pointer gesture on the actual outer backdrop dismisses a panel.
// A nested preview closes on its own, leaving its parent queue open.
for(const dialog of document.querySelectorAll('dialog')){
 let down=null;
 const outside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)};
 dialog.addEventListener('pointerdown',e=>{down=outside(e)?e.pointerId:null});
 dialog.addEventListener('pointerup',e=>{if(down===e.pointerId&&outside(e))dialog.close();down=null});
 dialog.addEventListener('pointercancel',()=>down=null);
}
refresh();setInterval(refresh,3500);
