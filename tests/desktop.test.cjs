const test=require('node:test'),assert=require('node:assert/strict');
const {trusted,safeExternal}=require('../desktop/platform.cjs');
const fs=require('node:fs'),path=require('node:path');
test('integrated chrome retains native controls and isolated renderer',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8');
 assert.match(main,/titleBarStyle:'hidden'/);assert.match(main,/titleBarOverlay:\{color:'#141414'/);
 const preload=fs.readFileSync(path.join(__dirname,'../desktop/preload.cjs'),'utf8');
 assert.match(preload,/desktop-shell/);assert.doesNotMatch(preload,/executeJavaScript|insertCSS|sendSync|exposeInMainWorld\(['"](?:require|process|ipcRenderer)/);
});
test('only exact local service origin',()=>{
 const origin='http://127.0.0.1:12345';assert.equal(trusted(origin+'/',origin),true);
 for(const u of ['http://localhost:12345','http://127.0.0.1:1','http://127.0.0.1:12345.evil.test','http://127.0.0.1:12345@evil.test','file:///etc/passwd','https://example.com'])assert.equal(trusted(u,origin),false);
});
test('external URLs cannot execute local schemes',()=>{
 assert.equal(safeExternal('https://www.douyin.com/'),true);
 for(const u of ['file:///etc/passwd','javascript:alert(1)','http://localhost','https://user:pass@example.com'])assert.equal(safeExternal(u),false);
});
