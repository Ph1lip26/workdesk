// Separate, explicitly experimental target; never reuse a Windows runtime.
const base=require('./package.json').build;
module.exports={...base,directories:{output:'build/dist-mac'},
 beforeBuild:()=>{
  if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('Mac test packaging requires a macOS arm64 host.');
  const path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
  const runtime=path.join(__dirname,'build/runtime');
  if(fs.existsSync(path.join(runtime,'python.exe')))throw Error('Refusing to bundle a Windows runtime in a Mac app.');
  const actual=execFileSync(path.join(runtime,'bin/python3'),['-I','-c','import sys,platform;print(sys.platform,platform.machine())'],{encoding:'utf8'}).trim();
  if(actual!=='darwin arm64')throw Error('Unexpected bundled Python platform: '+actual);
  return true;
 },
 extraResources:base.extraResources.map(item=>item.to==='runtime'?{...item,
  filter:[...item.filter,'!**/site-packages/av/**','!**/site-packages/av.libs/**','!**/site-packages/av-*.dist-info/**']}:item),
 mac:{target:['dmg','zip'],category:'public.app-category.productivity',icon:'assets/icon.png',minimumSystemVersion:'14.0',
  identity:'-',hardenedRuntime:false,artifactName:'Workdesk-${version}-macOS-${arch}-TEST.${ext}'}};
