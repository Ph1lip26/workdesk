async (page) => {
const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const check=(name,value)=>{if(!value)throw Error(name);checks.push(name)};
await page.goto(page.url().split('#')[0]+'#douyin');await page.reload();await page.locator('.card').first().waitFor();
await page.evaluate(async()=>{await api('navigation_motion',{mode:'system'});await refresh()});
const evaluate=code=>page.evaluate(code);
check('thirty cards',await page.locator('.card').count()===30);
check('synthetic fixture only',await page.locator('.card').first().getAttribute('data-id')==='1000000000000000001');
check('one visible h1',await page.locator('h1:visible').count()===1);
check('redundant context hidden',await page.locator('#viewcontext').isVisible()===false);
for(const width of [1920,1440,1100,960,800,600,390,320]){
 await page.setViewportSize({width,height:720});await page.waitForTimeout(450);
 if(width<=1100&&await page.locator('#navtoggle').getAttribute('aria-expanded')==='true'){await page.locator('#navtoggle').click();await page.waitForTimeout(300)}
 const dims=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,edge:document.querySelector('.workspace').getBoundingClientRect().right,rail:document.querySelector('.module-rail').getBoundingClientRect().width}));
 check(width+': no horizontal overflow',!dims.overflow);check(width+': scrollbar frame reaches right edge',Math.abs(dims.edge-width)<1);
 check(width+': rail width',dims.rail===(width<=600?56:72));
 if(width<=1100){
  check(width+': collapsed panel inert',await evaluate(()=>document.getElementById('modulepanel').inert));
  await page.locator('#navtoggle').click();await page.waitForTimeout(450);
  const rects=await evaluate(()=>({rail:document.querySelector('.module-rail').getBoundingClientRect().right,panel:document.getElementById('modulepanel').getBoundingClientRect().toJSON(),content:document.querySelector('.workspace').getBoundingClientRect().left}));
  check(width+': panel attached',Math.abs(rects.panel.left-rects.rail)<1);
  check(width+': readable panel',rects.panel.width===240);
  check(width+': content push or phone overlay',Math.abs(rects.content-(width>600?rects.panel.right:rects.rail))<1);
  check(width+': no nav modal',await evaluate(()=>!document.getElementById('navdrawer')&&!document.getElementById('modulepanel').closest('dialog')));
  await page.locator('#closenav').click();await page.waitForTimeout(300);
 }
}
await page.setViewportSize({width:1440,height:920});await page.waitForTimeout(350);
const motion=await evaluate(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),button=document.getElementById('navtoggle'),ws=document.querySelector('.workspace');
 const initial=ws.offsetWidth;button.click();await wait(90);
 const sample={animated:ws.getAnimations().length>0,transform:getComputedStyle(ws).transform,width:ws.offsetWidth,right:ws.getBoundingClientRect().right};
 await wait(60);sample.widthLater=ws.offsetWidth;sample.rightLater=ws.getBoundingClientRect().right;await wait(160);sample.finished=ws.getAnimations().length===0;sample.closed=document.getElementById('modulepanel').inert;
 button.click();await wait(380);sample.reopened=!document.getElementById('modulepanel').inert;return sample;
});
check('scroll frame is never translated',motion.animated&&motion.transform==='none');
check('content space interpolates smoothly',motion.widthLater>motion.width);
check('right edge remains anchored mid transition',Math.abs(motion.right-1440)<1&&Math.abs(motion.rightLater-1440)<1);
check('closing completes and hides focus targets',motion.finished&&motion.closed);
check('can reopen smoothly',motion.reopened);
const rapid=await evaluate(async()=>{
 const b=document.getElementById('navtoggle'),wait=ms=>new Promise(r=>setTimeout(r,ms));
 b.click();await wait(45);b.click();await wait(45);b.click();await wait(800);
 return b.getAttribute('aria-expanded')==='false'&&document.getElementById('modulepanel').inert&&!document.body.classList.contains('nav-moving');
});check('rapid reversal settles without stuck animation',rapid);
await page.locator('#navtoggle').click();await page.waitForTimeout(450);
await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);
await page.locator('#navtoggle').click();
check('reduced motion has no workspace animation',await evaluate(()=>document.querySelector('.workspace').getAnimations().length===0));
check('reduced motion has no panel transition',await evaluate(()=>getComputedStyle(document.getElementById('modulepanel')).transitionDuration==='0s'));
await page.locator('#navtoggle').click();await page.emulateMedia({reducedMotion:'no-preference'});
await page.setViewportSize({width:960,height:720});await page.waitForTimeout(450);await page.locator('#navtoggle').click();await page.waitForTimeout(450);
await page.locator('.panel-link[data-source="favorites"]').focus();await page.keyboard.press('Escape');await page.waitForTimeout(300);
check('escape restores focus',await evaluate(()=>document.activeElement.id==='navtoggle'&&document.getElementById('modulepanel').inert));
await page.setViewportSize({width:1440,height:920});await page.waitForTimeout(350);
await page.locator('[data-video="1000000000000000002"]').check();
check('selection bar shown',await page.locator('#selectionbar').isVisible());
const contrast=await evaluate(()=>{
 function lum(c){return c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)}
 const parse=s=>s.match(/[\d.]+/g).map(Number);
 function bg(el){const c=parse(getComputedStyle(el).backgroundColor);if(c.length<4||c[3]===1)return c.slice(0,3);const under=el.parentElement?bg(el.parentElement):[20,20,20];return c.slice(0,3).map((v,i)=>v*c[3]+under[i]*(1-c[3]))}
 return ['#enqueue','#sync','#search','.author','.panel-link[aria-current=page]','.cover-status.done','.cover-status.new'].map(selector=>{const el=document.querySelector(selector),a=lum(parse(getComputedStyle(el).color).slice(0,3)),b=lum(bg(el));return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});
});
contrast.forEach(item=>check('contrast '+item.selector,item.ratio>=4.5));
await page.locator('#clear').click();
await page.locator('#nextpage').click();check('pagination preserved',await page.locator('.card').first().getAttribute('data-id')==='1000000000000000031');
await page.locator('#prevpage').click();check('return page preserved',await page.locator('.card').count()===30);
await page.locator('#search').fill('不存在的合成词');check('empty state preserved',await page.locator('.empty').isVisible());await page.locator('#search').fill('');
await page.evaluate(()=>document.querySelector('.workspace').scrollTop=400);
await page.locator('#toolsopen').click();
const y=await evaluate(()=>document.querySelector('.workspace').scrollTop);
await page.mouse.move(10,450);await page.mouse.wheel(0,700);await page.waitForTimeout(150);
check('modal wheel cannot scroll background',await evaluate(()=>document.querySelector('.workspace').scrollTop)===y);
await page.mouse.click(10,450);check('outside click dismisses more',await page.locator('#tools').isVisible()===false);
await page.evaluate(()=>document.querySelector('.workspace').scrollTop=0);
await page.screenshot({path:'build/taste-after.png'});
await page.setViewportSize({width:960,height:720});await page.waitForTimeout(350);await page.locator('#navtoggle').click();await page.waitForTimeout(450);
await page.screenshot({path:'build/taste-compact-after.png'});
await page.locator('#closenav').click();await page.waitForTimeout(300);
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await page.screenshot({path:'build/taste-phone-after.png'});
check('no application page or console errors',errors.length===0);
return {ok:true,checks:checks.length,minimumContrast:Math.min(...contrast.map(c=>c.ratio)),motion,errors};
}
