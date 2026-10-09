/* Local decision memory. No price fetching, AI calls or inferred completion. */
const PURCHASE_STATUS={research:'了解需求',waiting:'等待条件',ready:'准备决策',decided:'已决定',shelved:'暂不考虑'};
const PURCHASE_ORIGIN={user:'用户记录',advice:'AI建议',source:'资料摘录'};
let purchaseState=null,purchaseBusy=false,purchaseEditing=null,purchaseDirty=false,purchaseSelectedId='',purchaseNavFingerprint='',purchaseDetailFingerprint='',purchaseSaving=false;
const purchaseFields=['title','category','budget','needs','conclusion','wait_condition','questions','status','origin','review_date','source_note','source_url'];
function purchaseVisible(){
 const q=$('purchase-search').value.trim().toLocaleLowerCase(),status=$('purchase-filter').value;
 return (purchaseState?.records||[]).filter(r=>(status==='all'||r.status===status)&&(!q||[r.title,r.category,r.needs,r.conclusion,r.wait_condition,...r.candidates.map(c=>c.name)].join(' ').toLocaleLowerCase().includes(q)));
}
function purchaseBrief(r){
 const rows=['请结合以下购买记录继续调研。先核实待确认项，不把历史报价当作当前价，不替我作购买决定。',
  '', '# '+r.title,'当前状态：'+PURCHASE_STATUS[r.status],'预算：'+(r.budget||'尚未填写'),
  '', '## 需求与排除项',r.needs||'尚未填写','', '## 当前结论（'+PURCHASE_ORIGIN[r.origin]+'）',r.conclusion||'尚未填写',
  '', '## 等待条件',r.wait_condition||'尚未填写','回看日期：'+(r.review_date||'未指定，按条件回看'),'', '## 候选与历史核价记录'];
 for(const c of r.candidates){rows.push('- '+c.name,'  记录价格：'+(c.price||'未记录')+'；渠道：'+(c.channel||'未记录')+'；核价日期：'+(c.checked_at||'未记录'),'  备注：'+(c.notes||'无'));if(c.url)rows.push('  参考链接：'+c.url)}
 if(!r.candidates.length)rows.push('尚未填写候选');
 rows.push('', '## 待核实问题',r.questions||'请判断哪些已有信息需要重新核实。');
 if(r.source_note)rows.push('关联资料：[['+r.source_note+']]');if(r.source_url)rows.push('资料链接：'+r.source_url);
 rows.push('', '记录维护时间：'+r.updated,'以上为保存的记录，不是实时市场信息；回看日期不代表发布日期或购买承诺。');
 return rows.join('\n');
}
function selectedPurchase(records=purchaseVisible()){
 return records.find(r=>r.id===purchaseSelectedId)||records[0]||null;
}
function purchaseLink(url,label){
 try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return '';return '<a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>'}catch{return ''}
}
function purchaseSection(title,content,extra=''){
 return '<section class="purchase-section '+extra+'"><h2>'+esc(title)+'</h2>'+content+'</section>';
}
function purchaseText(text,empty='尚未填写'){
 return '<p class="purchase-detail-text'+(text?'':' purchase-unfilled')+'">'+esc(text||empty)+'</p>';
}
function purchaseDetail(r){
 const candidateRows=r.candidates.map(c=>'<article class="purchase-candidate-record"><h3>'+esc(c.name)+'</h3><dl><div><dt>记录价格</dt><dd>'+esc(c.price||'未记录')+'</dd></div><div><dt>报价渠道</dt><dd>'+esc(c.channel||'未记录')+'</dd></div><div><dt>核价日期</dt><dd>'+esc(c.checked_at||'未记录')+'</dd></div></dl>'+(c.notes?purchaseText(c.notes):'')+purchaseLink(c.url,'查看候选资料')+'</article>').join('');
 return '<div class="purchase-detail-meta"><span class="purchase-status">'+esc(PURCHASE_STATUS[r.status])+'</span><span>预算：'+esc(r.budget||'尚未填写')+'</span><span>维护于 '+esc(r.updated.slice(0,10))+'</span></div><div class="purchase-detail-grid">'+
  purchaseSection('当前结论 · '+PURCHASE_ORIGIN[r.origin],purchaseText(r.conclusion,'还没有结论，先把需求留住。'),'purchase-summary-section')+
  purchaseSection('等待条件',purchaseText(r.wait_condition,'未设等待条件')+'<p class="purchase-review-date">回看日期：'+esc(r.review_date||'未指定，按条件回看')+'</p>')+
  purchaseSection('需求与排除项',purchaseText(r.needs),'purchase-detail-wide')+
  purchaseSection('候选与核价记录','<p class="purchase-section-note">保存的历史报价，不是实时价格。</p>'+(candidateRows?'<div class="purchase-candidate-records">'+candidateRows+'</div>':purchaseText('','尚未记录候选')),'purchase-detail-wide')+
  purchaseSection('待核实问题',purchaseText(r.questions,'尚未记录待核实问题'),'purchase-detail-wide')+
  '</div><footer class="purchase-detail-foot"><div class="purchase-detail-sources">'+(r.source_note?'<button class="quiet" data-purchase-note="'+esc(r.id)+'">打开关联笔记</button><span>'+esc(r.source_note)+'</span>':'')+purchaseLink(r.source_url,'查看原始资料')+'</div><p>回看日期不代表新品发布日期或购买承诺；状态由你决定，不自动推进。</p></footer>';
}
function renderPurchases(){
 if(!purchaseState)return;
 const records=purchaseVisible(),selected=selectedPurchase(records);purchaseSelectedId=selected?.id||'';
 $('purchase-count').textContent=records.length+' 项';
 const navKey=JSON.stringify(records.map(r=>[r.id,r.title,r.status,purchaseSelectedId===r.id]));
 if(navKey!==purchaseNavFingerprint){
  $('purchase-nav-list').innerHTML=records.map(r=>'<button class="panel-link purchase-nav-item" data-purchase-select="'+esc(r.id)+'"'+(r.id===purchaseSelectedId?' aria-current="page"':'')+'><span class="purchase-nav-title">'+esc(r.title)+'</span><small>'+esc(PURCHASE_STATUS[r.status])+'</small></button>').join('')||'<p class="nav-empty">'+(purchaseState.records.length?'没有匹配事项':'还没有购买事项')+'</p>';
  purchaseNavFingerprint=navKey;
 }
 const detailKey=JSON.stringify(selected||[purchaseState.records.length]);
 if(detailKey!==purchaseDetailFingerprint){
  $('purchase-detail-title').textContent=selected?.title||'购买决策夹';
  $('purchase-view-context').textContent=selected?.category?'购买决策夹 · '+selected.category:'购买决策夹';
  $('purchase-edit').disabled=$('purchase-copy').disabled=!selected;
  $('purchase-list').innerHTML=selected?purchaseDetail(selected):'<div class="purchase-empty"><h2>'+(purchaseState.records.length?'没有匹配的记录':'把还没决定的购买留在这里')+'</h2><p>'+(purchaseState.records.length?'换个关键词或状态试试。':'在左侧新建事项，记下需求、预算和等待条件。到了决策时，再交给 Claudian 调研。')+'</p>'+(!purchaseState.records.length?'<button data-purchase-new>新建购买事项</button>':'')+'</div>';
  purchaseDetailFingerprint=detailKey;
 }
}
function selectPurchase(id){
 if(!purchaseVisible().some(r=>r.id===id))return;
 const focusWasInList=$('purchase-nav-list').contains(document.activeElement);
 purchaseSelectedId=id;renderPurchases();document.querySelector('.workspace').scrollTop=0;
 if(focusWasInList)$('purchase-nav-list').querySelector('[data-purchase-select="'+id+'"]').focus({preventScroll:true});
 // Keep the list available at narrow widths: it is the module's navigation,
 // not a modal overlay or a row of cards in the content pane.
}
function renderPurchaseHome(){
 const el=$('home-purchase-entry');if(!el)return;
 if(!purchaseState){el.textContent='购买决策夹';return}
 const active=purchaseState.records.filter(r=>!['decided','shelved'].includes(r.status));
 el.innerHTML='购买决策夹'+(active.length?' · '+active.length:'')+homeArrow;
 el.title=active.length?active.slice(0,3).map(r=>r.title+'：'+PURCHASE_STATUS[r.status]).join('；'):'保存需求与等待条件';
}
async function refreshPurchases(){
 if(purchaseBusy)return false;purchaseBusy=true;
 try{purchaseState=await api('purchases');$('purchase-error').hidden=true;renderPurchases();renderPurchaseHome();return true}
 catch(e){$('purchase-error').textContent='购买记录读取失败：'+e.message+'。已有数据未删除。';$('purchase-error').hidden=false;return false}
 finally{purchaseBusy=false}
}
function candidateEditor(c={}){
 const names={name:'候选名称',price:'记录价格',channel:'报价渠道',checked_at:'核价日期',url:'参考链接',notes:'备注'};
 const field=(name)=>'<label>'+names[name]+'<input data-candidate-field="'+name+'" type="'+(name==='checked_at'?'date':name==='url'?'url':'text')+'" maxlength="'+({name:160,price:200,channel:200,url:2000,notes:2000}[name]||10)+'" value="'+esc(c[name]||'')+'"'+(name==='name'?' required':'')+'></label>';
 return '<fieldset class="purchase-candidate"><legend>候选</legend><div class="purchase-candidate-fields">'+['name','price','channel','checked_at','url','notes'].map(field).join('')+'</div><button type="button" class="quiet" data-candidate-remove>移除此候选</button></fieldset>';
}
function openPurchaseEditor(id=''){
 const r=id?purchaseState?.records.find(x=>x.id===id):null;if(id&&!r){toast('记录尚未加载，请刷新后重试');return}
 purchaseEditing=r?structuredClone(r):{id:'',revision:null,candidates:[],status:'research',origin:'user'};
 $('purchase-edit-title').textContent=r?r.title:'新建购买事项';
 for(const name of purchaseFields)$('purchase-'+name).value=purchaseEditing[name]||(['status','origin'].includes(name)?(name==='status'?'research':'user'):'');
 $('purchase-candidates').innerHTML=purchaseEditing.candidates.map(candidateEditor).join('');
 $('purchase-editor-error').hidden=true;$('purchase-discard').hidden=true;$('purchase-save').disabled=false;
 $('purchase-open-note').hidden=!r?.source_note;$('purchase-candidate-add').disabled=purchaseEditing.candidates.length>=12;
 $('purchaseform').querySelectorAll('details').forEach(d=>d.open=false);
 purchaseDirty=false;$('purchaseeditor').showModal();$('purchase-title').focus();
}
function collectPurchaseForm(){
 const record=Object.fromEntries(purchaseFields.map(k=>[k,$('purchase-'+k).value]));
 record.candidates=[...$('purchase-candidates').children].map(row=>Object.fromEntries([...row.querySelectorAll('[data-candidate-field]')].map(input=>[input.dataset.candidateField,input.value])));
 return record;
}
function closePurchaseEditor(){
 if(purchaseSaving)return;
 if(purchaseDirty){$('purchase-discard').hidden=false;$('purchase-discard-confirm').focus();return}
 $('purchaseeditor').close();
}
function showPurchaseBrief(id){
 const r=purchaseState?.records.find(x=>x.id===id);if(!r)return;
 $('purchase-brief-text').value=purchaseBrief(r);$('purchase-brief-copy').textContent='复制给 Claudian';
 $('purchasebrief').showModal();$('purchase-brief-copy').focus();
}
async function copyPurchaseBrief(){
 const area=$('purchase-brief-text');
 // This synchronous, user-initiated fallback works in the existing Electron
 // permission-deny sandbox without exposing clipboard reads or a new IPC API.
 area.focus();area.select();
 try{if(!document.execCommand('copy'))await navigator.clipboard.writeText(area.value);$('purchase-brief-copy').textContent='已复制';toast('已复制；粘贴到 Claudian 即可，未自动发送')}
 catch{area.focus();area.select();toast('系统未允许直接复制，文本已选中，请按 Ctrl+C')}
}
$('purchasemodule').onclick=()=>currentModule==='purchases'?toggleNavigation():selectModule('purchases');
$('purchase-new').onclick=()=>openPurchaseEditor();$('purchase-refresh').onclick=()=>refreshWithFeedback('purchase-refresh',refreshPurchases);
$('purchase-search').oninput=$('purchase-filter').onchange=()=>{renderPurchases()};
$('purchase-edit').onclick=()=>{if(purchaseSelectedId)openPurchaseEditor(purchaseSelectedId)};
$('purchase-copy').onclick=()=>showPurchaseBrief(purchaseSelectedId);
$('purchasenav').addEventListener('click',e=>{const b=e.target.closest('[data-purchase-select]');if(b)selectPurchase(b.dataset.purchaseSelect)});
$('purchase-nav-list').addEventListener('keydown',e=>{
 if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
 const items=[...$('purchase-nav-list').querySelectorAll('[data-purchase-select]')],index=items.indexOf(document.activeElement);if(index<0)return;e.preventDefault();
 const next=e.key==='Home'?0:e.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+(e.key==='ArrowDown'?1:-1)));
 selectPurchase(items[next].dataset.purchaseSelect);const target=$('purchase-nav-list').querySelector('[data-purchase-select="'+items[next].dataset.purchaseSelect+'"]');target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'});
});
$('purchaseview').addEventListener('click',e=>{
 const b=e.target.closest('button');
 if(b?.dataset.purchaseEdit){openPurchaseEditor(b.dataset.purchaseEdit);return}
 if(b?.dataset.purchaseBrief){showPurchaseBrief(b.dataset.purchaseBrief);return}
 if(b?.hasAttribute('data-purchase-new')){openPurchaseEditor();return}
 if(b?.dataset.purchaseNote)api('open_purchase_note',{id:b.dataset.purchaseNote}).catch(err=>toast(err.message));
});
$('purchaseform').addEventListener('input',()=>{purchaseDirty=true;$('purchase-discard').hidden=true});
$('purchaseform').addEventListener('change',()=>{purchaseDirty=true});
$('purchase-candidate-add').onclick=()=>{if($('purchase-candidates').children.length>=12)return;$('purchase-candidates').insertAdjacentHTML('beforeend',candidateEditor());purchaseDirty=true;$('purchase-candidate-add').disabled=$('purchase-candidates').children.length>=12;$('purchase-candidates').lastElementChild.querySelector('input').focus()};
$('purchase-candidates').addEventListener('click',e=>{const b=e.target.closest('[data-candidate-remove]');if(b){b.closest('fieldset').remove();purchaseDirty=true;$('purchase-candidate-add').disabled=false}});
$('purchaseform').onsubmit=async e=>{
 e.preventDefault();if(purchaseSaving)return;purchaseSaving=true;$('purchase-save').disabled=true;$('purchase-editor-error').hidden=true;
 try{const saved=await api('purchase_save',{id:purchaseEditing.id,revision:purchaseEditing.revision,record:collectPurchaseForm()});purchaseSelectedId=saved.record.id;purchaseDirty=false;$('purchaseeditor').close();await refreshPurchases();toast('购买记录已保存在本机')}
 catch(err){$('purchase-editor-error').textContent=err.message;$('purchase-editor-error').hidden=false}
 finally{purchaseSaving=false;$('purchase-save').disabled=false}
};
$('purchase-open-note').onclick=async()=>{if(!purchaseEditing?.id)return;try{await api('open_purchase_note',{id:purchaseEditing.id})}catch(e){toast(e.message)}};
$('purchase-editor-close').onclick=closePurchaseEditor;$('purchase-editor-cancel').onclick=closePurchaseEditor;
$('purchase-discard-confirm').onclick=()=>{purchaseDirty=false;$('purchaseeditor').close()};
$('purchase-discard-keep').onclick=()=>{$('purchase-discard').hidden=true;$('purchase-title').focus()};
$('purchaseeditor').addEventListener('cancel',e=>{e.preventDefault();closePurchaseEditor()});
// Require a complete outside gesture; retain dirty text until explicit discard.
let purchaseBackdropPointer=null;
const purchaseOutside=e=>{const d=$('purchaseeditor'),r=d.getBoundingClientRect();return e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)};
$('purchaseeditor').addEventListener('pointerdown',e=>{purchaseBackdropPointer=purchaseOutside(e)?e.pointerId:null});
$('purchaseeditor').addEventListener('pointerup',e=>{if(purchaseBackdropPointer===e.pointerId&&purchaseOutside(e))closePurchaseEditor();purchaseBackdropPointer=null});
$('purchaseeditor').addEventListener('pointercancel',()=>purchaseBackdropPointer=null);
$('purchasebrief-close').onclick=()=>$('purchasebrief').close();$('purchase-brief-copy').onclick=copyPurchaseBrief;
window.addEventListener('beforeunload',e=>{if(purchaseDirty&&$('purchaseeditor').open){e.preventDefault();e.returnValue=''}});
refreshPurchases();
