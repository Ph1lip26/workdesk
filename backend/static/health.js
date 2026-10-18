/* Private manual weight log. Charts use actual dates and points, not predictions. */
let healthState=null,healthBusy=false,weightEditing=null,weightSaving=false,weightDirty=false,weightDeleteArmed=false;
let healthUnit='kg',healthRange='all',weightHoverChart=null,weightHoverIndex=-1;
let healthSyncResult=null;
let healthRefreshPromise=null;
const weightOrigin=r=>r?.source?'知识库记录'+(r.revision>1?'（已手动修改）':''):'手动测量';
function healthSyncNotice(){
 if(!healthSyncResult)return '';
 const s=healthSyncResult,kg=values=>values.length?values.map(v=>v/1000+'公斤').join('、'):'无';
 return '<aside class="notice" role="status"><div><strong>知识库同步：新增 '+s.added+' 条，已存在或已处理 '+s.existing+' 条'+(s.conflicts.length?'，'+s.conflicts.length+' 天有冲突':'')+'</strong><p class="tile-evidence">来源：'+esc(s.source)+'</p>'+s.conflicts.map(c=>'<p class="tile-note">'+esc(c.day)+'：知识库 '+esc(kg(c.incoming))+'；工作台 '+esc(kg(c.existing))+'。未覆盖，请核对来源后手动选择。</p>').join('')+'</div></aside>';
}
try{if(localStorage.getItem('weight-unit')==='jin')healthUnit='jin'}catch{}
const weightNumber=r=>Number((r.grams/(healthUnit==='jin'?500:1000)).toFixed(3));
const weightUnitLabel=()=>healthUnit==='jin'?'斤':'公斤';
const localDate=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
function weightPoints(records){
 const daily=new Map();for(const r of records)daily.set(r.day,r);
 return [...daily.values()].sort((a,b)=>a.day.localeCompare(b.day));
}
function weightChart(records,mini=false){
 const points=weightPoints(records);
 if(!points.length||(!mini&&points.length<2))return '<p class="tile-note">'+(points.length?'再记录一天即可查看趋势':'尚未记录体重')+'</p>';
 const width=640,height=mini?70:220,left=mini?8:56,right=12,top=16,bottom=mini?8:34;
 const times=points.map(r=>Date.parse(r.day+'T00:00:00Z')),values=points.map(weightNumber);
 const min=Math.min(...values),max=Math.max(...values),padding=Math.max((max-min)*.15,healthUnit==='kg'?.25:.5),lo=min-padding,hi=max+padding;
 const x=t=>points.length===1?width/2:left+(t-times[0])/(times.at(-1)-times[0])*(width-left-right);
 const y=v=>top+(hi-v)/(hi-lo)*(height-top-bottom);
 const path=values.map((v,i)=>x(times[i]).toFixed(2)+','+y(v).toFixed(2)).join(' ');
 const axis=mini?'':[0,.5,1].map(p=>{const v=lo+(hi-lo)*p,cy=y(v);return '<line class="weight-gridline" x1="'+left+'" x2="'+(width-right)+'" y1="'+cy+'" y2="'+cy+'"/><text x="'+(left-9)+'" y="'+(cy+4)+'" text-anchor="end">'+v.toFixed(1)+'</text>'}).join('')+'<text x="'+left+'" y="'+(height-5)+'">'+points[0].day+'</text><text x="'+(width-right)+'" y="'+(height-5)+'" text-anchor="end">'+points.at(-1).day+'</text>';
 const chart='<svg class="weight-chart '+(mini?'weight-chart-mini':'')+'" viewBox="0 0 '+width+' '+height+'" '+(mini?'aria-hidden="true"':'role="img" aria-label="体重记录曲线，共'+points.length+'个测量日，单位'+weightUnitLabel()+'"')+'>'+axis+(points.length>1?'<polyline points="'+path+'"/>':'')+'<line class="weight-hover-guide" y1="'+(mini?8:top)+'" y2="'+(height-bottom)+'" hidden/>'+values.map((v,i)=>'<circle cx="'+x(times[i])+'" cy="'+y(v)+'" r="'+(mini?2:3)+'" data-day="'+points[i].day+'" data-grams="'+points[i].grams+'"/>').join('')+'</svg>';
 return '<div class="weight-chart-interactive" tabindex="0" role="group" aria-label="体重趋势。悬停或轻点查看测量日期与体重；左右方向键切换，Home和End查看首末点，Escape关闭。">'+chart+'</div>';
}
function renderHealthHome(){
 if(typeof homeDrag!=='undefined'&&homeDrag)return;
 const el=$('home-health-summary');if(!el)return;
 if(weightHoverChart&&el.contains(weightHoverChart))closeWeightTooltip();
 if(!healthState){el.innerHTML='<p class="tile-note">正在读取体重记录…</p>';return}
 const rows=healthState.records,last=rows.at(-1);
 el.innerHTML=last?'<div class="collection-total"><strong>'+weightNumber(last)+'</strong><span>'+weightUnitLabel()+'</span></div><p class="tile-evidence">'+esc(last.day)+' · '+weightOrigin(last)+'</p>'+weightChart(rows.slice(-30),true):'<p class="tile-note">还没有体重记录</p><button class="home-source quiet" data-health-add>＋ 记录一次体重</button>';
}
function renderHealth(){
 const el=$('healthview');if(!el)return;
 if(weightHoverChart&&el.contains(weightHoverChart))closeWeightTooltip();
 const records=healthState?.records||[],last=records.at(-1),today=Date.parse(localDate()+'T00:00:00Z');
 const visible=healthRange==='all'?records:records.filter(r=>Date.parse(r.day+'T00:00:00Z')>=today-(Number(healthRange)-1)*86400000);
 el.innerHTML='<header class="purchase-header"><div><p class="view-context">体重记录</p><h1>个人健康</h1></div><div class="purchase-header-actions"><button id="health-refresh" class="quiet">刷新</button><button data-health-add class="primary">＋ 记录体重</button></div></header>'+healthSyncNotice()+'<div class="health-summary purchase-section"><div><span class="muted">最新测量</span><div class="weight-current">'+(last?weightNumber(last):'—')+'<span>'+weightUnitLabel()+'</span></div><p class="tile-evidence">'+(last?esc(last.day)+' · '+weightOrigin(last):'尚未记录，不显示推测数值')+'</p></div><div class="health-unit-control"><label for="health-unit">显示单位</label><select id="health-unit"><option value="kg" '+(healthUnit==='kg'?'selected':'')+'>公斤</option><option value="jin" '+(healthUnit==='jin'?'selected':'')+'>斤</option></select></div></div><section class="purchase-section health-trend"><div class="health-section-heading"><h2>体重趋势</h2><label><span class="sr-only">趋势时间范围</span><select id="health-range">'+[['30','近30天'],['90','近90天'],['all','全部记录']].map(([v,t])=>'<option value="'+v+'" '+(healthRange===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label></div>'+weightChart(visible)+'<p class="tile-evidence">按实际测量日期连接；同一天多次测量取最后录入的一次。空白日不补数，单次涨跌不判定为增脂或减脂。</p></section><section class="purchase-section"><div class="health-section-heading"><h2>历史记录</h2><span class="muted">'+records.length+'条 · 点击修改</span></div><div class="weight-history">'+(records.length?[...records].reverse().map(r=>'<button class="weight-row quiet" data-weight-edit="'+esc(r.id)+'"><span>'+esc(r.day)+'</span><strong>'+weightNumber(r)+' '+weightUnitLabel()+'</strong><span>'+weightOrigin(r)+' · 修改</span></button>').join(''):'<p class="tile-note">称完后手动记录一次，从第一条真实数据开始。</p>')+'</div></section><p class="tile-evidence">数据仅保存在本机。这里只记录体重，不做健康评分或诊断。</p>';
}
async function refreshHealth({sync=false}={}){
 if(healthBusy)return sync?healthRefreshPromise.then(()=>refreshHealth({sync:true})):healthRefreshPromise;
 healthBusy=true;
 healthRefreshPromise=(async()=>{
  try{if(sync)healthSyncResult=await api('health_sync',{});healthState=await api('health');renderHealth();renderHealthHome();return true}
  catch(e){toast('体重记录读取失败：'+e.message);return false}finally{healthBusy=false}
 })();
 return healthRefreshPromise;
}
function openWeightEditor(id=''){
 weightEditing=id?healthState?.records.find(r=>r.id===id):null;if(id&&!weightEditing)return;
 weightDirty=false;weightDeleteArmed=false;$('weight-close').textContent='关闭';$('weight-editor-title').textContent=id?'修改体重':'记录体重';
 $('weight-day').value=weightEditing?.day||localDate();$('weight-day').max=localDate();$('weight-unit').value=healthUnit;
 $('weight-value').value=weightEditing?weightNumber(weightEditing):'';$('weight-value').step=healthUnit==='kg'?'0.001':'0.002';
 $('weight-delete').hidden=!weightEditing;$('weight-delete').textContent='删除记录';$('weight-error').hidden=true;
 $('weighteditor').showModal();$('weight-value').focus();
}
function closeWeightEditor(){
 if(weightSaving)return;
 if(weightDirty&&$('weight-close').textContent!=='放弃修改并关闭'){$('weight-close').textContent='放弃修改并关闭';$('weight-error').textContent='有未保存的修改；再次点击关闭将放弃。';$('weight-error').hidden=false;return}
 $('weighteditor').close();$('weight-close').textContent='关闭';weightDirty=false;
}
$('weight-close').onclick=closeWeightEditor;
$('weighteditor').addEventListener('cancel',e=>{e.preventDefault();closeWeightEditor()});
$('weighteditor').addEventListener('click',e=>{if(e.target!==$('weighteditor'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeWeightEditor()});
$('weight-form').addEventListener('input',()=>{weightDirty=true;weightDeleteArmed=false;$('weight-delete').textContent='删除记录';$('weight-close').textContent='关闭'});
$('weight-unit').onchange=()=>{
 const input=$('weight-value'),previous=input.step==='0.001'?'kg':'jin',unit=$('weight-unit').value;
 if(input.value&&Number.isFinite(Number(input.value)))input.value=Number((Number(input.value)*(previous==='kg'?2:.5)).toFixed(3));
 input.step=unit==='kg'?'0.001':'0.002';weightDirty=true;
};
async function mutateWeight(action,payload){
 if(weightSaving)return;weightSaving=true;for(const id of ['weight-save','weight-delete','weight-close'])$(id).disabled=true;
 try{await api(action,payload);healthSyncResult=null;weightDirty=false;$('weighteditor').close();$('weight-close').textContent='关闭';await refreshHealth();toast(action==='health_save'?'体重已保存':'记录已删除')}
 catch(e){$('weight-error').textContent=e.message;$('weight-error').hidden=false}
 finally{weightSaving=false;for(const id of ['weight-save','weight-delete','weight-close'])$(id).disabled=false}
}
$('weight-form').onsubmit=e=>{e.preventDefault();mutateWeight('health_save',{id:weightEditing?.id||'',revision:weightEditing?.revision,day:$('weight-day').value,value:$('weight-value').value,unit:$('weight-unit').value})};
$('weight-delete').onclick=()=>{
 if(!weightEditing||weightSaving)return;
 if(!weightDeleteArmed){weightDeleteArmed=true;$('weight-delete').textContent='确认删除这条记录';return}
 mutateWeight('health_delete',{id:weightEditing.id,revision:weightEditing.revision});
};
document.addEventListener('click',e=>{
 const add=e.target.closest('[data-health-add]');if(add){e.preventDefault();e.stopPropagation();openWeightEditor();return}
 const edit=e.target.closest('[data-weight-edit]');if(edit)openWeightEditor(edit.dataset.weightEdit);
 if(e.target.closest('#health-refresh'))refreshWithFeedback('health-refresh',()=>refreshHealth({sync:true}));
});
document.addEventListener('change',e=>{
 if(e.target.id==='health-unit'){healthUnit=e.target.value;try{localStorage.setItem('weight-unit',healthUnit)}catch{}renderHealth();renderHealthHome()}
 if(e.target.id==='health-range'){healthRange=e.target.value;renderHealth()}
});
$('healthmodule').onclick=()=>currentModule==='health'?toggleNavigation():selectModule('health');
$('health-weight').onclick=()=>{if(currentModule!=='health')selectModule('health');$('healthview').focus({preventScroll:true});closeCompactNavigation()};
refreshHealth();

/* One tooltip outside the tile: no reflow, clipped labels or blocked card link. */

function closeWeightTooltip(){
 if(weightHoverChart){weightHoverChart.querySelectorAll('circle').forEach(p=>p.classList.remove('weight-point-active'));weightHoverChart.querySelector('.weight-hover-guide')?.setAttribute('hidden','');weightHoverChart.removeAttribute('aria-describedby')}
 const tip=$('weight-point-tooltip');if(tip)tip.hidden=true;
 weightHoverChart=null;weightHoverIndex=-1;
}
function showWeightPoint(chart,index){
 const points=[...chart.querySelectorAll('circle')];if(!points.length)return;
 index=Math.max(0,Math.min(points.length-1,index));if(weightHoverChart!==chart)closeWeightTooltip();
 weightHoverChart=chart;weightHoverIndex=index;
 let tip=$('weight-point-tooltip');if(!tip){tip=document.createElement('div');tip.id='weight-point-tooltip';tip.className='weight-point-tooltip';tip.setAttribute('role','tooltip');tip.setAttribute('aria-live','polite');document.body.append(tip)}
 const point=points[index],grams=Number(point.dataset.grams),kg=Number((grams/1000).toFixed(3)),jin=Number((grams/500).toFixed(3));
 const text=point.dataset.day+' · '+(healthUnit==='jin'?jin+' 斤 · '+kg+' 公斤':kg+' 公斤 · '+jin+' 斤');
 if(tip.textContent!==text)tip.textContent=text;tip.hidden=false;chart.setAttribute('aria-describedby',tip.id);
 points.forEach((p,i)=>p.classList.toggle('weight-point-active',i===index));
 const guide=chart.querySelector('.weight-hover-guide');guide.setAttribute('x1',point.getAttribute('cx'));guide.setAttribute('x2',point.getAttribute('cx'));guide.removeAttribute('hidden');
 const svg=chart.querySelector('svg'),at=svg.createSVGPoint();at.x=Number(point.getAttribute('cx'));at.y=Number(point.getAttribute('cy'));
 const anchor=at.matrixTransform(svg.getScreenCTM()),rect=tip.getBoundingClientRect();
 tip.style.left=Math.max(8,Math.min(innerWidth-rect.width-8,anchor.x-rect.width/2))+'px';
 const preferredTop=anchor.y-rect.height-12>=8?anchor.y-rect.height-12:anchor.y+14;
 tip.style.top=Math.max(8,Math.min(innerHeight-rect.height-8,preferredTop))+'px';
}
function weightPointAt(chart,event){
 const svg=chart.querySelector('svg'),at=svg.createSVGPoint();at.x=event.clientX;at.y=event.clientY;
 const x=at.matrixTransform(svg.getScreenCTM().inverse()).x;
 const points=[...svg.querySelectorAll('circle')];let index=0,distance=Infinity;
 points.forEach((p,i)=>{const d=Math.abs(Number(p.getAttribute('cx'))-x);if(d<distance){distance=d;index=i}});return index;
}
document.addEventListener('pointermove',e=>{const chart=e.target.closest('.weight-chart-interactive');if(chart&&e.pointerType!=='touch')showWeightPoint(chart,weightPointAt(chart,e))});
document.addEventListener('pointerout',e=>{const chart=e.target.closest('.weight-chart-interactive');if(chart&&!chart.contains(e.relatedTarget)&&document.activeElement!==chart&&e.pointerType!=='touch')closeWeightTooltip()});
document.addEventListener('pointerdown',e=>{const chart=e.target.closest('.weight-chart-interactive');if(chart){showWeightPoint(chart,weightPointAt(chart,e));e.stopPropagation()}else closeWeightTooltip()});
document.addEventListener('click',e=>{if(e.target.closest('.weight-chart-interactive')){e.preventDefault();e.stopPropagation()}},true);
document.addEventListener('focusin',e=>{if(e.target.matches('.weight-chart-interactive'))showWeightPoint(e.target,e.target.querySelectorAll('circle').length-1)});
document.addEventListener('focusout',e=>{if(e.target.matches('.weight-chart-interactive'))closeWeightTooltip()});
document.addEventListener('keydown',e=>{
 const chart=e.target.closest('.weight-chart-interactive');if(!chart)return;
 if(e.key==='Escape'){closeWeightTooltip();e.preventDefault();e.stopPropagation();return}
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
 e.preventDefault();e.stopPropagation();const last=chart.querySelectorAll('circle').length-1,current=weightHoverChart===chart?weightHoverIndex:last;
 showWeightPoint(chart,e.key==='Home'?0:e.key==='End'?last:current+(e.key==='ArrowLeft'?-1:1));
});
window.addEventListener('resize',closeWeightTooltip);
document.addEventListener('scroll',closeWeightTooltip,true);
