const path=require('node:path'),fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),home=path.join(root,'build/unit-home');fs.mkdirSync(home,{recursive:true});
const python=process.env.WORKDESK_PYTHON || (fs.existsSync(path.join(root,'build/runtime/python.exe'))?path.join(root,'build/runtime/python.exe'):'python');
const env={...process.env,WORKDESK_HOME:home,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'};
for(const [command,args] of [[process.execPath,['--test','tests/desktop.test.cjs','tests/smoke_io.test.cjs','tests/branding.test.cjs','tests/shell.test.cjs']],[process.execPath,['tests/test_ui.js']],
 [python,['scripts/privacy_check.py']],[python,['-m','unittest','discover','-s','tests','-p','test_*.py']]]){
 const result=spawnSync(command,args,{cwd:root,env,stdio:'inherit'});if(result.error || result.status!==0)process.exit(result.status || 1);
}
