const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events'),{spawn}=require('node:child_process');
const {fixtureHome,createSmokeLogger}=require('../scripts/smoke_io.cjs');
const root=path.resolve(__dirname,'..'),build=path.join(root,'build');
class Sink extends EventEmitter{constructor(){super();this.lines=[]}write(line){this.lines.push(line)}}
function journal(t){
 fs.mkdirSync(build,{recursive:true});const dir=fs.mkdtempSync(path.join(build,'smoke-io-')),file=path.join(dir,'journal.log');
 t.after(()=>{assert.ok(dir.startsWith(build+path.sep));if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir)});return file;
}
test('native test accepts only its isolated fixture',()=>{
 assert.equal(fixtureHome(path.join(build,'native-test'),root),path.join(build,'native-test'));
 assert.throws(()=>fixtureHome(undefined,root),/isolated/);assert.throws(()=>fixtureHome(path.join(build,'different-home'),root),/isolated/);
});
test('test logs persist locally before writing healthy pipes',t=>{
 const file=journal(t),stdout=new Sink(),stderr=new Sink(),log=createSmokeLogger(file,{stdout,stderr});
 log.info('PASS 合成检查');log.error('synthetic error');assert.match(fs.readFileSync(file,'utf8'),/PASS 合成检查\nsynthetic error/);assert.equal(stdout.lines.length,1);assert.equal(stderr.lines.length,1);
});
test('synchronous EPIPE does not lose logs or touch the other pipe',t=>{
 const file=journal(t),stdout=new Sink(),stderr=new Sink();let calls=0;stdout.write=()=>{calls++;throw Object.assign(Error('closed'),{code:'EPIPE'})};
 const log=createSmokeLogger(file,{stdout,stderr});log.info('one');log.info('two');log.error('still visible');assert.equal(calls,1);assert.equal(stderr.lines.length,1);assert.match(fs.readFileSync(file,'utf8'),/EPIPE/);assert.match(fs.readFileSync(file,'utf8'),/two/);
});
test('asynchronous EPIPE on either pipe is safely contained',t=>{
 const file=journal(t),stdout=new Sink(),stderr=new Sink(),log=createSmokeLogger(file,{stdout,stderr});
 stdout.emit('error',Object.assign(Error('closed'),{code:'EPIPE'}));log.info('kept');log.error('healthy stderr');assert.equal(stdout.lines.length,0);assert.equal(stderr.lines.length,1);
 stderr.emit('error',Object.assign(Error('closed'),{code:'EPIPE'}));log.error('also kept');assert.equal(stderr.lines.length,1);assert.match(fs.readFileSync(file,'utf8'),/also kept/);
});
test('non-EPIPE errors are not hidden',t=>{
 const stdout=new Sink(),stderr=new Sink(),log=createSmokeLogger(journal(t),{stdout,stderr});
 assert.throws(()=>stdout.emit('error',Object.assign(Error('bad file'),{code:'EIO'})),/bad file/);
 stderr.write=()=>{throw Object.assign(Error('real fault'),{code:'EINVAL'})};assert.throws(()=>log.error('fail'),/real fault/);
});
function closedPipeChild(file,body){
 const moduleFile=path.join(root,'scripts/smoke_io.cjs');
 const code=`const {createSmokeLogger}=require(${JSON.stringify(moduleFile)});const log=createSmokeLogger(${JSON.stringify(file)});process.once('message',()=>{${body}});process.stdout.write('ready\\n');`;
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['-e',code],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});let errors='';
  child.stderr.on('data',data=>errors+=data);child.once('error',reject);
  child.stdout.once('data',()=>child.stdout.destroy());child.stdout.once('close',()=>{if(child.connected)child.send('closed')});
  child.once('close',exit=>resolve({exit,errors}));
 });
}
test('real closed child stdout does not crash or discard later checks',{timeout:6000},async t=>{
 const file=journal(t),result=await closedPipeChild(file,"log.info('check one');log.info('check two');setTimeout(()=>{log.info('check three');process.exit(0)},100)");
 assert.equal(result.exit,0);assert.equal(result.errors,'');const text=fs.readFileSync(file,'utf8');assert.match(text,/EPIPE/);assert.match(text,/check three/);
});
test('a genuine test failure still exits nonzero after a pipe closes',{timeout:6000},async t=>{
 const file=journal(t),result=await closedPipeChild(file,"log.info('before failure');try{require('node:assert/strict').equal(1,2)}catch(e){log.error('genuine assertion failed');setTimeout(()=>process.exit(1),100)}");
 assert.equal(result.exit,1);assert.match(fs.readFileSync(file,'utf8'),/genuine assertion failed/);
});
