const test=require('node:test'),assert=require('node:assert/strict');
const {trusted,safeExternal}=require('../desktop/platform.cjs');
test('only exact local service origin',()=>{
 const origin='http://127.0.0.1:12345';assert.equal(trusted(origin+'/',origin),true);
 for(const u of ['http://localhost:12345','http://127.0.0.1:1','http://127.0.0.1:12345.evil.test','http://127.0.0.1:12345@evil.test','file:///etc/passwd','https://example.com'])assert.equal(trusted(u,origin),false);
});
test('external URLs cannot execute local schemes',()=>{
 assert.equal(safeExternal('https://www.douyin.com/'),true);
 for(const u of ['file:///etc/passwd','javascript:alert(1)','http://localhost','https://user:pass@example.com'])assert.equal(safeExternal(u),false);
});
