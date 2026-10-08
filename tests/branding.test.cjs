const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {brandFile}=require('../desktop/branding.cjs');
test('private window branding accepts only a bounded local PNG',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workdesk-brand-')),file=path.join(root,'brand/icon.png'),fallback=path.resolve(__dirname,'../assets/icon.png');
 fs.mkdirSync(path.dirname(file));t.after(()=>{if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(path.dirname(file));fs.rmdirSync(root)});
 assert.equal(brandFile(root,fallback),fallback);
 fs.copyFileSync(fallback,file);assert.equal(brandFile(root,fallback),file);
 fs.writeFileSync(file,'<svg>not a raster</svg>');assert.equal(brandFile(root,fallback),fallback);
 const data=fs.readFileSync(fallback);data.writeUInt32BE(4096,16);fs.writeFileSync(file,data);assert.equal(brandFile(root,fallback),fallback);
});
