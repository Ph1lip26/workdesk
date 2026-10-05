const {contextBridge, ipcRenderer} = require('electron');
// Only fixed setup/settings operations; no generic command or filesystem bridge.
contextBridge.exposeInMainWorld('workdesk', {
  getSettings:()=>ipcRenderer.invoke('settings:get'),
  choosePath:kind=>ipcRenderer.invoke('settings:choose',kind),
  saveSettings:value=>ipcRenderer.invoke('settings:save',value)
});
