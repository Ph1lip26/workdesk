// Private raster overrides stay in userData, never the public package.
const fs=require('node:fs'),path=require('node:path');
function brandFile(home,fallback){
 try{
  const root=fs.realpathSync(home),file=path.join(root,'brand','icon.png'),stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<32||stat.size>2*1024*1024)return fallback;
  const real=fs.realpathSync(file),rel=path.relative(root,real);
  if(rel.startsWith('..')||path.isAbsolute(rel))return fallback;
  const data=fs.readFileSync(file);
  if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||data.subarray(12,16).toString()!=='IHDR'||![16,20].every(i=>data.readUInt32BE(i)>0&&data.readUInt32BE(i)<=1024))return fallback;
  return file;
 }catch{return fallback}
}
module.exports={brandFile};
