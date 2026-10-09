const test=require('node:test'),assert=require('node:assert/strict');
const {trusted,safeExternal}=require('../desktop/platform.cjs');
const fs=require('node:fs'),path=require('node:path');
test('appearance is local, validated and has matching native palettes',()=>{
 const appearance=require('../desktop/appearance.cjs'),os=require('node:os');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workdesk-appearance-'));
 try{
  assert.equal(appearance.read(root),'night');
  for(const value of ['[]','bad','{"mode":[]}','{"mode":"unknown"}']){
   fs.writeFileSync(path.join(root,'appearance.json'),value);assert.equal(appearance.read(root),'night');
  }
  fs.writeFileSync(path.join(root,'appearance.json'),'{"mode":"day"}');assert.equal(appearance.read(root),'day');
  assert.equal(appearance.valid('system'),true);assert.equal(appearance.resolve('system',true),'night');assert.equal(appearance.resolve('system',false),'day');assert.equal(appearance.resolve('day',true),'day');assert.equal(appearance.valid('day'),true);assert.equal(appearance.valid('../night'),false);
 }finally{fs.rmSync(root,{recursive:true})}
 const main=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8');
 assert.match(main,/width:1180,height:760,minWidth:800,minHeight:560/);
 assert.match(main,/sender!==window\.webContents/);assert.match(main,/authorizeAppearance\(e\)/);
 assert.match(main,/window\.on\('show',announceOpen\)/);assert.match(main,/window\.on\('restore',announceOpen\)/);
 assert.doesNotMatch(main,/nativeTheme\.themeSource\s*=/);assert.doesNotMatch(main,/window\.on\('focus',announceOpen\)/);
});
test('integrated chrome retains native controls and isolated renderer',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8');
  assert.match(main,/titleBarStyle:'hidden'/);assert.match(main,/titleBarOverlay:colors/);
  const appearance=require('../desktop/appearance.cjs');assert.equal(appearance.palette('night').color,'#131415');assert.equal(appearance.palette('day').color,'#d2d2d2');
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
