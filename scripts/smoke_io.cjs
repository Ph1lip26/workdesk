// Test-only logging. A closed command pipe must not crash an Electron main process.
const fs=require('node:fs'),path=require('node:path');
function fixtureHome(value,root){
 const expected=path.resolve(root,'build/native-test');
 if(!value||path.resolve(value)!==expected)throw Error('Native smoke requires the isolated build/native-test home');
 return expected;
}
function createSmokeLogger(file,{stdout=process.stdout,stderr=process.stderr}={}){
 const broken=new Set();fs.writeFileSync(file,'','utf8');
 const label=stream=>stream===stdout?'stdout':'stderr';
 function pipeError(stream,error){
  if(error.code!=='EPIPE')throw error;
  if(!broken.has(stream))fs.appendFileSync(file,`[${label(stream)} closed: EPIPE]\n`,'utf8');
  broken.add(stream);
 }
 for(const stream of new Set([stdout,stderr]))stream.on('error',error=>pipeError(stream,error));
 function write(stream,message){
  const line=String(message)+'\n';fs.appendFileSync(file,line,'utf8');
  if(broken.has(stream))return;
  try{stream.write(line)}catch(error){pipeError(stream,error)}
 }
 return {info:message=>write(stdout,message),error:message=>write(stderr,message)};
}
module.exports={fixtureHome,createSmokeLogger};
