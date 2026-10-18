/* Local module order. Logo and settings never move. */
const RAIL_IDS=['home','douyin','purchases','health'];
let railOrder=[...RAIL_IDS],railSavedOrder=[...RAIL_IDS],railDrag=null,railLanding=null,railSaving=false,railConsumedClick=false;
const railMoves=new Map();
const railButton=name=>$(moduleRegistry[name].button);
const validRailOrder=order=>Array.isArray(order)&&order.length===RAIL_IDS.length&&new Set(order).size===order.length&&order.every(id=>RAIL_IDS.includes(id));
function applyRailOrder(order,animate=false,skip=null){
 if(!validRailOrder(order))return;
 const moving=animate&&navigationMotionEnabled(),before=moving?new Map(RAIL_IDS.map(id=>[railButton(id),railButton(id).getBoundingClientRect()])):null;
 railMoves.forEach(a=>a.cancel());railMoves.clear();railOrder=[...order];
 const stack=$('modules');for(const [i,id] of order.entries()){
  const b=railButton(id);
  if(railDrag?.active)b.style.order=String(i);
  else{b.style.order='';if(stack.children[i]!==b)stack.insertBefore(b,stack.children[i]||null)}
 }
 const ends=moving?new Map(RAIL_IDS.map(id=>{const b=railButton(id);return [b,b.getBoundingClientRect()]})):null;
 if(ends)for(const [b,r] of before){
  if(b===railDrag?.button||b===skip)continue;
  const dy=r.top-ends.get(b).top;if(Math.abs(dy)<1)continue;
  const a=b.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0px)'}],{duration:260,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});railMoves.set(b,a);
  a.finished.then(()=>{if(railMoves.get(b)===a){railMoves.delete(b);a.cancel()}}).catch(()=>{});
 }
}
function syncRailOrder(){
 if(railDrag||railLanding||railSaving||!state)return;
 const order=validRailOrder(state.module_order)?state.module_order:RAIL_IDS;railSavedOrder=[...order];
 if(JSON.stringify(order)!==JSON.stringify(railOrder))applyRailOrder(order);
}
function activateRailDrag(d){
 if(railDrag!==d)return;
 d.active=true;railConsumedClick=true;moduleGlyphAnimations.forEach(a=>a.cancel());moduleGlyphAnimations.clear();
 railMoves.forEach(a=>a.cancel());railMoves.clear();
 d.slots=railOrder.map(id=>railButton(id).getBoundingClientRect());
 const r=d.button.getBoundingClientRect();d.ghost=d.button.cloneNode(true);d.ghost.removeAttribute('id');d.ghost.removeAttribute('aria-controls');d.ghost.removeAttribute('aria-expanded');d.ghost.setAttribute('aria-hidden','true');d.ghost.tabIndex=-1;d.ghost.inert=true;
 d.ghost.classList.add('rail-drag-preview');Object.assign(d.ghost.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});document.body.append(d.ghost);
 d.ox=d.x;d.oy=d.y;d.button.classList.add('rail-drag-placeholder');d.button.setAttribute('aria-grabbed','true');document.body.classList.add('rail-sorting');
 toast('拖动交换位置 · Esc 取消');
}
function moveRailDrag(){
 const d=railDrag;if(!d?.active)return;
 d.ghost.style.transform=`translate(${d.x-d.ox}px,${d.y-d.oy}px)`;
 const slot=d.slots.findIndex(r=>d.x>=r.left-36&&d.x<=r.right+36&&d.y>=r.top&&d.y<=r.bottom);
 if(slot<0||railOrder[slot]===d.id)return;
 const order=[...railOrder],from=order.indexOf(d.id);[order[from],order[slot]]=[order[slot],order[from]];applyRailOrder(order,true);
}
async function finishRailDrag(cancel=false){
 const d=railDrag;if(!d)return;railDrag=null;clearTimeout(d.timer);cancelAnimationFrame(d.frame);
 if($('modules').hasPointerCapture(d.pointerId))$('modules').releasePointerCapture(d.pointerId);
 // Commit flex order to DOM without snapping neighbors out of an in-flight swap.
 if(d.active)applyRailOrder(cancel?d.before:railOrder,true,d.button);
 document.body.classList.remove('rail-sorting');d.button.removeAttribute('aria-grabbed');
 if(d.ghost){
  const g=d.ghost,r=d.button.getBoundingClientRect();
  const done=()=>{g.remove();d.button.classList.remove('rail-drag-placeholder');railLanding=null;d.button.focus({preventScroll:true})};
  if(!cancel&&navigationMotionEnabled()){
   railLanding=g;g.animate([{transform:getComputedStyle(g).transform},{transform:`translate(${r.left-parseFloat(g.style.left)}px,${r.top-parseFloat(g.style.top)}px)`}],{duration:220,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'}).finished.catch(()=>{}).finally(done);
  }else done();
 }
 if(!d.active){setTimeout(()=>{railConsumedClick=false},350);return}
 setTimeout(()=>{railConsumedClick=false},350);
 if(cancel||JSON.stringify(d.before)===JSON.stringify(railOrder))return;
 railSaving=true;const order=[...railOrder];
 try{const result=await api('module_order',{order});railSavedOrder=[...result.order];if(state)state.module_order=[...result.order];toast('导航顺序已保存')}
 catch(e){applyRailOrder(railSavedOrder,true);toast('导航顺序未保存：'+e.message)}
 finally{railSaving=false}
}
$('modules').addEventListener('pointerdown',e=>{
 const button=e.target.closest('#modules>.rail-button');if(!button||e.button!==0||railSaving||railLanding||document.querySelector('dialog:modal'))return;
 finishRailDrag(true);const id=RAIL_IDS.find(id=>railButton(id)===button);
 e.preventDefault();button.focus({preventScroll:true});railConsumedClick=true;$('modules').setPointerCapture(e.pointerId);
 const d=railDrag={id,button,pointerId:e.pointerId,before:[...railOrder],x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,active:false};
 d.timer=setTimeout(()=>activateRailDrag(d),250);
});
document.addEventListener('pointermove',e=>{
 const d=railDrag;if(!d||d.pointerId!==e.pointerId)return;d.x=e.clientX;d.y=e.clientY;
 if(!d.active){if(Math.hypot(d.x-d.sx,d.y-d.sy)>8)finishRailDrag(true);return}
 e.preventDefault();if(!d.frame)d.frame=requestAnimationFrame(()=>{d.frame=0;moveRailDrag()});
});
document.addEventListener('pointerup',e=>{if(railDrag?.pointerId===e.pointerId){const d=railDrag;moveRailDrag();finishRailDrag();if(!d.active)d.button.click()}},true);
document.addEventListener('pointercancel',e=>{if(railDrag?.pointerId===e.pointerId)finishRailDrag(true)});
document.addEventListener('lostpointercapture',e=>{if(e.target===$('modules')&&railDrag?.pointerId===e.pointerId)finishRailDrag(true)});
$('modules').addEventListener('click',e=>{if(railConsumedClick&&e.isTrusted){e.preventDefault();e.stopImmediatePropagation();railConsumedClick=false}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&railDrag){e.preventDefault();finishRailDrag(true)}});
window.addEventListener('blur',()=>finishRailDrag(true));window.addEventListener('resize',()=>finishRailDrag(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)finishRailDrag(true)});
syncRailOrder();
