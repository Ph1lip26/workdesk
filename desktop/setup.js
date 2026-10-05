const fields=['vault_path','codex_path','obsidian_path','media_path','hf_endpoint'];
window.workdesk.getSettings().then(c=>fields.forEach(k=>document.getElementById(k).value=c[k]||''));
document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',async()=>{const value=await window.workdesk.choosePath(b.dataset.kind);if(value)document.getElementById(b.dataset.kind).value=value}));
document.getElementById('settings').addEventListener('submit',async e=>{e.preventDefault();const m=document.getElementById('message');m.textContent='正在验证配置…';try{const r=await window.workdesk.saveSettings(Object.fromEntries(fields.map(k=>[k,document.getElementById(k).value.trim()])));m.textContent=r.ok?'配置已保存':r.error}catch(err){m.textContent=err.message}});
