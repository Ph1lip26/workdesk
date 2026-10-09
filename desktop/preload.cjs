const {contextBridge, ipcRenderer} = require('electron');
// Native window controls stay native; only a CSS drag surface is added to our pages.
window.addEventListener('DOMContentLoaded',()=>{
  document.documentElement.classList.add('desktop-shell');
  const chrome=document.createElement('header');chrome.className='window-chrome';chrome.setAttribute('aria-label','窗口拖动区域');
  const title=document.createElement('span');title.className='window-title';title.textContent='Workdesk';chrome.append(title);
  document.body.prepend(chrome);
});
// Only fixed setup/settings operations; no generic command or filesystem bridge.
contextBridge.exposeInMainWorld('workdesk', {
  getSettings:()=>ipcRenderer.invoke('settings:get'),
  choosePath:kind=>ipcRenderer.invoke('settings:choose',kind),
  saveSettings:value=>ipcRenderer.invoke('settings:save',value),
  getAppearance:()=>ipcRenderer.invoke('appearance:get'),
  applyAppearance:mode=>ipcRenderer.invoke('appearance:apply',mode),
  onOpened:callback=>{if(typeof callback!=='function')return;const listener=()=>callback();ipcRenderer.on('workdesk:opened',listener);return ()=>ipcRenderer.removeListener('workdesk:opened',listener)}
});
