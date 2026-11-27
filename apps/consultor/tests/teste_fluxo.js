// Teste de tela do app do consultor (prévia com dados simulados).
// Uso: node tests/teste_fluxo.js [url]   — gera capturas em shots/
const { chromium, devices } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/';
const SHOTS = __dirname + '/../shots/';
let ok = 0; const falhas = [];
function check(nome, cond) { if (cond) ok++; else falhas.push(nome); console.log((cond ? 'OK     ' : 'FALHOU ') + nome); }

async function auditoria(page, rotulo) {
  const r = await page.evaluate(() => {
    const de = document.documentElement, out = { hscroll: de.scrollWidth > de.clientWidth, peq: [], txt: '', estouro: [], toque: [] };
    const cw = de.clientWidth, celular = cw < 760;
    document.querySelectorAll('body *').forEach(e => {
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
      if (r.right > cw + 1 && !e.closest('.filtros')) out.estouro.push(e.tagName + '.' + e.className);
      const temTexto = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (temTexto && parseFloat(cs.fontSize) < 11.5 && !e.closest('svg')) out.peq.push(e.className + ':' + cs.fontSize + ':' + e.textContent.trim().slice(0, 20));
      if (/^(INPUT|TEXTAREA)$/.test(e.tagName) && parseFloat(cs.fontSize) < 16) out.peq.push('campo<16:' + e.id);
      if (celular && e.tagName === 'BUTTON' && !e.closest('dd,.comp-dica') && r.height < 32) out.toque.push(e.id || e.className);
    });
    out.txt = document.body.innerText;
    return out;
  });
  check(`${rotulo}: sem rolagem horizontal`, !r.hscroll);
  check(`${rotulo}: nada estoura a tela ${r.estouro.slice(0, 3).join(',')}`, r.estouro.length === 0);
  check(`${rotulo}: fonte mínima ${r.peq.slice(0, 3).join(' | ')}`, r.peq.length === 0);
  check(`${rotulo}: alvo de toque >= 32px ${r.toque.slice(0, 3).join(',')}`, r.toque.length === 0);
  check(`${rotulo}: texto limpo`, !/undefined|NaN|\[object|\bnull\b|Ã/.test(r.txt));
}

(async () => {
  const b = await chromium.launch();
  const cfgs = [
    { nome: '390', ctx: { ...devices['iPhone 13'], locale: 'pt-BR' } },
    { nome: '1280', ctx: { viewport: { width: 1280, height: 800 }, locale: 'pt-BR' } }
  ];
  for (const cfg of cfgs) {
    const ctx = await b.newContext(cfg.ctx);
    const page = await ctx.newPage();
    const erros = [], externos = [];
    page.on('pageerror', e => erros.push(e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
    page.on('request', r => { if (!r.url().startsWith(URL) && !r.url().startsWith('data:')) externos.push(r.url()); });
    const W = cfg.nome, shot = n => page.screenshot({ path: `${SHOTS}${n}_${W}.png` });
    await page.goto(URL);
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload();
    await page.waitForSelector('#btn-ms');
    await shot('01_login');
    await auditoria(page, `${W} login`);
    await page.click('#btn-ms');
    await page.waitForSelector('#in-matricula');
    await page.press('#in-matricula', 'Enter');
    check(`${W} matrícula vazia mostra erro`, (await page.textContent('#err-matricula')).length > 0);
    await page.fill('#in-matricula', '000'); await page.press('#in-matricula', 'Enter');
    await page.waitForFunction(() => document.querySelector('#err-matricula').textContent.includes('não encontrada'));
    check(`${W} matrícula inexistente recusada com mensagem do banco`, true);
    await shot('01b_matricula');
    await page.fill('#in-matricula', '104523'); await page.press('#in-matricula', 'Enter');
    await page.waitForSelector('.item-conv');
    await shot('02_lista');
    await auditoria(page, `${W} lista`);
    check(`${W} lista tem o filtro Para avaliar`, (await page.textContent('#filtros-lista')).includes('Para avaliar'));
    await page.click('#btn-novo');
    await page.waitForSelector('.card-area');
    await shot('03_menu');
    await auditoria(page, `${W} menu`);
    await page.fill('#busca-assunto', 'motorísta');
    check(`${W} busca sem acento acha cadastro de motorista`, (await page.textContent('#menu-resultado')).includes('Cadastro de motorista'));
    await page.fill('#busca-assunto', '');
    // Data de remessa: data no passado recusada (min_hoje), depois descarta
    await page.fill('#busca-assunto', 'remessa');
    await page.click('[data-assunto="6"]');
    await page.waitForSelector('#in-resp');
    await page.fill('#in-resp', '4500123456'); await page.press('#in-resp', 'Enter');
    await page.waitForSelector('#in-resp[type=date]');
    await page.fill('#in-resp', '2020-01-01'); await page.click('#btn-resp');
    check(`${W} data no passado é recusada`, (await page.textContent('.comp-erro')).includes('anterior'));
    if (W === '390') await page.click('#conv-voltar'); else await page.evaluate(() => { location.hash = '#/'; });
    await page.click('#btn-novo');
    await page.waitForSelector('.card-area');
    await page.click('[data-area="2"]');
    await page.waitForSelector('[data-assunto="5"]');
    await shot('04_assuntos');
    await page.click('[data-assunto="5"]');
    await page.waitForSelector('#in-resp');
    await page.fill('#in-resp', '12345'); await page.press('#in-resp', 'Enter');
    check(`${W} pedido com 5 dígitos é recusado`, (await page.textContent('.comp-erro')).includes('só números'));
    await shot('05_validacao');
    await page.fill('#in-resp', '4500123456'); await page.click('#btn-resp');
    await page.waitForSelector('[data-multi]');
    check(`${W} múltipla escolha exige ao menos uma`, await page.isDisabled('#btn-multi'));
    await page.click('[data-multi="Quantidade"]'); await page.click('[data-multi="Produto"]');
    await shot('06_opcoes');
    await auditoria(page, `${W} opções`);
    await page.click('#btn-multi');
    await page.waitForSelector('textarea#in-resp');
    await page.fill('#in-resp', 'Quantidade de 30 t para 45 t no item 10'); await page.click('#btn-resp');
    await page.click('.opcao:has-text("Pedido do cliente")');
    await page.waitForSelector('#btn-enviar-pedido');
    await shot('07_resumo');
    await auditoria(page, `${W} resumo`);
    check(`${W} resumo mostra as duas alterações`, (await page.textContent('.resumo')).includes('Quantidade, Produto'));
    await page.click('[data-corrigir=detalhe]');
    await page.waitForSelector('textarea#in-resp');
    await page.fill('#in-resp', 'Quantidade de 30 t para 50 t no item 10'); await page.click('#btn-resp');
    await page.waitForSelector('#btn-enviar-pedido');
    check(`${W} correção volta ao resumo com valor novo`, (await page.textContent('.resumo')).includes('50 t'));
    await page.click('#btn-enviar-pedido');
    await page.waitForSelector('.fila-info');
    await shot('08_fila');
    check(`${W} protocolo gerado`, /OC\d{2}-\d{5}/.test(await page.textContent('#conv-status')));
    await page.waitForSelector('.msg.ele', { timeout: 15000 });
    await shot('09_atendimento');
    check(`${W} atendente assumiu`, (await page.textContent('#conv-status')).includes('Em atendimento'));
    await page.evaluate(() => { window.__viuDigit = false; new MutationObserver(() => { if (document.querySelector('.digit')) window.__viuDigit = true; }).observe(document.body, { childList: true, subtree: true }); });
    await page.fill('#in-msg', 'Consegue confirmar hoje?');
    if (W === '1280') await page.press('#in-msg', 'Enter'); else await page.click('#btn-enviar');
    await page.waitForSelector('.chk.lido', { timeout: 6000 });
    await page.waitForFunction(() => document.querySelectorAll('.msg.ele .balao:not(.digit)').length >= 2, null, { timeout: 8000 });
    check(`${W} indicador digitando apareceu`, await page.evaluate(() => window.__viuDigit));
    await shot('10_conversa');
    await auditoria(page, `${W} conversa`);
    await page.click('[data-sim=aguardar]');
    await page.waitForSelector('.fila-info.voce');
    check(`${W} status Aguardando você`, (await page.textContent('#conv-status')).includes('Aguardando você'));
    await shot('10b_aguardando');
    await page.click('[data-sim=encerrar]');
    await page.waitForSelector('.notas');
    await page.click('[data-nota="4"]');
    await page.fill('#in-coment', 'Rápido e resolveu.');
    await shot('11_avaliar');
    await auditoria(page, `${W} avaliação`);
    await page.click('#btn-avaliar');
    await page.waitForSelector('.avaliado');
    await shot('12_encerrado');
    check(`${W} avaliação registrada`, (await page.textContent('.avaliado')).includes('4 de 5'));
    await page.click('#btn-tema').catch(() => {});
    if (W === '390') await page.click('#conv-voltar'); else await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForSelector('.item-conv');
    await page.click('#btn-tema');
    await shot('13_lista_escuro');
    await auditoria(page, `${W} escuro`);
    await page.click('.item-conv');
    await page.waitForSelector('.encerrado-card');
    await shot('14_conversa_escuro');
    await page.click('#btn-tema').catch(() => {});
    await page.reload(); await page.waitForSelector('.timeline .msg');
    check(`${W} F5 mantém sessão e conversa aberta`, await page.isVisible('#view-conv'));
    check(`${W} sem erro de console ${erros.join(' | ')}`, erros.length === 0);
    check(`${W} zero chamada externa ${externos.join(',')}`, externos.length === 0);
    await ctx.close();
  }
  await b.close();
  console.log(`\n${ok} OK · ${falhas.length} falhas`);
  process.exit(falhas.length ? 1 : 0);
})();
