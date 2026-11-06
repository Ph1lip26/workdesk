/* User-entered local history; no diagnoses, inferred dates or automatic imports. */
let healthPage='weight',illnessState=null,illnessBusy=false,illnessEditing=null,illnessDirty=false,illnessSaving=false,illnessDiscard=false,illnessDeleteArmed=false;
function renderIllness(){
 const rows=illnessState?.records;
 $('healthview').innerHTML='<header class="purchase-header"><div><p class="view-context">个人健康</p><h1>生病记录</h1></div><div class="purchase-header-actions"><button id="illness-refresh" class="quiet">刷新</button><button data-illness-add class="primary">记录一次生病</button></div></header><p class="tile-evidence">记录你实际经历的症状与经过，仅保存在本机，不作诊断。</p><div class="illness-history">'+(rows?.length?rows.map(r=>'<article class="purchase-section illness-record"><header><time datetime="'+esc(r.day)+'">'+esc(r.day)+'</time><button class="quiet" data-illness-edit="'+esc(r.id)+'">修改记录</button></header><h2>'+esc(r.symptoms)+'</h2>'+(r.content?'<p class="illness-content">'+esc(r.content)+'</p>':'<p class="tile-evidence">未填写补充内容</p>')+'</article>').join(''):rows?'<div class="purchase-empty"><h2>还没有生病记录</h2><p>可补记过去的生病日期、症状和经过。</p><button data-illness-add>添加第一条记录</button></div>':'<p class="tile-note">正在读取记录…</p>')+'</div>';
}
async function refreshIllness(){
 if(illnessBusy)return false;illnessBusy=true;
 try{illnessState=await api('illness');if(healthPage==='illness')renderIllness();return true}
 catch(e){toast('生病记录读取失败，已有记录保留：'+e.message);return false}
 finally{illnessBusy=false}
}
function selectHealthPage(page){
 healthPage=page==='illness'?'illness':'weight';closeWeightTooltip();
 for(const button of $('healthnav').querySelectorAll('[data-health-page]')){
  if(button.dataset.healthPage===healthPage)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 }
 if(currentModule!=='health')selectModule('health');
 if(healthPage==='illness'){renderIllness();refreshIllness()}else{renderHealth();refreshHealth()}
 $('healthview').focus({preventScroll:true});document.querySelector('.workspace').scrollTop=0;closeCompactNavigation();
}
function openIllnessEditor(id=''){
 illnessEditing=id?illnessState?.records.find(r=>r.id===id):null;
 if(id&&!illnessEditing){toast('记录尚未加载，请刷新后重试');return}
 illnessDirty=illnessDiscard=illnessDeleteArmed=false;
 $('illness-editor-title').textContent=id?'修改生病记录':'记录一次生病';
 $('illness-day').value=illnessEditing?.day||localDate();$('illness-day').max=localDate();
 $('illness-symptoms').value=illnessEditing?.symptoms||'';$('illness-content').value=illnessEditing?.content||'';
 $('illness-error').hidden=true;$('illness-close').textContent='关闭';$('illness-delete').hidden=!id;$('illness-delete').textContent='删除记录';
 $('illnesseditor').showModal();$('illness-symptoms').focus();
}
function closeIllnessEditor(){
 if(illnessSaving)return;
 if(illnessDirty&&!illnessDiscard){illnessDiscard=true;$('illness-close').textContent='放弃修改并关闭';$('illness-error').textContent='有未保存的修改；再次点击关闭将放弃。';$('illness-error').hidden=false;return}
 $('illnesseditor').close();illnessDirty=false;
}
async function mutateIllness(name,data){
 if(illnessSaving)return;illnessSaving=true;
 for(const id of ['illness-save','illness-delete','illness-close'])$(id).disabled=true;
 try{await api(name,data);illnessDirty=false;$('illnesseditor').close();await refreshIllness();toast(name==='illness_save'?'生病记录已保存':'记录已删除')}
 catch(e){$('illness-error').textContent=e.message;$('illness-error').hidden=false}
 finally{illnessSaving=false;for(const id of ['illness-save','illness-delete','illness-close'])$(id).disabled=false}
}
$('illness-close').onclick=closeIllnessEditor;
$('illnesseditor').addEventListener('cancel',e=>{e.preventDefault();closeIllnessEditor()});
$('illness-form').addEventListener('input',()=>{illnessDirty=true;illnessDiscard=illnessDeleteArmed=false;$('illness-close').textContent='关闭';$('illness-delete').textContent='删除记录'});
$('illness-form').onsubmit=e=>{e.preventDefault();mutateIllness('illness_save',{id:illnessEditing?.id||'',revision:illnessEditing?.revision,day:$('illness-day').value,symptoms:$('illness-symptoms').value,content:$('illness-content').value})};
$('illness-delete').onclick=()=>{
 if(!illnessEditing||illnessSaving)return;
 if(!illnessDeleteArmed){illnessDeleteArmed=true;$('illness-delete').textContent='确认删除这条记录';return}
 mutateIllness('illness_delete',{id:illnessEditing.id,revision:illnessEditing.revision});
};
let illnessBackdropPointer=null;
const outsideIllness=e=>{const r=$('illnesseditor').getBoundingClientRect();return e.target===$('illnesseditor')&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)};
$('illnesseditor').addEventListener('pointerdown',e=>{illnessBackdropPointer=outsideIllness(e)?e.pointerId:null});
$('illnesseditor').addEventListener('pointerup',e=>{if(illnessBackdropPointer===e.pointerId&&outsideIllness(e))closeIllnessEditor();illnessBackdropPointer=null});
$('illnesseditor').addEventListener('pointercancel',()=>{illnessBackdropPointer=null});
document.addEventListener('click',e=>{
 if(e.target.closest('[data-illness-add]')){openIllnessEditor();return}
 const edit=e.target.closest('[data-illness-edit]');if(edit)openIllnessEditor(edit.dataset.illnessEdit);
 if(e.target.closest('#illness-refresh'))refreshWithFeedback('illness-refresh',refreshIllness);
});
$('health-weight').onclick=()=>selectHealthPage('weight');
$('health-illness').onclick=()=>selectHealthPage('illness');
$('health-illness').prepend($('queueopen').querySelector('svg').cloneNode(true));
