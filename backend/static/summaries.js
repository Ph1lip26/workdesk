/* Fetch cached summaries freely; only an explicit button starts a quota-bearing task. */
let summaryState={records:[],running:false},summaryPoll=null,summaryLoading=false,summaryStarting=false,summaryLoadError='';
const summaryMessages=new Map();
const cachedSummary=scope=>summaryState.records.find(r=>r.scope===scope);
const summaryItems=(scope,key)=>cachedSummary(scope)?.result?.items?.filter(i=>i.key===key)||[];
const summaryKind={fact:'记录',plan:'已有安排',condition:'条件触发',advice:'AI建议',conflict:'存在差异'};
function summaryInspectButton(scope,index){return '<button class="summary-evidence quiet" data-summary-scope="'+esc(scope)+'" data-summary-index="'+index+'" aria-label="查看摘要依据">依据</button>'}
function summaryRows(scope,items){
 const all=cachedSummary(scope)?.result?.items||[];
 return items.map(i=>'<div class="summary-row"><p>'+esc(i.text)+'</p><div class="summary-row-meta"><span>'+esc(i.when||summaryKind[i.kind]||'AI摘要')+'</span>'+summaryInspectButton(scope,all.indexOf(i))+'</div></div>').join('');
}
function homeBriefRows(key){
 const all=cachedSummary('home')?.result?.items||[];
 return summaryItems('home',key).map(i=>'<button class="home-brief-row quiet" data-summary-scope="home" data-summary-index="'+all.indexOf(i)+'" title="查看来源与完整依据"><span>'+(i.kind==='advice'?'AI建议：':'')+esc(i.when&&i.when.length<=10&&!i.text.includes(i.when)?i.when+' · ':'')+esc(i.text)+'</span></button>').join('');
}
function summaryStateText(scope){
 if(summaryLoadError)return '摘要服务暂时无法读取；显示上次内容：'+summaryLoadError;
 const r=cachedSummary(scope);
 if(r?.status==='running')return r.phase==='validating'?'正在核对引用与来源变化…':'正在生成摘要，使用Codex额度…';
 if(r?.status==='failed')return r.error+'；仍显示上次内容';
 if(summaryMessages.has(scope))return summaryMessages.get(scope);
 return r?.updated?'摘要生成于 '+new Date(r.updated*1000).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'尚未生成摘要 · 点击更新时使用Codex额度';
}
function summarySet(id,html){const e=$(id);if(e&&e.dataset.summaryHtml!==html){e.innerHTML=html;e.dataset.summaryHtml=html}}
function paintSummaries(){
 if(typeof homeDrag!=='undefined'&&(homeDrag||homeLandingGhosts.size))return;
 const r=cachedSummary('home');
 summarySet('home-current-brief',homeBriefRows('current')||'<p class="tile-note">点击“更新摘要”，从最新知识库提炼当前阶段与重点。</p>');
 summarySet('home-next-brief',homeBriefRows('next')||'<p class="tile-note">'+(r?.updated?'未提取到仍有效的安排，请查看来源与提示。':'点击“更新摘要”，提取已有安排和明确的等待条件。')+'</p>');
 const rows=summaryItems('home','purchase');
 if($('home-purchases-summary')){
  const records=typeof purchaseState!=='undefined'?purchaseState?.records||[]:[];
  const html=records.filter(x=>!['decided','shelved'].includes(x.status)).slice(0,2).map(record=>{
   const own=summaryItems('purchase:'+record.id,'detail').find(i=>i.text.length<=40),fromHome=rows.find(x=>x.record_id===record.id),item=fromHome||own;
   const saved=record.conclusion||record.wait_condition||'',fallback=saved&&saved.length<=40?saved:'已保存记录，点击“更新摘要”提炼当前决定';
   return '<button class="purchase-brief-row quiet" data-purchase-from-home="'+esc(record.id)+'"><strong>'+esc(record.title)+'</strong><span>'+esc(item?.text||fallback)+'</span></button>';
  }).join('')||'<p class="tile-note">暂无进行中的购买事项</p>';
  summarySet('home-purchases-summary',html);
 }
 const status=$('summary-home-status');if(status)status.textContent=summaryStateText('home');
 const refresh=$('home-refresh');if(refresh){refresh.disabled=summaryStarting||summaryState.running;refresh.setAttribute('aria-busy',String(summaryState.running))}
 const scope=typeof purchaseSelectedId!=='undefined'&&purchaseSelectedId?'purchase:'+purchaseSelectedId:'';
 if(scope&&$('purchase-ai-summary')){
  const record=cachedSummary(scope),items=summaryItems(scope,'detail'),conflicts=summaryItems(scope,'conflict');
  const fallback=summaryItems('home','purchase').filter(i=>i.record_id===purchaseSelectedId);
  const display=items.length?summaryRows(scope,items):fallback.length?summaryRows('home',fallback):'<p class="tile-note">点击“更新知识库摘要”，读取此事项关联的最新资料。手动记录不会被覆盖。</p>';
  summarySet('purchase-ai-summary','<div class="health-section-heading"><h2>知识库最新摘要</h2><span class="tile-evidence">AI提炼</span></div>'+display+(conflicts.length?'<h3>与手动记录的差异</h3>'+summaryRows(scope,conflicts):'')+'<p class="summary-status" role="status">'+esc(summaryStateText(scope))+'</p>'+((record?.result?.warnings||[]).length?'<details class="summary-warnings"><summary>来源与待核实提示</summary>'+record.result.warnings.map(w=>'<p>'+esc(w)+'</p>').join('')+'</details>':''));
 }
 const pr=$('purchase-refresh');if(pr){pr.disabled=summaryStarting||summaryState.running||!scope;pr.textContent=summaryState.running?'摘要更新中…':'更新知识库摘要';pr.setAttribute('aria-busy',String(summaryState.running))}
 requestAnimationFrame(paintSidebarSelection);
}
function paintSidebarSelection(){
 const nav=document.querySelector('.panel-nav'),active=[...(nav?.querySelectorAll('[aria-current=page]')||[])].find(e=>e.getClientRects().length);if(!nav)return;
 let mark=$('panel-selection');if(!mark){mark=document.createElement('div');mark.id='panel-selection';mark.setAttribute('aria-hidden','true');nav.prepend(mark)}
 if(!active||$('modulepanel').inert){mark.hidden=true;return}
 const r=active.getBoundingClientRect(),n=nav.getBoundingClientRect();
 mark.hidden=r.bottom<n.top||r.top>n.bottom;
 const animated=navigationMotionEnabled()&&mark.dataset.placed==='true';mark.style.transition=animated?'transform 240ms var(--ease-out),width 240ms var(--ease-out),height 240ms var(--ease-out)':'none';
 mark.style.width=r.width+'px';mark.style.height=r.height+'px';mark.style.transform='translate('+(r.left-n.left+nav.scrollLeft)+'px,'+(r.top-n.top+nav.scrollTop)+'px)';mark.dataset.placed='true';
}
async function loadSummaries(){
 if(summaryLoading)return;summaryLoading=true;
 try{summaryState=await api('summaries');summaryLoadError='';paintSummaries()}
 catch(e){summaryLoadError=e.message;paintSummaries()}
 finally{summaryLoading=false;clearTimeout(summaryPoll);if(summaryState.running&&!document.hidden)summaryPoll=setTimeout(loadSummaries,1200)}
}
async function requestSummary(scope){
 if(summaryStarting||summaryState.running)return;
 summaryStarting=true;summaryMessages.set(scope,'正在读取资料…');paintSummaries();
 try{
  if(scope==='home')await Promise.all([refreshHomepage(),refreshPurchases(),refreshHealth()]);
  else await refreshPurchases();
  const r=await api('summary_refresh',{scope});if(r.status==='unchanged')summaryMessages.set(scope,r.message);else summaryMessages.delete(scope);await loadSummaries();
  if(r.status==='unchanged')toast(r.message);
 }catch(e){summaryMessages.set(scope,e.message);toast(e.message)}
 finally{summaryStarting=false;paintSummaries()}
}
function inspectSummary(scope,index){
 const record=cachedSummary(scope),item=record?.result?.items?.[index];
 const items=item?[item]:record?.result?.items||[];
 $('home-detail-title').textContent=item?'摘要依据':'摘要来源与提示';
 $('home-detail-content').innerHTML=items.map(i=>'<section class="summary-proof"><h3>'+esc(i.text)+'</h3><p class="tile-evidence">'+esc(summaryKind[i.kind])+'</p>'+i.evidence.map(e=>{
  const source=record.sources.find(s=>s.id===e.source_id);
  return '<blockquote>'+esc(e.quote)+'</blockquote><p class="tile-evidence">'+esc(source?.title||'来源')+(source?.excerpt?' · 使用所选片段，非全文分析':'')+'</p>'+(source?.path?'<button class="quiet" data-summary-open="'+esc(source.id)+'" data-proof-scope="'+esc(scope)+'">在Obsidian查看来源</button>':'');
 }).join('')+'</section>').join('')+(record?.result?.warnings||[]).map(w=>'<p class="notice">'+esc(w)+'</p>').join('');
 if(!$('homedetail').open)$('homedetail').showModal();
}
document.addEventListener('click',e=>{
 const proof=e.target.closest('[data-summary-scope]');if(proof){inspectSummary(proof.dataset.summaryScope,Number(proof.dataset.summaryIndex));return}
 if(e.target.closest('#summary-home-details'))inspectSummary('home');
 const purchase=e.target.closest('[data-purchase-from-home]');if(purchase){selectModule('purchases');selectPurchase(purchase.dataset.purchaseFromHome)}
 const link=e.target.closest('[data-summary-open]');if(link){e.preventDefault();api('open_summary_note',{scope:link.dataset.proofScope,source:link.dataset.summaryOpen}).then(()=>toast('已在Obsidian打开来源')).catch(e=>toast(e.message))}
});
$('homeview').addEventListener('click',e=>{if(e.target.closest('#home-refresh')){e.stopPropagation();requestSummary('home')}});
$('purchase-refresh').onclick=()=>{if(purchaseSelectedId)requestSummary('purchase:'+purchaseSelectedId)};
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(summaryPoll);else loadSummaries()});
document.addEventListener('click',()=>requestAnimationFrame(paintSidebarSelection));
document.addEventListener('scroll',e=>{if($('modulepanel').contains(e.target))paintSidebarSelection()},true);
window.addEventListener('resize',paintSidebarSelection);
$('ideasopen').prepend($('enqueue').querySelector('svg').cloneNode(true));
loadSummaries();
