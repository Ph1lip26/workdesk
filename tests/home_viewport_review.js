async (page,output='build')=>{
 const checks=[],errors=[];const check=(name,value)=>{if(!value)throw Error(name);checks.push(name)};
 page.on('pageerror',e=>errors.push(e.message));await page.goto(page.url().split('#')[0]+'#home');await page.reload();
 await page.waitForFunction(()=>homeState?.configured&&state);
 const layouts=[['status','next','focus','douyin','later'],['next','status','focus','douyin','later'],['next','focus','status','douyin','later'],['next','focus','douyin','later','status']];
 for(const desktop of [false,true]){
  await page.evaluate(value=>document.body.classList.toggle('desktop-shell',value),desktop);
  for(const [width,height] of [[1440,920],[1280,720],[1080,620],[960,600],[800,560],[1024,576]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(100);
   for(const layout of layouts){
    await page.evaluate(layout=>applyHomeOrder(layout),layout);await page.waitForTimeout(40);
    const result=await page.evaluate(()=>{
     const ws=document.querySelector('.workspace'),w=ws.getBoundingClientRect();
     const cards=[...document.querySelectorAll('#home-cards>[data-home-card]')];
     return {scroll:[ws.scrollHeight,ws.clientHeight,ws.scrollTop],cards:cards.map(c=>{
      const r=c.getBoundingClientRect(),body=c.querySelector('.tile-body').getBoundingClientRect(),foot=c.querySelector('.tile-foot').getBoundingClientRect();
      const hit=[...c.querySelectorAll('button')].every(b=>{const t=b.getBoundingClientRect();return t.top>=r.top&&t.bottom<=r.bottom&&t.left>=r.left&&t.right<=r.right});
      return {id:c.dataset.homeCard,within:r.top>=w.top&&r.bottom<=w.bottom&&r.left>=w.left&&r.right<=w.right,clip:c.scrollHeight>c.clientHeight+1,bodyOver:body.bottom>foot.top+1,hit,height:r.height};
     }),font:parseFloat(getComputedStyle(document.querySelector('.tile-record-summary')).fontSize)};
    });
    const tag=(desktop?'native':'browser')+' '+width+'x'+height+' status@'+layout.indexOf('status');
    check(tag+': one viewport',result.scroll[0]<=result.scroll[1]+1&&result.cards.every(c=>c.within));
    check(tag+': no card clipping or overlapping controls '+JSON.stringify(result.cards),result.cards.every(c=>!c.clip&&!c.bodyOver&&c.hit));
    check(tag+': readable summary type',result.font>=13);
   }
   await page.mouse.move(width-100,height/2);await page.mouse.wheel(0,900);await page.waitForTimeout(60);
   check((desktop?'native':'browser')+' '+width+'x'+height+': wheel cannot scroll home',await page.evaluate(()=>document.querySelector('.workspace').scrollTop===0));
   check((desktop?'native':'browser')+' '+width+'x'+height+': four subject summaries stay visible',await page.evaluate(()=>[...document.querySelectorAll('.status-record>span')].every(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0)));
  }
 }
 await page.evaluate(()=>{applyHomeOrder(HOME_CARD_IDS);document.body.classList.remove('desktop-shell')});
 await page.setViewportSize({width:1440,height:920});await page.waitForTimeout(100);
 check('cards are distinct low-saturation graphite surfaces',await page.evaluate(()=>{const channel=e=>getComputedStyle(e).backgroundColor.match(/\d+/g).slice(0,3).map(Number),bg=channel(document.body);return [...document.querySelectorAll('#home-cards article')].every(c=>{const v=channel(c);return v.every((n,i)=>n-bg[i]>=20)&&Math.max(...v)-Math.min(...v)<=8})}));
 await page.locator('[data-home-list=next]').click();
 check('all schedule records remain reachable',await page.locator('#homedetail .tile-record').count()===7);
 check('uncertain date remains explicit in full list',await page.locator('#home-detail-content').textContent().then(t=>t.includes('原日期')&&!t.includes('undefined')));
 await page.locator('#homedetail .tile-record').nth(2).click();
 check('list entry opens its full source detail',await page.locator('#home-detail-content [data-home-source]').count()===1);await page.locator('#closehomedetail').click();
 await page.locator('[data-home-list=later]').click();
 check('all deferred projects remain reachable',await page.locator('#homedetail .tile-record').count()===3);await page.locator('#closehomedetail').click();
 await page.evaluate(()=>{window.homeReviewOriginal=structuredClone(homeState);const long='合成的很长记录，不应挤掉入口。'.repeat(8);homeState.stage.title=long;homeState.stage.subtitle=long;homeState.overview.forEach(x=>x.summary=long);homeState.schedule.forEach(x=>{x.title=long;x.category=long});homeState.projects.forEach(x=>{x.title=long;x.summary=long});homeState.waiting.forEach(x=>x.title=long);renderHomepage()});
 await page.setViewportSize({width:800,height:560});await page.evaluate(()=>document.body.classList.add('desktop-shell'));
 for(const layout of layouts){
  await page.evaluate(layout=>applyHomeOrder(layout),layout);
  check('long content keeps buttons inside viewport '+layout.indexOf('status'),await page.evaluate(()=>{const ws=document.querySelector('.workspace');return ws.scrollHeight<=ws.clientHeight+1&&[...document.querySelectorAll('#home-cards article')].every(c=>{const r=c.getBoundingClientRect();return c.scrollHeight<=c.clientHeight+1&&[...c.querySelectorAll('button')].every(b=>{const t=b.getBoundingClientRect();return t.left>=r.left&&t.right<=r.right&&t.top>=r.top&&t.bottom<=r.bottom})})}));
 }
 check('uncertain status leads truncated category',await page.locator('.schedule-copy small').first().textContent().then(t=>t.startsWith('日期待确认')));
 await page.evaluate(()=>{homeState=window.homeReviewOriginal;delete window.homeReviewOriginal;document.body.classList.remove('desktop-shell');renderHomepage();applyHomeOrder(HOME_CARD_IDS)});await page.setViewportSize({width:1440,height:920});await page.waitForTimeout(100);
 await page.screenshot({path:output+'/home-one-screen-desktop.png'});
 await page.setViewportSize({width:800,height:560});await page.evaluate(()=>document.body.classList.add('desktop-shell'));await page.waitForTimeout(150);
 await page.screenshot({path:output+'/home-one-screen-minimum.png'});
 await page.evaluate(()=>applyHomeOrder(['next','focus','status','douyin','later']));await page.waitForTimeout(100);
 await page.screenshot({path:output+'/home-one-screen-reordered.png'});
 await page.evaluate(()=>{applyHomeOrder(HOME_CARD_IDS);document.body.classList.remove('desktop-shell')});await page.setViewportSize({width:1440,height:920});
 await page.locator('[data-go-module=douyin]').click();await page.waitForTimeout(300);
 await page.mouse.move(1100,700);await page.mouse.wheel(0,800);await page.waitForTimeout(100);
 check('library remains independently scrollable',await page.evaluate(()=>document.querySelector('.workspace').scrollTop>0));
 await page.locator('#homemodule').click();await page.waitForTimeout(300);
 check('return to home is at top',await page.evaluate(()=>document.querySelector('.workspace').scrollTop===0));
 check('no page errors',errors.length===0);return {ok:true,checks:checks.length,errors};
}
