async (page) => {
 const checks=[],errors=[];
 const check=(name,value)=>{if(!value)throw Error(name);checks.push(name)};
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(page.url().split('#')[0]+'#home');await page.reload();
 await page.waitForFunction(()=>typeof selectModule==='function'&&state?.videos?.length);
 check('synthetic fixture only',await page.evaluate(()=>state.videos[0].id==='1000000000000000001'));
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(async()=>{await api('navigation_motion',{mode:'on'});await refresh()});
 for(const width of [1440,960]){
  await page.setViewportSize({width,height:920});await page.waitForTimeout(450);
  const frames=await page.evaluate(async()=>{
   selectModule('home',{animate:false});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   selectModule('douyin',{animate:false});if($('navtoggle').getAttribute('aria-expanded')!=='true')toggleNavigation();
   const start=performance.now(),samples=[];
   do{await new Promise(requestAnimationFrame);samples.push({t:performance.now()-start,title:+getComputedStyle(document.querySelector('.panel-heading')).opacity,menu:+getComputedStyle(document.querySelector('.panel-nav')).opacity,visibility:getComputedStyle(document.querySelector('.panel-link>span')).visibility})}while(performance.now()-start<480);
   return samples;
  });
  const early=frames.find(x=>x.t>=80),mid=frames.find(x=>x.t>=170);
  check(width+': title does not flash on initial reveal',early&&early.title<.65&&early.menu<.65);
  check(width+': text is actually visible throughout fade, not delayed until its end',frames.filter(x=>x.menu>.01).every(x=>x.visibility==='visible'));
  check(width+': text has a sustained intermediate phase',mid&&mid.menu>.05&&mid.menu<.9&&frames.filter(x=>x.menu>.1&&x.menu<.9).length>=4);
  check(width+': heading leads menu gently',frames.every(x=>x.title+.015>=x.menu));
  check(width+': text settles fully readable',frames.at(-1).title===1&&frames.at(-1).menu===1);
  const reverse=await page.evaluate(async()=>{
   toggleNavigation();await new Promise(r=>setTimeout(r,65));
   const node=document.querySelector('.panel-nav'),before=+getComputedStyle(node).opacity;
   toggleNavigation();const immediate=+getComputedStyle(node).opacity;
   await new Promise(r=>setTimeout(r,100));const after=+getComputedStyle(node).opacity;
   await new Promise(r=>setTimeout(r,500));
   return {before,immediate,after,end:+getComputedStyle(node).opacity,inert:$('modulepanel').inert};
  });
  check(width+': fast reversal continues from visible text',Math.abs(reverse.before-reverse.immediate)<.05&&reverse.after>=reverse.immediate);
  check(width+': reversed panel finishes interactive and legible',reverse.end===1&&!reverse.inert);
  const stable=await page.evaluate(async()=>{await refresh();return +getComputedStyle(document.querySelector('.panel-nav')).opacity});
  check(width+': polling does not restart text reveal',stable===1);
 }
 await page.evaluate(async()=>{await api('navigation_motion',{mode:'off'});await refresh();toggleNavigation()});
 check('disabled text motion settles immediately',await page.evaluate(()=>getComputedStyle(document.querySelector('.panel-nav')).opacity==='0'&&getComputedStyle(document.querySelector('.panel-nav')).transitionDuration==='0s'));
 await page.evaluate(async()=>{await api('navigation_motion',{mode:'system'});await refresh();toggleNavigation()});
 check('system reduced motion is still respected',await page.evaluate(()=>getComputedStyle(document.querySelector('.panel-nav')).opacity==='1'&&!navigationMotionEnabled()));
 check('no page errors',errors.length===0);
 return {ok:true,checks:checks.length,errors};
}
