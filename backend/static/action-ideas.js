/* Manual generation from selected processed notes; opening history never calls a model. */
let ideaRecords=[],ideaRun='',ideaSources=[],ideaRequestBusy=false,ideaPoll;
const IDEA_MARKS={unmarked:'未标记',interested:'想做',later:'先储备',dismissed:'不考虑'};
function ideaSelectedNotes(){return [...selection].map(id=>state?.videos.find(v=>v.id===id)).filter(v=>v?.note)}
function ideaError(message){$('ideas-error').textContent=message;$('ideas-error').hidden=!message}
function ideaActiveRecord(){return ideaRecords.find(r=>r.id===ideaRun)||null}
function ideaHistory(){
 $('ideas-history').innerHTML=ideaRecords.length?ideaRecords.map(r=>{
  const name=r.result?.ideas?.[0]?.title||r.payload.goal||r.payload.sources.map(s=>s.title).join('、');
  return '<button class="idea-history-item'+(r.id===ideaRun?' selected':'')+'" data-idea-run="'+esc(r.id)+'" type="button"'+(r.id===ideaRun?' aria-current="true"':'')+'><span>'+esc(name.slice(0,45))+'</span><small>'+new Date(r.created*1000).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+' · '+({running:'正在生成',completed:'已生成',failed:'未完成'}[r.status]||r.status)+'</small></button>';
 }).join(''):'<p class="muted">生成后会保存在这里。</p>';
}
function ideaSourceButton(source){return '<button type="button" class="quiet idea-source" data-idea-video="'+esc(source.video)+'">'+esc(source.title)+'</button>'}
function paintIdeaRecord(){
 ideaHistory();const row=ideaActiveRecord(),host=$('ideas-result');
 if(!row){host.innerHTML='<div class="ideas-empty"><h3>让收藏接上下一步</h3><p>从素材列表勾选知识笔记，再说明你想解决的问题。这里会留下适用理由、可复用内容和最小成果。</p></div>';return}
 const meta=row.payload,sourceList=meta.sources.map(ideaSourceButton).join('');
 const head='<div class="idea-run-meta"><p>'+esc(meta.goal||'未指定个人目标 · 按资料通用适用性推荐')+'</p><div class="idea-sources">'+sourceList+'</div></div>';
 if(row.status==='running'){host.innerHTML=head+'<div class="idea-running" role="status"><span class="idea-spinner" aria-hidden="true"></span><div><h3>正在整理行动建议</h3><p>正在读取所选笔记、比较适用性并核对来源。关闭此面板后仍会继续。</p></div></div>';return}
 if(row.status==='failed'){host.innerHTML=head+'<div class="notice" role="alert">'+esc(row.error||'生成未完成，请重新选择资料后重试')+'</div>';return}
 const cards=(row.result.ideas||[]).map((idea,index)=>{
  const details=[['适合的理由',idea.why],['可复用的部分',idea.reuse],['第一步',idea.first_step],['最小成果',idea.deliverable],['投入 · AI估计',idea.effort]];
  const evidence=idea.evidence.map(e=>{const source=meta.sources.find(s=>s.id===e.source_id);return source?'<div class="idea-evidence">'+ideaSourceButton(source)+'<blockquote>'+esc(e.quote)+'</blockquote></div>':''}).join('');
  return '<article class="idea-card"><header><div><span class="idea-kicker">AI建议 · '+(idea.timing==='now'?'现在可考虑':'以后再看')+'</span><h3>'+esc(idea.title)+'</h3></div><label class="idea-mark">我的标记<select data-idea-mark="'+index+'">'+Object.entries(IDEA_MARKS).map(([key,label])=>'<option value="'+key+'"'+((row.marks[String(index)]||'unmarked')===key?' selected':'')+'>'+label+'</option>').join('')+'</select></label></header><dl>'+details.map(([label,text])=>'<div><dt>'+label+'</dt><dd>'+esc(text)+'</dd></div>').join('')+'</dl>'+(idea.questions.length?'<div class="idea-questions"><h4>开始前待确认</h4><ul>'+idea.questions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul></div>':'')+'<details class="idea-references"><summary>查看依据 · '+idea.evidence.length+'处生成时原文</summary>'+evidence+'</details><button type="button" class="quiet" data-idea-copy="'+index+'">复制项目上下文</button></article>';
 }).join('');
 host.innerHTML=head+'<p class="idea-summary">'+esc(row.result.summary)+'</p>'+(cards||'<p class="muted">本批没有足够依据的项目候选，可换一组资料或补充目标。</p>');
}
function paintIdeaSelection(){
 $('ideas-selection').textContent=ideaSources.length?'本次资料：'+ideaSources.map(v=>cleanTitle(v.title||v.note.split('/').at(-1))).join('、'):'先从素材列表勾选已生成知识笔记的条目。';
 const pending=[...selection].length-ideaSources.length;
 $('ideas-omitted').hidden=!pending;$('ideas-omitted').textContent='另有'+pending+'条尚未生成知识笔记，未加入本次资料。';
 const invalid=ideaSources.length<1||ideaSources.length>8;
 $('ideas-generate').disabled=ideaRequestBusy||invalid||ideaRecords.some(r=>r.status==='running');
 $('ideas-generate').textContent=ideaRequestBusy?'正在提交…':'生成行动建议';
 if(ideaSources.length>8)ideaError('每次最多8篇知识笔记，请减少勾选后重新打开。');
}
async function loadIdeas(){
 const data=await api('actions');ideaRecords=data.records||[];
 if(ideaRun&&!ideaRecords.some(r=>r.id===ideaRun))ideaRun='';
 if(!ideaRun&&ideaRecords.length)ideaRun=ideaRecords[0].id;
 paintIdeaSelection();paintIdeaRecord();
 clearTimeout(ideaPoll);
 if($('actionideas').open&&data.running)ideaPoll=setTimeout(()=>loadIdeas().catch(e=>ideaError(e.message)),3500);
}
async function openIdeas(){
 ideaSources=ideaSelectedNotes();ideaError('');paintIdeaSelection();
 if(!$('actionideas').open)$('actionideas').showModal();
 try{await loadIdeas()}catch(error){ideaError(error.message)}
}
$('ideasopen').onclick=openIdeas;$('ideas-from-selection').onclick=openIdeas;
$('ideas-close').onclick=()=>$('actionideas').close();
$('actionideas').addEventListener('close',()=>clearTimeout(ideaPoll));
$('ideas-new').onclick=()=>{ideaRun='';paintIdeaRecord();$('ideas-goal').focus()};
$('ideas-generate').onclick=async()=>{
 if(ideaRequestBusy||!ideaSources.length||ideaSources.length>8)return;
 ideaRequestBusy=true;ideaError('');paintIdeaSelection();
 try{const result=await api('action_generate',{ids:ideaSources.map(v=>v.id),goal:$('ideas-goal').value});ideaRun=result.id;await loadIdeas()}
 catch(error){ideaError(error.message)}finally{ideaRequestBusy=false;paintIdeaSelection()}
};
$('ideas-history').addEventListener('click',event=>{const button=event.target.closest('[data-idea-run]');if(button){ideaRun=button.dataset.ideaRun;paintIdeaRecord()}});
$('ideas-result').addEventListener('change',async event=>{
 const select=event.target.closest('[data-idea-mark]'),row=ideaActiveRecord();if(!select||!row)return;
 const index=Number(select.dataset.ideaMark),previous=row.marks[String(index)]||'unmarked',mark=select.value;select.disabled=true;
 try{await api('action_mark',{id:row.id,index,mark});row.marks[String(index)]=mark;toast('已保存你的标记')}
 catch(error){select.value=previous;ideaError(error.message)}finally{select.disabled=false}
});
$('ideas-result').addEventListener('click',async event=>{
 const source=event.target.closest('[data-idea-video]');
 if(source){try{await api('open_note',{video:source.dataset.ideaVideo});toast('已打开来源笔记')}catch(error){ideaError(error.message)}return}
 const copy=event.target.closest('[data-idea-copy]'),row=ideaActiveRecord();if(!copy||!row)return;
 const idea=row.result.ideas[Number(copy.dataset.ideaCopy)];if(!idea)return;
 const text=['以下是AI项目候选，请先确认需求与待核实事项，未经我明确授权不要开始执行。','',idea.title,'当前目标：'+(row.payload.goal||'未指定'),'适合的理由：'+idea.why,'可复用：'+idea.reuse,'第一步：'+idea.first_step,'最小成果：'+idea.deliverable,'投入（AI估计）：'+idea.effort,'待确认：'+(idea.questions.join('；')||'无新增问题'),'我的标记：'+IDEA_MARKS[row.marks[copy.dataset.ideaCopy]||'unmarked'],'','来源与原文：',...idea.evidence.map(e=>{const s=row.payload.sources.find(s=>s.id===e.source_id);return '[['+s.note+']]\n'+e.quote})].join('\n');
 try{await navigator.clipboard.writeText(text);toast('已复制项目上下文')}catch{ideaError('未能访问剪贴板，请重试。')}
});
