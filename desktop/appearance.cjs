// Private preference is shared with the backend. Reading the OS theme never changes it.
const fs=require('node:fs'),path=require('node:path');
function valid(mode){return mode==='day'||mode==='night'||mode==='system'}
function read(home){try{const mode=JSON.parse(fs.readFileSync(path.join(home,'appearance.json'),'utf8')).mode;return valid(mode)?mode:'night'}catch{return 'night'}}
function resolve(mode,dark){return mode==='system'?(dark?'night':'day'):(valid(mode)?mode:'night')}
function palette(mode){return mode==='day'?{color:'#d2d2d2',symbolColor:'#292929',height:40}:{color:'#131415',symbolColor:'#d0d3d7',height:40}}
module.exports={valid,read,resolve,palette};
