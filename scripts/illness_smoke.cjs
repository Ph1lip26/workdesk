// Native UI and API against synthetic fixture only, never a personal health record.
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(path.basename(process.env.WORKDESK_HOME||'')!=='native-test')throw Error('Synthetic fixture required');
const payload=process.env.WORKDESK_TEST_PAYLOAD;
if(payload){Object.defineProperty(app,'isPackaged',{value:true});Object.defineProperty(process,'resourcesPath',{value:path.join(path.resolve(payload),'resources')})}
const desk=require(payload?path.join(process.resourcesPath,'app.asar/desktop/main.cjs'):'../desktop/main.cjs'),wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name)};
(async()=>{try{
 await desk.startup;const w=desk.window,wc=w.webContents;wc.setBackgroundThrottling(false);
 const js=s=>wc.executeJavaScript(s.includes('await ')?'(async()=>{'+s+'})()':s).catch(e=>{fs.writeFileSync(path.join(process.env.WORKDESK_HOME,'illness-failed-expression.txt'),s);throw e});
 for(let i=0;i<100;i++){if(await js("typeof healthPage!=='undefined'&&state"))break;await wait(100)}
 desk.show();w.setContentSize(1180,760);await js("selectModule('health',{animate:false});$('health-illness').click()");await wait(350);
 check('illness is a secondary page, not a new module',await js("currentModule==='health'&&healthPage==='illness'&&$('health-illness').getAttribute('aria-current')==='page'&&!$('health-weight').hasAttribute('aria-current')"));
 await js("window.__weights=JSON.stringify((await api('health')).records);window.__illnessBefore=(await api('illness')).records.map(r=>r.id);openIllnessEditor();$('illness-symptoms').value='Synthetic symptom';$('illness-content').value='<script>window.__bad=true</script>\\nSecond line';$('illness-form').dispatchEvent(new Event('input',{bubbles:true}));closeIllnessEditor()");
 check('dirty close preserves editor and input',await js("$('illnesseditor').open&&illnessDirty&&$('illness-content').value.includes('Second line')"));
 await js("$('illness-form').requestSubmit()");await wait(400);
 check('save closes editor and displays escaped symptoms/content',await js("!$('illnesseditor').open&&illnessState.records.some(r=>r.symptoms==='Synthetic symptom')&&!window.__bad&&$('healthview').textContent.includes('<script>window.__bad=true</script>')"));
 await js("window.__illnessTest=illnessState.records.find(r=>!window.__illnessBefore.includes(r.id));openIllnessEditor(window.__illnessTest.id);$('illness-symptoms').value='Updated symptom';$('illness-form').requestSubmit()");await wait(400);
 check('edit increments revision',await js("illnessState.records.find(r=>r.id===window.__illnessTest.id).revision===2"));
 await js("openIllnessEditor(window.__illnessTest.id);$('illness-delete').click()");
 check('delete requires a second confirmation',await js("$('illnesseditor').open&&illnessState.records.some(r=>r.id===window.__illnessTest.id)"));
 for(const theme of ['night','day']){await js(`paintAppearance('${theme}');$('illnesseditor').close();renderIllness()`);await wait(180);fs.writeFileSync(path.join(process.env.WORKDESK_HOME,'illness-'+theme+'.png'),(await wc.capturePage()).toPNG())}
 await js("openIllnessEditor(window.__illnessTest.id);$('illness-delete').click();$('illness-delete').click()");await wait(350);
 check('only targeted illness record deleted',await js("JSON.stringify(illnessState.records.map(r=>r.id))===JSON.stringify(window.__illnessBefore)"));
 check('weight records untouched',await js("return JSON.stringify((await api('health')).records)===window.__weights"));
 await js("$('health-weight').click()");await wait(200);
 check('weight page remains functional',await js("healthPage==='weight'&&$('healthview').querySelector('.health-trend')&&$('health-weight').getAttribute('aria-current')==='page'"));
 await js("selectHealthPage('illness')");await wc.reload();await wait(500);
 check('reloaded UI and new API available',await js("return typeof selectHealthPage==='function'&&(await api('illness')).records.every(r=>r.symptoms!=='Updated symptom')"));
 fs.writeFileSync(path.join(process.env.WORKDESK_HOME,'illness-smoke.json'),JSON.stringify({ok:true,checks},null,2));await desk.quit();
}catch(e){fs.writeFileSync(path.join(process.env.WORKDESK_HOME,'illness-smoke-error.log'),e.stack);try{await desk.stopBackend()}catch{}app.exit(1)}})();
