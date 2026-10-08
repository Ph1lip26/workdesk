async (page,output='build')=>{
 const checks=[],errors=[];const check=(name,value)=>{if(!value)throw Error(name);checks.push(name)};
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(page.url().split('#')[0]+'#home');await page.reload();await page.waitForFunction(()=>homeState?.configured&&state);
 await page.setViewportSize({width:1440,height:920});
 check('home header no longer displays a date or clock',await page.locator('.home-top p,.home-top time').count()===0);
 check('evidence dates are still present',await page.locator('.tile-evidence').textContent().then(s=>s.includes('最新实报')));
 check('home retains five cards and no secondary menu',await page.locator('[data-home-card]').count()===5&&await page.locator('#panelhost').isHidden());
 check('desktop header, summaries, and counts have ordered type sizes',await page.evaluate(()=>{
  const size=s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
  return size('.collection-total strong')>size('.tile-phase h3')&&size('.tile-phase h3')>size('.home-top h1')&&size('.home-top h1')>size('.tile-record-summary')&&size('.tile-record-summary')>=14;
 }));
 check('all text uses one system font stack',await page.evaluate(()=>{
  const family=getComputedStyle(document.body).fontFamily;
  return [...document.querySelectorAll('.home-top h1,.home-tile h2,.home-tile h3,.home-tile button,.home-tile p')].every(e=>getComputedStyle(e).fontFamily===family);
 }));
 check('matte cards use surface, directional highlight, and restrained elevation',await page.evaluate(()=>{
  const c=getComputedStyle(document.querySelector('.home-tile'));
  return c.backgroundImage.includes('linear-gradient')&&c.backgroundColor==='rgb(45, 48, 51)'&&c.boxShadow!=='none'&&c.backdropFilter==='none';
 }));
 check('fixed finish cannot intercept input or scroll',await page.evaluate(()=>{const s=getComputedStyle(document.body,'::before');return s.position==='fixed'&&s.pointerEvents==='none'}));
 // Worst-case card highlight is brighter than its base; selected body/CTA
 // pairs are checked against it. This does not claim cover text accessibility.
 const ratios=await page.evaluate(()=>{
  const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
  return ['.tile-heading h2','.status-record>span','.tile-record-summary','.tile-record-top small','.tile-evidence','.home-source'].map(s=>{
   const color=getComputedStyle(document.querySelector(s)).color.match(/\d+/g).slice(0,3).map(Number);
   return (lum(color)+.05)/(lum([60,63,66])+.05);
  });
 });check('selected home text and actions pass AA against surface highlight',ratios.every(r=>r>=4.5));
 await page.screenshot({path:output+'/material-home.png'});
 await page.locator('[data-go-module=douyin]').click();await page.waitForTimeout(900);
 await page.evaluate(async()=>{await api('navigation_motion',{mode:'on'});await refresh()});
 await page.setViewportSize({width:960,height:740});await page.waitForTimeout(700);
 await page.locator('#navtoggle').click();await page.waitForTimeout(90);
 check('five glyph pieces participate in the state transition',await page.evaluate(()=>railGlyphAnimations.size===5));
 check('motion changes only transform and opacity',await page.evaluate(()=>[...railGlyphAnimations.values()].every(a=>a.effect.getKeyframes().every(k=>Object.keys(k).every(p=>['transform','opacity','offset','computedOffset','easing','composite'].includes(p))))));
 await page.screenshot({path:output+'/material-glyph-mid.png'});
 await page.waitForTimeout(800);
 check('expanded icon shows the library plane, not two overlapping glyphs',await page.evaluate(()=>getComputedStyle(document.querySelector('.rail-panel-glyph')).opacity==='1'&&getComputedStyle(document.querySelector('.rail-video-glyph')).opacity==='0'));
 await page.locator('#navtoggle').click();await page.waitForTimeout(55);await page.locator('#navtoggle').click();await page.waitForTimeout(55);await page.locator('#navtoggle').click();await page.waitForTimeout(900);
 check('rapid reversal settles with no animated glyphs or grid ghosts',await page.evaluate(()=>railGlyphAnimations.size===0&&!document.querySelector('.grid-reflow-overlay')&&!document.body.classList.contains('nav-moving')));
 check('collapsed icon returns to the video symbol',await page.evaluate(()=>getComputedStyle(document.querySelector('.rail-panel-glyph')).opacity==='0'&&getComputedStyle(document.querySelector('.rail-video-glyph')).opacity==='1'));
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const mode of ['system','off']){
  await page.evaluate(async mode=>{await api('navigation_motion',{mode});await refresh()},mode);
  await page.locator('#navtoggle').click();await page.waitForTimeout(50);
  check(mode+': no glyph animation under reduced motion',await page.evaluate(()=>railGlyphAnimations.size===0));
 }
 await page.evaluate(async()=>{await api('navigation_motion',{mode:'on'});await refresh()});await page.locator('#navtoggle').click();await page.waitForTimeout(90);
 check('explicit local opt-in still permits navigation only',await page.evaluate(()=>railGlyphAnimations.size===5));await page.waitForTimeout(900);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(async()=>{await api('navigation_motion',{mode:'system'});await refresh()});
 await page.locator('#homemodule').click();await page.waitForTimeout(400);
 await page.setViewportSize({width:800,height:560});await page.screenshot({path:output+'/material-minimum.png'});
 check('minimum Windows viewport still fits all cards',await page.evaluate(()=>{const w=document.querySelector('.workspace');return w.scrollHeight<=w.clientHeight+1&&[...document.querySelectorAll('[data-home-card]')].every(e=>e.scrollHeight<=e.clientHeight+1)}));
 check('no page errors',errors.length===0);return {ok:true,checks:checks.length,minimumContrast:Math.min(...ratios),errors};
}
