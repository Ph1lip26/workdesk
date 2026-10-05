const asar=require('@electron/asar'),path=require('node:path'),fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),payload=path.resolve(process.argv[2] || path.join(root,'build/dist/win-unpacked'));
const unpack=path.join(root,'build/audit/desktop');fs.mkdirSync(unpack,{recursive:true});
asar.extractAll(path.join(payload,'resources/app.asar'),unpack);
const py=process.env.WORKDESK_PYTHON || path.join(root,'build/runtime/python.exe');
const r=spawnSync(py,[path.join(root,'scripts/privacy_check.py'),'--payload',payload,'--own-source',unpack],{cwd:root,env:process.env,stdio:'inherit'});
process.exit(r.status || (r.error?1:0));
