/* App lifecycle refreshes data, never the document or an unsaved form. */
let openingRefresh=null,openingRefreshTimer=null,lastOpeningRefresh=0,openingRefreshCount=0,lastOpeningReport=null;
let appearanceMode=window.workdeskTheme.mode,appearanceSaving=false;
function paintAppearance(mode){
 window.workdeskTheme.apply(mode);appearanceMode=window.workdeskTheme.mode;
 $('appearance-mode').value=appearanceMode;
}
async function changeAppearance(mode){
 if(appearanceSaving)return;appearanceSaving=true;$('appearance-mode').disabled=true;
 const previous=appearanceMode;let persisted=false;
 try{
  const result=await api('appearance',{mode});persisted=true;paintAppearance(result.mode);
  if(window.workdesk?.applyAppearance)await window.workdesk.applyAppearance(result.mode);
 }catch(e){if(!persisted)paintAppearance(previous);toast((persisted?'页面模式已保存，窗口外观更新失败：':'外观切换未完成：')+e.message)}
 finally{appearanceSaving=false;$('appearance-mode').disabled=false}
}
async function refreshAllModules(){
 if(openingRefresh)return openingRefresh;
 // show, focus and restore may all describe the same opening gesture.
 if(Date.now()-lastOpeningRefresh<1200)return;
 lastOpeningRefresh=Date.now();openingRefreshCount++;
 openingRefresh=(async()=>{
  try{
   lastOpeningReport=await api('open_refresh',{});
   // These refreshers retain search, pagination, selection, drag state and the
   // purchase editor's independent draft/revision. No reload or AI operation.
   await Promise.allSettled([refresh(),refreshHomepage(),refreshPurchases()]);
  }catch(e){lastOpeningReport={ok:false,error:e.message};toast('自动刷新未完成，已有内容保留：'+e.message)}
 })();
 try{await openingRefresh}finally{openingRefresh=null}
}
function scheduleOpeningRefresh(){
 clearTimeout(openingRefreshTimer);openingRefreshTimer=setTimeout(()=>{if(!document.hidden)refreshAllModules()},80);
}
$('appearance-mode').onchange=()=>changeAppearance($('appearance-mode').value);
paintAppearance(appearanceMode);
if(window.workdesk?.onOpened)window.workdesk.onOpened(scheduleOpeningRefresh);
else window.addEventListener('focus',scheduleOpeningRefresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleOpeningRefresh()});
// Direct startup/deep routes are also covered, even if native show fired before
// the renderer was ready. Opening a module itself still uses its own refresher.
scheduleOpeningRefresh();
