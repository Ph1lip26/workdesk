/* Render-blocking local bootstrap: resolve the saved preference before CSS/paint.
   System changes affect presentation only, never forms, data or OS settings. */
(()=>{
 const root=document.documentElement,media=matchMedia('(prefers-color-scheme:dark)');
 let preference='night';
 const valid=mode=>['day','night','system'].includes(mode);
 function apply(mode){
  preference=valid(mode)?mode:'night';
  root.dataset.appearanceMode=preference;
  root.dataset.appearance=preference==='system'?(media.matches?'night':'day'):preference;
  return root.dataset.appearance;
 }
 apply(root.dataset.appearanceMode||root.dataset.appearance);
 media.addEventListener('change',()=>{if(preference==='system')apply(preference)});
 window.workdeskTheme=Object.freeze({apply,get mode(){return preference},get current(){return root.dataset.appearance}});
})();
