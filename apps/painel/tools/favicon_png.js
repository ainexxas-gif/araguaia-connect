// Gera src/favicon32.png a partir de src/icone.svg (mesmo desenho, nunca à parte).
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
(async()=>{const raiz=path.join(__dirname,'..');const svg=fs.readFileSync(path.join(raiz,'src/icone.svg'),'utf8');
const b=await chromium.launch();const p=await b.newPage({viewport:{width:32,height:32}});
await p.setContent('<html><body style="margin:0;background:transparent">'+svg.replace('<svg ','<svg width="32" height="32" ')+'</body></html>');
await p.screenshot({path:path.join(raiz,'src/favicon32.png'),omitBackground:true,clip:{x:0,y:0,width:32,height:32}});await b.close();})();
