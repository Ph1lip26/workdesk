async(page)=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const check=(name,c)=>{if(!c)throw Error(name);checks.push(name)};
 await page.goto(page.url().split('#')[0]+'#douyin');await page.reload();await page.locator('.card').first().waitFor();
 await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(async()=>{await api('navigation_motion',{mode:'on'});await refresh()});await page.waitForTimeout(800);
 if(await page.locator('#navtoggle').getAttribute('aria-expanded')==='false'){await page.locator('#navtoggle').click();await page.waitForTimeout(800)}
 const probe=await page.evaluate(async()=>{
  const nodes=[...document.querySelectorAll('.card')],before=gridColumnCount(),frames=[],start=performance.now();
  document.getElementById('navtoggle').click();
  while(performance.now()-start<740){await new Promise(requestAnimationFrame);
   frames.push({t:performance.now()-start,moving:!!navigationReflow,right:document.querySelector('.workspace').getBoundingClientRect().right,
    rects:nodes.map(c=>{const r=c.getBoundingClientRect();return [r.left,r.top,r.width,r.height]}),
    opaque:nodes.every(c=>+getComputedStyle(c).opacity===1),glyph:[...document.querySelectorAll('.rail-symbol svg')].reduce((a,c)=>a+(+getComputedStyle(c).opacity),0),
    snapshots:document.getAnimations().some(a=>a.effect?.pseudoElement?.includes('library-grid'))});
  }
  const cleanup=frames.findIndex((f,i)=>i>0&&!f.moving&&frames[i-1].moving);
  const endJump=cleanup<0?999:Math.max(...frames[cleanup].rects.flatMap((r,i)=>r.map((n,j)=>Math.abs(n-frames[cleanup-1].rects[i][j]))));
  return {before,after:gridColumnCount(),frames:frames.length,movingFrames:frames.filter(f=>f.moving).length,opaque:frames.every(f=>f.opaque),glyphMin:Math.min(...frames.map(f=>f.glyph)),snapshots:frames.some(f=>f.snapshots),edgeError:Math.max(...frames.map(f=>Math.abs(f.right-innerWidth))),endJump,
   identity:nodes.every((c,i)=>c===document.querySelectorAll('.card')[i]),clean:!navigationReflow&&!document.body.classList.contains('nav-moving')&&nodes.every(c=>getComputedStyle(c).position==='static'),
   widthOvershoot:nodes.some((c,i)=>Math.max(...frames.map(f=>f.rects[i][2]))>Math.max(frames[0].rects[i][2],c.getBoundingClientRect().width)+1)};
 });
 check('actual column count changes',probe.before!==probe.after);
 check('many intermediate frames, not one refresh',probe.frames>20&&probe.movingFrames>15);
 check('real cards stay opaque and mounted throughout',probe.opaque&&probe.identity);
 check('no old/new grid snapshots',!probe.snapshots);
 check('no initial card enlargement overshoot',!probe.widthOvershoot);
 check('glyph has no delayed-phase blank frame',probe.glyphMin>.98);
 check('scroll frame remains at right edge throughout',probe.edgeError<1);
 check('flow restoration adds no final layout jump',probe.endJump<2&&probe.clean);
 const reverse=await page.evaluate(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),b=document.getElementById('navtoggle');b.click();await wait(170);const mid=!!navigationReflow,card=document.querySelector('.card'),before=card.getBoundingClientRect();b.click();await new Promise(requestAnimationFrame);const after=card.getBoundingClientRect();await wait(800);return {mid,jump:Math.abs(before.left-after.left)+Math.abs(before.width-after.width),clean:!navigationReflow&&!document.body.classList.contains('nav-moving'),closed:b.getAttribute('aria-expanded')==='false'}});
 check('mid-flight reverse resumes current geometry',reverse.mid&&reverse.jump<15&&reverse.clean&&reverse.closed);
 await page.evaluate(async()=>{await api('navigation_motion',{mode:'off'});await refresh()});await page.locator('#navtoggle').click();
 check('off is immediate and restores real flow',await page.evaluate(()=>!navigationReflow&&[...document.querySelectorAll('.card')].every(c=>getComputedStyle(c).position==='static')));
 await page.evaluate(async()=>{await api('navigation_motion',{mode:'on'});await refresh()});await page.locator('#navtoggle').click();await page.waitForTimeout(80);
 await page.locator('#nextpage').click();await page.waitForTimeout(800);
 check('changing page during motion never leaves detached ghosts',await page.evaluate(()=>!navigationReflow&&document.querySelectorAll('.card').length===30&&document.querySelector('.card').dataset.id==='1000000000000000031'&&[...document.querySelectorAll('.card')].every(c=>getComputedStyle(c).position==='static')));
 await page.locator('#prevpage').click();await page.locator('#navtoggle').click();await page.waitForTimeout(80);await page.setViewportSize({width:960,height:720});await page.waitForTimeout(800);
 check('resize during motion restores responsive flow',await page.evaluate(()=>!navigationReflow&&[...document.querySelectorAll('.card')].every(c=>getComputedStyle(c).position==='static')));
 check('resting cards do not overlap',await page.evaluate(()=>{const r=[...document.querySelectorAll('.card')].map(c=>c.getBoundingClientRect());return r.every((a,i)=>r.every((b,j)=>i===j||a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top))}));
 await page.evaluate(async()=>{await api('navigation_motion',{mode:'system'});await refresh()});await page.emulateMedia({reducedMotion:'no-preference'});
 check('no browser/CSP errors',errors.length===0);return {ok:true,checks:checks.length,probe,reverse,errors};
}
