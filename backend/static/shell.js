/* Opening loads cached module data; remote collection refresh is manual only. */
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
$('appearance-mode').onchange=()=>changeAppearance($('appearance-mode').value);
paintAppearance(appearanceMode);
