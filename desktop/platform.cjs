const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

function trusted(url, origin) {
  try { const u = new URL(url); return u.origin === origin && !u.username && !u.password; } catch { return false; }
}
function safeExternal(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
function loadConfig(home) {
  try { return JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8')); } catch { return {}; }
}
function saveConfig(home, config) {
  fs.mkdirSync(home, {recursive:true});
  const file = path.join(home, 'config.json'), temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(config, null, 2), {mode:0o600});
  fs.renameSync(temp, file);
}
function request(origin, route, token, body) {
  return new Promise((resolve, reject) => {
    const headers = {'Origin':origin};
    if (token) headers['X-Workbench-Token'] = token;
    const options = {method: body ? 'POST':'GET', headers, timeout:route==='/health'?2000:30000};
    if (body) { headers['Content-Type']='application/json'; headers['Content-Length']=Buffer.byteLength(body); }
    const req = http.request(origin + route, options, res => {
      let result='';res.setEncoding('utf8');res.on('data', c => result+=c);
      res.on('end', () => {
        if(res.statusCode < 400)return resolve(result);
        let message='后台请求失败';try{message=JSON.parse(result).error || message}catch{}
        reject(new Error(message));
      });
    });
    req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('后台请求超时')));
    if (body) req.write(body);req.end();
  });
}
module.exports = {trusted, safeExternal, loadConfig, saveConfig, request};
