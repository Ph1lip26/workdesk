async (page) => {
 const checks=[],errors=[];
 const check=(name,value)=>{if(!value)throw Error(name);checks.push(name)};
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(page.url().split('#')[0]+'#douyin');await page.reload();await page.locator('.card').first().waitFor();
 check('synthetic fixture only',await page.locator('.card').first().getAttribute('data-id')==='1000000000000000001');
 check('single visible rail brand',await page.locator('.module-rail .workspace-name').count()===1&&await page.locator('.workspace-name').textContent()==='Workdesk');
 check('local generic brand fallback loads without an external request',await page.locator('.workspace-mark .workspace-logo').evaluate(e=>e.complete&&e.naturalWidth===512&&e.getAttribute('src')==='/brand'));
 check('redundant subtitle and footer removed',await page.locator('.panel-heading p,.panel-footer').count()===0);
 const brandGeometry=()=>{
  const image=document.querySelector('.workspace-logo'),r=image.getBoundingClientRect(),rail=document.querySelector('.module-rail').getBoundingClientRect();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,128,128);const p=ctx.getImageData(0,0,128,128).data;
  let total=0,moment=0;for(let i=0;i<p.length;i+=4){const weight=p[i+3]*(p[i]*.2126+p[i+1]*.7152+p[i+2]*.0722);total+=weight;moment+=(i/4%128+.5)*weight;}
  const painted=Math.max(r.width/image.naturalWidth,r.height/image.naturalHeight)*image.naturalWidth;
  const ink=r.left+(r.width-painted)/2+moment/total/128*painted;
  const n=document.querySelector('.workspace-name').getBoundingClientRect(),mark=document.querySelector('.workspace-mark').getBoundingClientRect();
  return {inkError:Math.abs(ink-(rail.left+rail.width/2)),nameError:Math.abs(n.left+n.width/2-(rail.left+rail.width/2)),fits:r.top>=mark.top&&r.bottom<=mark.bottom&&n.bottom<=mark.bottom,ready:image.dataset.brandAligned==='true'};
 };
 const measure=()=>{
  const w=document.querySelector('.workspace'),c=document.querySelector('.card').getBoundingClientRect(),s=document.querySelector('.search-box').getBoundingClientRect();
  return {client:w.clientWidth,left:c.left,width:c.width,searchLeft:s.left,searchWidth:s.width,top:w.scrollTop};
 };
 const same=(a,b)=>Object.keys(a).every(k=>Math.abs(a[k]-b[k])<.1);
 for(const width of [1440,960,390]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(450);
  const brand=await page.evaluate(brandGeometry);
  check(width+': visible logo ink is centered, not only its canvas',brand.ready&&brand.inkError<.15);
  check(width+': logo and wordmark share the rail center',brand.nameError<.1);
  check(width+': logo does not shrink or overflow its brand slot',brand.fits);
  check(width+': brand fits first rail',await page.evaluate(()=>{const r=document.querySelector('.module-rail').getBoundingClientRect(),n=document.querySelector('.workspace-name').getBoundingClientRect();return n.left>=r.left&&n.right<=r.right&&n.top<90}));
  await page.evaluate(()=>document.querySelector('.workspace').scrollTop=150);await page.waitForTimeout(100);
  const before=await page.evaluate(measure);
  for(let n=0;n<3;n++){
   await page.locator('#toolsopen').click();await page.waitForTimeout(100);
   check(width+': open settings keeps geometry '+n,same(before,await page.evaluate(measure)));
   check(width+': modal locks background '+n,await page.evaluate(()=>getComputedStyle(document.querySelector('.workspace')).overflowY==='hidden'));
   if(width===960&&n===0)await page.screenshot({path:'output/playwright/settings-open.png'});
   await page.locator('#closetools').click();await page.waitForTimeout(100);
   check(width+': close settings keeps geometry '+n,same(before,await page.evaluate(measure)));
  }
  check(width+': right edge and root overflow unchanged',await page.evaluate(()=>Math.abs(document.querySelector('.workspace').getBoundingClientRect().right-innerWidth)<1&&document.documentElement.scrollWidth===innerWidth));
 }
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(450);await page.evaluate(()=>document.querySelector('.workspace').scrollTop=0);
 await page.screenshot({path:'output/playwright/brand-after.png'});
 check('no page errors',errors.length===0);
 return {ok:true,checks:checks.length,errors};
}
