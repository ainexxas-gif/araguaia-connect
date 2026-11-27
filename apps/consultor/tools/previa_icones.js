// Gera a folha de prévia das opções de ícone (grande, celular, 32px, aba 16px; claro e escuro).
const { chromium } = require('playwright');
const fs = require('fs');
const dir = __dirname + '/../src/icones/';
const out = process.argv[2] || __dirname + '/../shots/icones_opcoes.png';
const ops = [
  ['A', 'Balão com seta', 'Pedido que vai direto à pessoa certa'],
  ['B', 'Conversa (recomendado)', 'Consultor e área conectados numa conversa'],
  ['C', 'Balão com conexão', 'Dois pontos ligados: quem pede e quem resolve'],
  ['D', 'Conversa clara', 'Mesma ideia do B, fundo branco']
];
const svg = k => fs.readFileSync(dir + k + '.svg', 'utf8');
const card = (k, nome, frase, dark) => `
  <div class="card ${dark ? 'dk' : ''}">
    <div class="op">${k}</div>
    <div class="big">${svg(k)}</div>
    <div class="nome">${nome}</div><div class="frase">${frase}</div>
    <div class="linha">
      <div class="cel"><div class="app">${svg(k)}</div><span>Connect</span></div>
      <div class="s32">${svg(k)}</div>
      <div class="aba"><span class="s16">${svg(k)}</span>Araguaia Connect</div>
    </div>
  </div>`;
const html = `<html><head><style>
body{margin:0;font-family:Carlito,Calibri,sans-serif;background:#EEF2F7;padding:24px}
h1{margin:0 0 4px;color:#003D7C;font-size:24px} p{margin:0 0 16px;color:#444}
.grid{display:grid;grid-template-columns:repeat(4,250px);gap:14px}
.card{background:#fff;border:1px solid #D9E2EC;border-radius:14px;padding:14px;position:relative}
.card.dk{background:#132235;border-color:#26394F;color:#E8EDF3}
.op{position:absolute;top:10px;left:12px;font-weight:700;color:#5E6B7A}
.big svg{width:96px;height:96px;display:block;margin:10px auto 8px}
.nome{font-weight:700;text-align:center;font-size:16px}.frase{text-align:center;font-size:13px;color:#5E6B7A;min-height:34px}
.dk .frase{color:#93A1B0}
.linha{display:flex;align-items:center;justify-content:space-between;margin-top:10px;gap:6px}
.cel{display:flex;flex-direction:column;align-items:center;font-size:11px;gap:2px}
.app svg{width:48px;height:48px;border-radius:12px;display:block}
.s32 svg{width:32px;height:32px;display:block}
.aba{display:flex;align-items:center;gap:6px;background:#DEE1E6;border-radius:8px 8px 0 0;padding:6px 8px;font-size:12px;color:#1A1A1A}
.dk .aba{background:#35363A;color:#E8EAED}
.s16 svg{width:16px;height:16px;display:block}
.row{margin-bottom:14px}
</style></head><body>
<h1>Ícone do Araguaia Connect · 4 opções</h1><p>Linha de cima: tema claro. Linha de baixo: tema escuro. Cada card mostra o ícone grande, na tela do celular, em 32 px e na aba do navegador (16 px).</p>
<div class="grid row">${ops.map(o => card(o[0], o[1], o[2], false)).join('')}</div>
<div class="grid">${ops.map(o => card(o[0], o[1], o[2], true)).join('')}</div>
</body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2 });
  await p.setContent(html);
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
  console.log('ok', out);
})();
