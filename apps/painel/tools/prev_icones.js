const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:760,height:260},deviceScaleFactor:2});
let h='<body style="font-family:Carlito;display:flex;gap:16px;padding:16px;background:#eef2f7">';
for(const k of 'ABCD'){const s=fs.readFileSync('src/icones/opcao_'+k+'.svg','utf8');const u='data:image/svg+xml;base64,'+Buffer.from(s).toString('base64');
h+=`<div style="background:#fff;border:1px solid #D9E2EC;border-radius:12px;padding:12px;width:160px;text-align:center"><b>Opção ${k}</b><br><img src="${u}" width=64><br><img src="${u}" width=32> <img src="${u}" width=16><div style="margin-top:8px;background:#dfe5ec;border-radius:8px 8px 0 0;padding:4px 6px;font-size:12px;text-align:left"><img src="${u}" width=16 style="vertical-align:middle"> Central de Atend…</div></div>`;}
await p.setContent(h);await p.screenshot({path:process.argv[2]});await b.close();})();
