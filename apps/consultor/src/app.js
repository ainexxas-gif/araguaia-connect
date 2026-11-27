/* App do consultor: login Microsoft + matrícula, lista de atendimentos, menu de serviços,
   fluxo guiado (chatbot) com validação, conversa em tempo real e avaliação.
   Sem dependências externas. Contrato do banco: docs/api.md e docs/fluxos.md. */
(function () {
  "use strict";
  var CFG = window.APP_CONFIG || {};
  var M = window.Motor;
  var REAL = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(CFG.supabaseUrl || "") && (CFG.supabaseKey || "").indexOf("sb_publishable_") === 0;
  var api = REAL ? window.ApiSupabase : window.ApiMock;
  /* Navegação: no site usa o #hash (F5 e voltar do celular funcionam); dentro de um
     quadro que não deixa mudar o endereço (prévia publicada), guarda a rota em memória. */
  var NAV_INTERNA = !!CFG.navInterna, rotaInterna = "";
  function hashAtual() { return NAV_INTERNA ? rotaInterna : location.hash; }
  function trocarHash(h, substituir) {
    if (NAV_INTERNA) { rotaInterna = h; return; }
    if (substituir) history.replaceState(null, "", h); else location.hash = h;
  }

  var S = { sessao: null, menu: [], lista: [], filtro: null, busca: "", rota: "", conv: null, bot: null,
    assinatura: "", modoComp: "", enviando: false, pendentes: [], confirma: "", nota: 0, digitandoAte: 0,
    desassinar: null, ultDigitar: 0 };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ok */ } }
  function eu() { return S.sessao && S.sessao.solicitante; }
  function primeiroNome() { return String((eu() && eu().nome) || (S.sessao && S.sessao.nome) || "").split(" ")[0]; }
  function areaDe(id) { return S.menu.filter(function (a) { return a.id === id; })[0] || { codigo: "?", cor: "#003D7C", nome: "" }; }
  function ehCelular() { return window.matchMedia("(pointer: coarse)").matches; }
  function desktop() { return window.matchMedia("(min-width: 760px)").matches; }

  /* ---------- Tema (claro por padrão, escuro só por botão) ---------- */
  function aplicarTema(t) {
    document.documentElement.setAttribute("data-theme", t);
    $("btn-tema").textContent = t === "dark" ? "Claro" : "Escuro";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0E1B2B" : "#003D7C");
  }
  aplicarTema(lsGet("ld_tema") === "dark" ? "dark" : "light");
  $("btn-tema").addEventListener("click", function () {
    var t = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    lsSet("ld_tema", t); aplicarTema(t);
  });

  /* ---------- Avisos ---------- */
  var toastT = null;
  function toast(msg, tipo) {
    var t = $("toast"); t.textContent = msg; t.className = "toast " + (tipo || ""); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 4500);
  }
  function falha(e) {
    if (e && e.codigo === "28000") { encerrarSessao(e.message); return; }
    toast((e && e.message) || "Algo deu errado. Tente de novo.", "erro");
  }

  /* ---------- Login: Microsoft e, na primeira vez, a matrícula ---------- */
  function mostrarLogin(etapa, msg) {
    $("app").className = "vista-login";
    $("tela-login").hidden = false; $("hdr").hidden = true; $("corpo").hidden = true; $("faixa-previa").hidden = REAL;
    $("etapa-ms").hidden = etapa !== "ms"; $("form-mat").hidden = etapa !== "mat";
    $("err-ms").textContent = etapa === "ms" ? (msg || "") : "";
    $("err-matricula").textContent = etapa === "mat" ? (msg || "") : "";
    if (etapa === "mat") { $("mat-nome").textContent = primeiroNome() || "consultor"; setTimeout(function () { $("in-matricula").focus(); }, 30); }
  }
  $("btn-ms").addEventListener("click", async function () {
    this.disabled = true; this.lastChild.textContent = "Abrindo o login…";
    try { await api.entrarMicrosoft(); await comecar(); }
    catch (e) { $("err-ms").textContent = e.message; }
    finally { this.disabled = false; this.lastChild.textContent = "Entrar com a conta Araguaia"; }
  });
  $("in-matricula").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 20); });
  $("form-mat").addEventListener("submit", async function (e) {
    e.preventDefault();
    var m = $("in-matricula").value.trim();
    $("in-matricula").classList.remove("invalido");
    if (m.length < 3) { $("err-matricula").textContent = "Informe a sua matrícula (só números)."; $("in-matricula").classList.add("invalido"); return; }
    var b = $("btn-mat"); b.disabled = true; b.textContent = "Conferindo…";
    try { S.sessao = await api.identificar(m); await entrarNoApp(); }
    catch (er) { if (er.codigo === "28000") return falha(er); $("err-matricula").textContent = er.message; $("in-matricula").classList.add("invalido"); }
    finally { b.disabled = false; b.textContent = "Continuar"; }
  });
  $("btn-mat-sair").addEventListener("click", async function () { await api.sair(); encerrarSessao(); });
  $("btn-sair").addEventListener("click", async function () { await api.sair(); encerrarSessao(); });
  function encerrarSessao(msg) {
    if (S.desassinar) S.desassinar(); S.desassinar = null;
    S.sessao = null; S.conv = null; S.bot = null; S.lista = [];
    if (NAV_INTERNA) rotaInterna = ""; else history.replaceState(null, "", location.pathname + location.search);
    mostrarLogin("ms", msg);
  }

  async function comecar() {
    try { S.sessao = await api.sessao(); } catch (e) { S.sessao = null; if (e.codigo !== "28000") { mostrarLogin("ms", e.message); return; } }
    if (!S.sessao) { mostrarLogin("ms"); return; }
    if (S.sessao.precisa_identificar) { mostrarLogin("mat"); return; }
    if (!S.sessao.solicitante) { mostrarLogin("ms", "Este login é de atendente. Use o console da Central para atender; este app é para os consultores."); return; }
    await entrarNoApp();
  }
  async function entrarNoApp() {
    var s = eu();
    $("tela-login").hidden = true; $("hdr").hidden = false; $("corpo").hidden = false;
    $("faixa-previa").hidden = REAL;
    $("hdr-ctx").textContent = s.nome + " · Matrícula " + s.matricula + (s.equipe ? " · " + s.equipe.codigo + (s.equipe.descricao ? " " + s.equipe.descricao : "") : "");
    try { S.menu = await api.menu(); } catch (e) { falha(e); return; }
    if (api.assinarLista) api.assinarLista(function () { carregarLista(); });
    await carregarLista();
    rotear();
  }

  /* ---------- Rotas: #/  #/novo  #/novo/<area>  #/pedido/<assunto>  #/c/<id> ---------- */
  function ir(h) { if (NAV_INTERNA || hashAtual() === h) { trocarHash(h); rotear(); } else trocarHash(h); }
  window.addEventListener("hashchange", rotear);
  function rotear() {
    if (!eu()) return;
    var p = hashAtual().replace(/^#\/?/, "").split("/");
    S.rota = p[0] || ""; S.confirma = "";
    if (S.desassinar && !(S.rota === "c" && S.conv && S.conv.id === p[1])) { S.desassinar(); S.desassinar = null; }
    ["main-vazio", "view-menu", "view-conv"].forEach(function (id) { $(id).hidden = true; });
    if (S.rota === "novo") { S.conv = null; S.bot = null; mostrar("main"); $("view-menu").hidden = false; renderMenu(); }
    else if (S.rota === "pedido" && p[1]) abrirFluxo(Number(p[1]));
    else if (S.rota === "c" && p[1]) abrirChamado(p[1]);
    else { S.conv = null; S.bot = null; mostrar("lista"); $("main-vazio").hidden = false; }
    renderLista();
  }
  function mostrar(qual) { $("app").className = "vista-app v-" + qual; }

  /* ---------- Lista de atendimentos ---------- */
  async function carregarLista() {
    try { S.lista = await api.meusChamados(); } catch (e) { falha(e); }
    renderLista();
  }
  var FILTROS = [
    { id: "abertos", rotulo: "Em aberto", teste: function (c) { return M.aberto(c.status); } },
    { id: "avaliar", rotulo: "Para avaliar", teste: function (c) { return c.status === "encerrado" && !c.avaliacao; } },
    { id: "todos", rotulo: "Todos", teste: function () { return true; } }
  ];
  function previa(c) {
    var u = c.ultima_msg;
    if (u && u.conteudo) return (u.autor === "solicitante" ? '<span class="chk' + (u.lida_em ? " lido" : "") + '">✓✓</span> ' : "") + esc(u.conteudo.split("\n")[0]);
    var nome = c.atendente ? c.atendente.nome.split(" ")[0] : "";
    var t = { na_fila: c.posicao_fila ? c.posicao_fila + "º na fila" : "Aguardando atendente", em_atendimento: nome ? "Com " + nome : "Em atendimento",
      aguardando_solicitante: "A área está esperando a sua resposta", encerrado: M.RESULTADOS[c.resultado] || "Encerrado", desistiu: "Pedido cancelado" }[c.status];
    return esc(t || "");
  }
  function renderLista() {
    var conta = {};
    FILTROS.forEach(function (x) { conta[x.id] = S.lista.filter(x.teste).length; });
    if (!S.filtro || (!S.filtroManual && !conta[S.filtro])) S.filtro = conta.abertos ? "abertos" : conta.avaliar ? "avaliar" : "todos";
    $("filtros-lista").innerHTML = FILTROS.map(function (x) {
      return '<button type="button" role="tab" class="chip' + (S.filtro === x.id ? " ativo" : "") + '" data-f="' + x.id + '" aria-selected="' + (S.filtro === x.id) + '">' +
        esc(x.rotulo) + ' <span class="selo">' + conta[x.id] + "</span></button>";
    }).join("");
    var filt = FILTROS.filter(function (x) { return x.id === S.filtro; })[0], t = M.semAcento(S.busca);
    var itens = S.lista.filter(filt.teste).filter(function (c) {
      return !t || M.semAcento([c.assunto.nome, c.area.nome, c.protocolo, c.documento_numero].join(" ")).indexOf(t) >= 0;
    });
    var lc = $("lista-conv");
    if (!S.lista.length) { lc.innerHTML = '<div class="vazio"><strong>Nenhum atendimento ainda</strong><p>Toque em “Novo atendimento” para pedir algo a uma das áreas.</p></div>'; return; }
    if (!itens.length) { lc.innerHTML = '<div class="vazio"><strong>Nada por aqui</strong><p>' + (t ? "Nenhum atendimento com “" + esc(S.busca) + "”." : "Nenhum atendimento com esse status.") + "</p></div>"; return; }
    var atual = S.conv && S.conv.id;
    lc.innerHTML = itens.map(function (c) {
      var st = M.STATUS[c.status] || { rotulo: c.status, cls: "" }, ar = areaDe(c.area.id);
      var aval = c.status === "encerrado" && !c.avaliacao;
      return '<button type="button" class="item-conv' + (atual === c.id ? " atual" : "") + '" data-id="' + esc(c.id) + '">' +
        '<span class="avatar" style="--av:' + esc(ar.cor) + '">' + esc(c.area.codigo) + "</span>" +
        '<span class="ic-meio"><span class="ic-l1"><strong>' + esc(c.assunto.nome) + "</strong><time>" + esc(M.quandoLista(c.ultima_msg_em || c.criado_em)) + "</time></span>" +
        '<span class="ic-l2"><span class="ic-prev">' + previa(c) + "</span>" + (c.nao_lidas ? '<span class="badge" aria-label="' + c.nao_lidas + ' não lidas">' + c.nao_lidas + "</span>" : "") + "</span>" +
        '<span class="ic-l3"><span class="st ' + st.cls + '">' + esc(st.rotulo) + '</span><span class="prot">' + esc(c.protocolo) + "</span>" +
        (c.documento_numero ? '<span class="prot">' + esc((c.documento_tipo || "") + " " + c.documento_numero) + "</span>" : "") +
        (aval ? '<span class="st st-aval">Avaliar</span>' : "") + "</span></span></button>";
    }).join("");
  }
  $("filtros-lista").addEventListener("click", function (e) { var b = e.target.closest("[data-f]"); if (b) { S.filtro = b.getAttribute("data-f"); S.filtroManual = true; renderLista(); } });
  $("busca-lista").addEventListener("input", function (e) { S.busca = e.target.value; renderLista(); });
  $("lista-conv").addEventListener("click", function (e) { var b = e.target.closest("[data-id]"); if (b) ir("#/c/" + b.getAttribute("data-id")); });
  $("btn-novo").addEventListener("click", function () { ir("#/novo"); });

  /* ---------- Menu de serviços ---------- */
  function areaAberta(a) { return (a.assuntos || []).some(function (s) { return s.em_expediente; }); }
  function horTxt(ok) { return ok ? '<span class="hor aberto">Atendendo agora</span>' : '<span class="hor fechado">Fora do horário · seu pedido entra na fila</span>'; }
  function renderMenu() {
    var p = hashAtual().split("/"), areaId = Number(p[2]) || 0;
    var area = areaId && S.menu.filter(function (a) { return a.id === areaId; })[0];
    var out = $("menu-resultado"), termo = $("busca-assunto").value;
    $("menu-voltar").textContent = area ? "← Áreas" : "← Voltar";
    $("menu-voltar").setAttribute("data-volta", area ? "#/novo" : "#/");
    if (termo.trim()) {
      var achou = M.buscarAssuntos(S.menu, termo);
      out.innerHTML = '<div class="sec-tit">' + (achou.length ? achou.length + (achou.length === 1 ? " assunto encontrado" : " assuntos encontrados") : "Nenhum assunto encontrado") + "</div>" +
        (achou.length ? achou.map(function (r) { return cardAssunto(r.area, r.assunto, true); }).join("") : '<div class="vazio"><p>Tente outra palavra ou escolha a área.</p></div>' + listaAreas());
      return;
    }
    if (area) {
      out.innerHTML = '<div class="area-topo" style="--av:' + esc(area.cor) + '"><span class="avatar">' + esc(area.codigo) + "</span><div><strong>" + esc(area.nome) + "</strong>" +
        horTxt(areaAberta(area)) + "<small>" + esc(area.descricao || "") + '</small></div></div><div class="sec-tit">Escolha o assunto</div>' +
        area.assuntos.map(function (s) { return cardAssunto(area, s, false); }).join("");
      return;
    }
    out.innerHTML = '<div class="sec-tit">Escolha a área</div>' + listaAreas();
  }
  function listaAreas() {
    return S.menu.map(function (a) {
      return '<button type="button" class="card-area" data-area="' + a.id + '" style="--av:' + esc(a.cor) + '"><span class="avatar">' + esc(a.codigo) + "</span>" +
        '<span class="ca-txt"><strong>' + esc(a.nome) + "</strong><span>" + esc(a.descricao || "") + "</span>" + horTxt(areaAberta(a)) + '</span><span class="seta">›</span></button>';
    }).join("");
  }
  function cardAssunto(area, s, comArea) {
    var esp = s.espera_estimada_min != null ? "Espera média hoje: ~" + M.duracao(s.espera_estimada_min) : (s.em_expediente ? "Atendendo agora" : "Fora do horário");
    return '<button type="button" class="card-assunto" data-assunto="' + s.id + '"><span class="ca-txt"><strong>' + esc(s.nome) + "</strong><span>" +
      esc(s.descricao || "") + (comArea ? " · " + esc(area.nome) : "") + "</span><small>" + esc(esp) + '</small></span><span class="seta">›</span></button>';
  }
  $("menu-resultado").addEventListener("click", function (e) {
    var a = e.target.closest("[data-area]"); if (a) { $("busca-assunto").value = ""; ir("#/novo/" + a.getAttribute("data-area")); return; }
    var s = e.target.closest("[data-assunto]"); if (s) { $("busca-assunto").value = ""; ir("#/pedido/" + s.getAttribute("data-assunto")); }
  });
  $("busca-assunto").addEventListener("input", renderMenu);
  $("menu-voltar").addEventListener("click", function () { ir(this.getAttribute("data-volta") || "#/"); });

  /* ---------- Fluxo guiado (chatbot) ---------- */
  function acharAssunto(id) {
    var r = null;
    S.menu.forEach(function (a) { (a.assuntos || []).forEach(function (s) { if (s.id === id) r = { area: a, assunto: s }; }); });
    return r;
  }
  function chaveRasc(cid) { return "ld_rasc_v2::" + (eu() ? eu().matricula : "") + "::" + cid; }
  function salvarRasc() { if (S.bot) lsSet(chaveRasc(S.bot.chamado.id), JSON.stringify({ respostas: S.bot.respostas, hist: S.bot.hist, vistas: S.bot.vistas })); }
  async function abrirFluxo(assuntoId) {
    var r = acharAssunto(assuntoId);
    if (!r) { toast("Assunto não encontrado.", "erro"); ir("#/novo"); return; }
    S.conv = null; mostrar("main"); $("view-conv").hidden = false;
    $("timeline").innerHTML = '<div class="carregando">Preparando o atendimento…</div>'; $("compositor").innerHTML = ""; $("conv-status").innerHTML = "";
    var ini;
    try { ini = await api.iniciar(assuntoId); } catch (e) { falha(e); ir("#/novo"); return; }
    if (S.rota !== "pedido") return;
    var rasc = null; try { rasc = JSON.parse(lsGet(chaveRasc(ini.chamado.id))); } catch (e) { rasc = null; }
    S.bot = { area: r.area, assunto: r.assunto, chamado: ini.chamado, def: ini.fluxo.definicao, respostas: {}, hist: [], vistas: {}, editando: null, erro: "", multi: [] };
    if (rasc) { S.bot.respostas = rasc.respostas || {}; S.bot.hist = rasc.hist || []; S.bot.vistas = rasc.vistas || {}; }
    else {
      falaBot("Olá, " + primeiroNome() + "! Vou abrir seu pedido de " + r.assunto.nome.toLowerCase() + " com " + r.area.nome + ". São perguntas rápidas para o pedido chegar completo na pessoa certa.");
      if (!r.assunto.em_expediente) falaBot(r.assunto.msg_fora_horario || "A área está fora do horário agora. Seu pedido entra na fila e é atendido no próximo expediente.", "aviso");
      avancar();
    }
    S.modoComp = ""; renderConversa(true);
  }
  function falaBot(t, tipo, extra) {
    var m = { autor: "bot", texto: t, tipo: tipo || "", em: new Date().toISOString() };
    if (extra) for (var k in extra) m[k] = extra[k];
    S.bot.hist.push(m);
  }
  function perguntaAtual() {
    var b = S.bot; if (!b) return null;
    if (b.editando) return (b.def.nos || []).filter(function (n) { return n.chave === b.editando; })[0] || null;
    return M.percorrer(b.def, b.respostas).pendente;
  }
  /* Mostra as mensagens do caminho ainda não vistas e faz a próxima pergunta. */
  function avancar() {
    var b = S.bot, r = M.percorrer(b.def, b.respostas);
    r.visitados.forEach(function (n) { if (n.tipo === "mensagem" && !b.vistas[n.id]) { b.vistas[n.id] = 1; falaBot(n.texto, "info"); } });
    var p = perguntaAtual();
    if (p) falaBot(p.rotulo, "", { ajuda: p.ajuda || "", chave: p.chave });
    else falaBot("Pronto! Confira o resumo e toque em “Enviar pedido”. Se algo estiver errado, toque em Corrigir.");
    b.multi = p && p.campo === "multipla" && Array.isArray(b.respostas[p.chave]) ? b.respostas[p.chave].slice() : [];
    salvarRasc();
  }
  function responder(valor, pulou) {
    var b = S.bot, p = perguntaAtual(); if (!p) return;
    var v = pulou ? "" : M.normalizar(p, valor), erro = M.validar(p, v);
    if (erro) { b.erro = erro; renderCompositor(true); return; }
    b.erro = ""; b.respostas[p.chave] = v; b.editando = null;
    b.hist.push({ autor: "consultor", texto: pulou ? "Pular" : M.exibir(p, v), em: new Date().toISOString() });
    avancar();
    S.modoComp = ""; renderConversa(true);
  }
  function corrigir(chave) {
    var b = S.bot, p = (b.def.nos || []).filter(function (n) { return n.chave === chave; })[0]; if (!p) return;
    b.editando = chave; b.erro = "";
    b.multi = p.campo === "multipla" && Array.isArray(b.respostas[chave]) ? b.respostas[chave].slice() : [];
    falaBot("Certo, vamos corrigir. " + p.rotulo, "", { chave: chave });
    salvarRasc(); S.modoComp = ""; renderConversa(true);
  }
  async function enviarPedido(btn) {
    if (S.enviando) return;
    var b = S.bot, e = M.validarTudo(b.def, b.respostas);
    if (e) { toast(e, "erro"); return; }
    S.enviando = true; btn.disabled = true; btn.textContent = "Enviando…"; document.body.classList.add("ocupado");
    try {
      var c = await api.enviarRespostas(b.chamado.id, M.paraEnviar(b.def, b.respostas));
      lsSet(chaveRasc(b.chamado.id), null);
      S.bot = null; S.filtro = "abertos"; S.filtroManual = false;
      trocarHash("#/c/" + c.id, true);
      await abrirChamado(c.id);
      carregarLista();
    } catch (er) { falha(er); btn.disabled = false; btn.textContent = "Enviar pedido"; }
    finally { S.enviando = false; document.body.classList.remove("ocupado"); }
  }
  async function cancelarFluxo() {
    var b = S.bot; if (!b) return;
    lsSet(chaveRasc(b.chamado.id), null); S.bot = null;
    api.desistir(b.chamado.id, "Desistiu durante as perguntas").catch(function () {});
    ir("#/");
  }

  /* ---------- Chamado (conversa real) ---------- */
  async function abrirChamado(id) {
    S.bot = null; S.rota = "c"; mostrar("main"); $("view-conv").hidden = false;
    if (!S.conv || S.conv.id !== id) {
      S.conv = null; S.assinatura = ""; S.modoComp = ""; S.nota = 0; S.digitandoAte = 0;
      $("timeline").innerHTML = '<div class="carregando">Carregando…</div>'; $("compositor").innerHTML = ""; $("conv-status").innerHTML = "";
    }
    try { S.conv = await api.chamado(id); } catch (e) { falha(e); ir("#/"); return; }
    renderConversa(true);
    marcarLidas();
    if (S.desassinar) S.desassinar();
    S.desassinar = api.assinar(id, atualizarConversa, function (p) {
      if (p.autor && p.autor !== "solicitante") { S.digitandoAte = Date.now() + 5000; renderCabecalhoConv(); renderTimeline(false); setTimeout(function () { renderCabecalhoConv(); renderTimeline(false); }, 5100); }
    });
  }
  var atualizando = false;
  async function atualizarConversa() {
    if (!S.conv || S.rota !== "c" || atualizando) return;
    atualizando = true;
    try {
      var c = await api.chamado(S.conv.id);
      if (!S.conv || S.conv.id !== c.id) return;
      var mudouStatus = c.status !== S.conv.status;
      S.conv = c;
      if (assinaturaDe(c) !== S.assinatura) {
        if (c.mensagens.length && c.mensagens[c.mensagens.length - 1].autor === "atendente") S.digitandoAte = 0;
        if (mudouStatus) { S.modoComp = ""; S.confirma = ""; }
        renderConversa(false); marcarLidas(); carregarLista();
      }
    } catch (e) { if (e.codigo === "28000") falha(e); }
    finally { atualizando = false; }
  }
  function marcarLidas() {
    var c = S.conv; if (!c || document.hidden) return;
    var tem = c.mensagens.some(function (m) { return m.autor !== "solicitante" && !m.lida_em; });
    if (tem) api.marcarLidas(c.id).then(function () { var it = S.lista.filter(function (x) { return x.id === c.id; })[0]; if (it) { it.nao_lidas = 0; renderLista(); } }).catch(function () {});
  }
  function digitando() { return (S.conv && S.conv.digitando) || S.digitandoAte > Date.now(); }
  function assinaturaDe(c) {
    var u = c.mensagens[c.mensagens.length - 1];
    return [c.status, c.mensagens.length, u && u.id, c.mensagens.filter(function (m) { return m.lida_em; }).length, c.digitando, c.posicao_fila, c.espera_estimada_min, !!c.avaliacao].join("|");
  }

  /* ---------- Renderização da conversa ---------- */
  function renderConversa(rolarFim) {
    renderCabecalhoConv();
    renderStatus();
    renderTimeline(rolarFim);
    renderCompositor(false);
  }
  function renderCabecalhoConv() {
    var area, tit, sub;
    if (S.bot) { area = S.bot.area; tit = S.bot.assunto.nome; sub = "Abrindo pedido · " + S.bot.area.nome; }
    else if (S.conv) {
      area = areaDe(S.conv.area.id); tit = S.conv.assunto.nome;
      sub = digitando() ? "digitando…" : S.conv.atendente ? S.conv.atendente.nome + " · " + S.conv.area.nome : S.conv.area.nome;
      S.assinatura = assinaturaDe(S.conv);
    } else return;
    var av = $("conv-avatar"); av.textContent = area.codigo || "?"; av.style.setProperty("--av", area.cor || "#003D7C");
    $("conv-titulo").textContent = tit; $("conv-sub").textContent = sub;
    $("conv-sub").classList.toggle("digitando", sub === "digitando…");
  }
  function renderStatus() {
    var box = $("conv-status"), c = S.conv;
    if (S.bot) {
      var pr = M.progresso(S.bot.def, S.bot.respostas), tot = Math.max(pr.total, 1);
      var feitas = perguntaAtual() ? pr.atual - 1 : tot;
      box.innerHTML = '<div class="progresso"><span>' + (perguntaAtual() ? "Pergunta " + pr.atual + " de " + tot : "Tudo respondido") +
        '</span><span class="barra-prog"><i style="width:' + Math.round(100 * feitas / tot) + '%"></i></span></div>';
      return;
    }
    if (!c) { box.innerHTML = ""; return; }
    var st = M.STATUS[c.status] || {};
    var linha = '<span class="st ' + st.cls + '">' + esc(st.rotulo) + '</span><span class="prot">Protocolo ' + esc(c.protocolo) + "</span>" +
      (c.documento_numero ? '<span class="prot">' + esc((c.documento_tipo || "") + " " + c.documento_numero) + "</span>" : "");
    var extra = "";
    if (c.status === "na_fila") {
      var pos = c.posicao_fila ? (c.posicao_fila === 1 ? "Você é o próximo da fila" : c.posicao_fila + "º na fila") : "Na fila";
      var esp = c.espera_estimada_min != null ? "Espera estimada: ~" + M.duracao(c.espera_estimada_min) + ". " : "";
      extra = '<div class="fila-info"><div><strong>' + esc(pos) + "</strong><span>" + esc(esp) + "Pode sair do app: o pedido continua na fila.</span></div>" + botaoCancelar() + "</div>";
    } else if (c.status === "aguardando_solicitante") {
      extra = '<div class="fila-info voce"><div><strong>A área está esperando a sua resposta</strong><span>Responda abaixo para o atendimento continuar.</span></div></div>';
    }
    box.innerHTML = '<div class="st-linha">' + linha + "</div>" + extra;
  }
  function botaoCancelar() {
    var conf = S.confirma === "cancelar";
    return '<button type="button" class="btn btn-sec btn-peq' + (conf ? " perigo" : "") + '" id="btn-cancelar-ch">' + (conf ? "Confirmar cancelamento" : "Cancelar pedido") + "</button>";
  }
  function bolha(cls, texto, hora, o) {
    o = o || {};
    if (cls === "sis") return '<div class="msg sis"><span>' + esc(texto) + "</span></div>";
    return '<div class="msg ' + cls + (o.cls ? " " + o.cls : "") + '"><div class="balao">' + (o.rotulo ? '<span class="quem">' + esc(o.rotulo) + "</span>" : "") +
      '<span class="txt">' + esc(texto).replace(/\n/g, "<br>") + "</span>" + (o.ajuda ? '<span class="ajuda">' + esc(o.ajuda) + "</span>" : "") +
      '<span class="meta">' + esc(hora) + (o.chk || "") + "</span></div></div>";
  }
  function chk(estado) {
    if (estado === "enviando") return ' <span class="chk" aria-label="Enviando">✓</span>';
    return ' <span class="chk' + (estado === "lida" ? " lido" : "") + '" aria-label="' + (estado === "lida" ? "Lida" : "Enviada") + '">✓✓</span>';
  }
  function dia(iso, ult) { var d = M.rotuloDia(iso); if (d === ult.v) return ""; ult.v = d; return '<div class="dia"><span>' + esc(d) + "</span></div>"; }
  function htmlResumo(itens, editavel) {
    return '<div class="msg bot"><div class="resumo"><div class="resumo-tit">Resumo do pedido</div><dl>' + itens.map(function (r) {
      return "<div><dt>" + esc(r.rotulo) + "</dt><dd><span>" + esc(r.valor) + "</span>" +
        (editavel && r.chave ? '<button type="button" class="link" data-corrigir="' + esc(r.chave) + '">Corrigir</button>' : "") + "</dd></div>";
    }).join("") + "</dl></div></div>";
  }
  function renderTimeline(rolarFim) {
    var tl = $("timeline"), perto = tl.scrollHeight - tl.scrollTop - tl.clientHeight < 140;
    tl.innerHTML = S.bot ? htmlBot() : S.conv ? htmlChamado() : "";
    if (rolarFim || perto) tl.scrollTop = tl.scrollHeight;
  }
  function htmlBot() {
    var b = S.bot, ult = { v: "" }, h = "";
    b.hist.forEach(function (m) {
      h += dia(m.em, ult);
      if (m.autor === "bot") h += bolha("bot", m.texto, M.horaCurta(m.em), { rotulo: "Assistente", ajuda: m.ajuda, cls: m.tipo });
      else h += bolha("eu", m.texto, M.horaCurta(m.em));
    });
    if (!perguntaAtual()) h += htmlResumo(M.resumo(b.def, b.respostas), true);
    return h;
  }
  function htmlChamado() {
    var c = S.conv, ult = { v: "" }, h = "";
    c.mensagens.forEach(function (m) {
      if (m.interna) return;
      h += dia(m.criada_em, ult);
      var hora = M.horaCurta(m.criada_em);
      if (m.autor === "bot" && c.resumo && m.conteudo === c.resumo) h += htmlResumo(c.resumo_itens && c.resumo_itens.length ? c.resumo_itens : M.resumoDeTexto(c.resumo), false);
      else if (m.autor === "solicitante") h += bolha("eu", m.conteudo || (m.anexo_nome ? "📎 " + m.anexo_nome : ""), hora, { chk: chk(m.lida_em ? "lida" : "enviada") });
      else if (m.autor === "atendente") h += bolha("ele", m.conteudo || (m.anexo_nome ? "📎 " + m.anexo_nome : ""), hora, { rotulo: m.atendente || (c.atendente && c.atendente.nome) || "Atendente" });
      else if (m.autor === "bot") h += bolha("bot", m.conteudo, hora, { rotulo: "Assistente" });
      else h += bolha("sis", m.conteudo, hora);
    });
    S.pendentes.filter(function (p) { return p.chamado === c.id; }).forEach(function (p) { h += bolha("eu", p.texto, M.horaCurta(p.em), { chk: chk("enviando") }); });
    if (digitando() && M.aberto(c.status)) h += '<div class="msg ele"><div class="balao digit" aria-label="Digitando"><i></i><i></i><i></i></div></div>';
    if (c.status === "encerrado") h += htmlEncerramento(c);
    return h;
  }
  function htmlEncerramento(c) {
    var t = "";
    if (c.espera_seg != null || c.atendimento_seg != null) {
      t = '<div class="tempos"><div><span>Espera na fila</span><strong>' + esc(M.duracao((c.espera_seg || 0) / 60)) + "</strong></div>" +
        "<div><span>Atendimento</span><strong>" + esc(M.duracao((c.atendimento_seg || 0) / 60)) + "</strong></div></div>";
    }
    return '<div class="encerrado-card"><div class="enc-tit">Atendimento encerrado</div><dl><div><dt>Resultado</dt><dd>' + esc(M.RESULTADOS[c.resultado] || c.resultado || "—") + "</dd></div>" +
      (c.documento_numero ? "<div><dt>Documento</dt><dd>" + esc((c.documento_tipo || "") + " " + c.documento_numero) + "</dd></div>" : "") +
      "<div><dt>Atendido por</dt><dd>" + esc(c.atendente ? c.atendente.nome : "—") + "</dd></div></dl>" + t +
      (c.avaliacao ? '<div class="avaliado">Sua avaliação: <strong>' + c.avaliacao.nota + " de 5</strong></div>" : "") + "</div>";
  }

  /* ---------- Compositor (área de resposta) ---------- */
  function modoCompositor() {
    if (S.bot) { var p = perguntaAtual(); return p ? "q:" + p.chave + ":" + S.bot.hist.length : "resumo"; }
    var c = S.conv; if (!c) return "";
    if (M.aberto(c.status)) return "texto";
    if (c.status === "encerrado" && !c.avaliacao) return "avaliar";
    return "fim";
  }
  function renderCompositor(forcar) {
    var modo = modoCompositor(), box = $("compositor");
    if (!forcar && modo === S.modoComp) return;
    var rasc = $("in-msg") ? $("in-msg").value : "";
    S.modoComp = modo;
    var h = "";
    if (S.bot && modo !== "resumo") h = compPergunta(perguntaAtual());
    else if (modo === "resumo") {
      h = '<div class="comp-acoes"><button type="button" class="btn btn-sec' + (S.confirma === "fluxo" ? " perigo" : "") + '" id="btn-cancelar-fluxo">' +
        (S.confirma === "fluxo" ? "Confirmar: descartar" : "Descartar") + '</button><button type="button" class="btn btn-verde" id="btn-enviar-pedido">Enviar pedido</button></div>';
    } else if (modo === "texto") {
      h = '<div class="comp-linha"><textarea id="in-msg" rows="1" maxlength="2000" placeholder="Mensagem" enterkeyhint="send" aria-label="Mensagem"></textarea>' +
        '<button type="button" class="btn-enviar" id="btn-enviar" aria-label="Enviar">➤</button></div>' +
        '<div class="comp-dica">' + (ehCelular() ? "Toque em ➤ para enviar" : "Enter envia · Shift+Enter pula linha") +
        (REAL ? "" : ' · Prévia: <button type="button" class="link" data-sim="aguardar">atendente pede informação</button> <button type="button" class="link" data-sim="encerrar">atendente encerra</button>') + "</div>";
    } else if (modo === "avaliar") {
      var rot = ["", "Muito ruim", "Ruim", "Regular", "Bom", "Ótimo"];
      h = '<div class="avaliar"><div class="av-tit">Como foi este atendimento?</div><div class="notas" role="radiogroup" aria-label="Nota de 1 a 5">' +
        [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" role="radio" aria-checked="' + (S.nota === n) + '" class="nota n' + n + (S.nota === n ? " sel" : "") + '" data-nota="' + n + '"><strong>' + n + "</strong><span>" + rot[n] + "</span></button>"; }).join("") +
        '</div><textarea id="in-coment" rows="2" maxlength="500" placeholder="Quer deixar um comentário? Ajuda a melhorar a Central." aria-label="Comentário"></textarea>' +
        '<button type="button" class="btn btn-prim btn-largo" id="btn-avaliar"' + (S.nota ? "" : " disabled") + ">Enviar avaliação</button></div>";
    } else if (modo === "fim") {
      h = '<div class="comp-acoes"><button type="button" class="btn btn-prim btn-largo" id="btn-novo-2">Novo atendimento</button></div>';
    }
    box.innerHTML = h;
    var im = $("in-msg"); if (im) { im.value = rasc || lsGet(chaveMsg()) || ""; ajustarAltura(im); }
    var alvo = box.querySelector("[data-foco]");
    if (alvo && desktop()) alvo.focus({ preventScroll: true });
  }
  function chaveMsg() { return "ld_msg::" + (S.conv ? S.conv.id : ""); }
  function compPergunta(p) {
    var b = S.bot, erro = b.erro ? '<div class="comp-erro" role="alert">' + esc(b.erro) + "</div>" : "";
    var pular = !p.obrigatorio ? '<button type="button" class="btn btn-sec btn-peq" id="btn-pular">Pular</button>' : "";
    var atual = b.respostas[p.chave];
    if (p.campo === "opcoes" || p.campo === "sim_nao") {
      var ops = p.campo === "sim_nao" ? ["Sim", "Não"] : p.opcoes || [];
      return erro + '<div class="opcoes' + (ops.length > 3 || p.campo === "sim_nao" ? " duas" : "") + '">' + ops.map(function (o, i) {
        return '<button type="button" class="opcao' + (atual === o ? " sel" : "") + '" data-op="' + esc(o) + '"' + (i === 0 ? " data-foco" : "") + ">" + esc(o) + "</button>";
      }).join("") + "</div>" + (pular ? '<div class="comp-acoes">' + pular + "</div>" : "");
    }
    if (p.campo === "multipla") {
      return erro + '<div class="comp-sub">Toque em uma ou mais opções</div><div class="opcoes duas">' + (p.opcoes || []).map(function (o, i) {
        var sel = b.multi.indexOf(o) >= 0;
        return '<button type="button" class="opcao multi' + (sel ? " sel" : "") + '" aria-pressed="' + sel + '" data-multi="' + esc(o) + '"' + (i === 0 ? " data-foco" : "") + ">" + (sel ? "✓ " : "") + esc(o) + "</button>";
      }).join("") + '</div><div class="comp-acoes">' + pular + '<button type="button" class="btn btn-prim" id="btn-multi"' + (b.multi.length || !p.obrigatorio ? "" : " disabled") + ">Confirmar" + (b.multi.length ? " (" + b.multi.length + ")" : "") + "</button></div>";
    }
    if (p.campo === "arquivo") {
      return '<div class="comp-sub">O envio de foto pelo app chega na próxima versão. Pule esta etapa e, se precisar, avise na conversa que o atendente indica como enviar.</div>' +
        '<div class="comp-acoes"><button type="button" class="btn btn-sec" id="btn-pular" data-foco>Pular</button></div>';
    }
    var tipo = p.campo === "data" ? "date" : "text";
    var im = M.soNumeros(p) ? "numeric" : p.campo === "numero" ? "decimal" : "text";
    var val = atual != null ? atual : "", ph = p.placeholder || (p.campo === "documento" ? "Só números" : M.ehPlaca(p) ? "ABC1D23" : "Digite aqui");
    var longo = p.campo === "texto" && !p.regex && !p.validador && (Number(p.max_caracteres) || 2000) > 200;
    var campo = longo
      ? '<textarea id="in-resp" rows="2" data-foco maxlength="' + (Number(p.max_caracteres) || 2000) + '" placeholder="' + esc(ph) + '" enterkeyhint="send" class="' + (b.erro ? "invalido" : "") + '">' + esc(val) + "</textarea>"
      : '<input id="in-resp" data-foco type="' + tipo + '" inputmode="' + im + '"' + (p.campo === "data" && p.min_hoje ? ' min="' + M.hojeISO() + '"' : "") +
        ' autocomplete="off" autocapitalize="' + (M.ehPlaca(p) ? "characters" : "sentences") + '" placeholder="' + esc(ph) + '" enterkeyhint="send" value="' + esc(val) + '" class="' + (b.erro ? "invalido" : "") + '">';
    return erro + '<div class="comp-linha">' + campo + '<button type="button" class="btn-enviar" id="btn-resp" aria-label="Responder">➤</button></div>' +
      '<div class="comp-dica">' + (p.obrigatorio ? "Obrigatório" : "Pode pular se não tiver") + (pular ? " · " + pular : "") + "</div>";
  }
  function ajustarAltura(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; }

  $("compositor").addEventListener("click", function (e) {
    var t = e.target;
    var op = t.closest("[data-op]"); if (op) { responder(op.getAttribute("data-op")); return; }
    var mu = t.closest("[data-multi]");
    if (mu) { var o = mu.getAttribute("data-multi"), i = S.bot.multi.indexOf(o); if (i >= 0) S.bot.multi.splice(i, 1); else S.bot.multi.push(o); S.bot.erro = ""; renderCompositor(true); return; }
    if (t.closest("#btn-multi")) { var p = perguntaAtual(); responder(p.opcoes.filter(function (x) { return S.bot.multi.indexOf(x) >= 0; })); return; }
    if (t.closest("#btn-resp")) { responder($("in-resp").value); return; }
    if (t.closest("#btn-pular")) { responder("", true); return; }
    if (t.closest("#btn-enviar-pedido")) { enviarPedido(t.closest("button")); return; }
    if (t.closest("#btn-cancelar-fluxo")) { if (S.confirma !== "fluxo") { S.confirma = "fluxo"; renderCompositor(true); } else cancelarFluxo(); return; }
    if (t.closest("#btn-enviar")) { enviarTexto(); return; }
    var n = t.closest("[data-nota]"); if (n) { S.nota = Number(n.getAttribute("data-nota")); var cm = $("in-coment").value; renderCompositor(true); $("in-coment").value = cm; return; }
    if (t.closest("#btn-avaliar")) { enviarAvaliacao(t.closest("button")); return; }
    if (t.closest("#btn-novo-2")) { ir("#/novo"); return; }
    var sim = t.closest("[data-sim]");
    if (sim && api._simular) api._simular(S.conv.id, sim.getAttribute("data-sim")).then(function (c) { S.conv = c; S.modoComp = ""; renderConversa(true); carregarLista(); });
  });
  $("compositor").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.isComposing) return;
    if (e.target.id === "in-resp") { if (e.target.tagName === "TEXTAREA" && ehCelular()) return; e.preventDefault(); responder(e.target.value); }
    else if (e.target.id === "in-msg") { if (ehCelular()) return; e.preventDefault(); enviarTexto(); }
    else if (e.target.id === "in-coment" && S.nota) { e.preventDefault(); enviarAvaliacao($("btn-avaliar")); }
  });
  $("compositor").addEventListener("input", function (e) {
    if (e.target.id === "in-msg") {
      ajustarAltura(e.target); lsSet(chaveMsg(), e.target.value || null);
      if (api.avisarDigitando && S.conv && Date.now() - S.ultDigitar > 3000) { S.ultDigitar = Date.now(); api.avisarDigitando(S.conv.id); }
    }
    if (e.target.id === "in-resp") {
      var p = perguntaAtual();
      if (p && p.campo !== "data" && M.soNumeros(p) && p.campo !== "numero") e.target.value = e.target.value.replace(/[^0-9]/g, "");
      if (p && M.ehPlaca(p)) e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
      if (S.bot.erro) { S.bot.erro = ""; var er = $("compositor").querySelector(".comp-erro"); if (er) er.remove(); e.target.classList.remove("invalido"); }
    }
  });
  $("timeline").addEventListener("click", function (e) { var c = e.target.closest("[data-corrigir]"); if (c) corrigir(c.getAttribute("data-corrigir")); });
  $("conv-status").addEventListener("click", async function (e) {
    if (!e.target.closest("#btn-cancelar-ch")) return;
    if (S.confirma !== "cancelar") { S.confirma = "cancelar"; renderStatus(); return; }
    try { S.conv = await api.desistir(S.conv.id, null); S.conv = await api.chamado(S.conv.id); S.confirma = ""; S.modoComp = ""; renderConversa(true); carregarLista(); }
    catch (er) { falha(er); }
  });
  $("conv-voltar").addEventListener("click", function () { ir("#/"); });

  async function enviarTexto() {
    var im = $("in-msg"), txt = im.value.trim(); if (!txt || !S.conv) return;
    var c = S.conv, pend = { chamado: c.id, texto: txt, em: new Date().toISOString() };
    S.pendentes.push(pend); im.value = ""; ajustarAltura(im); lsSet(chaveMsg(), null);
    renderTimeline(true);
    try { await api.enviarMensagem(c.id, txt); }
    catch (e) { falha(e); im.value = txt; }
    S.pendentes = S.pendentes.filter(function (p) { return p !== pend; });
    if (S.conv && S.conv.id === c.id) { S.assinatura = ""; await atualizarConversa(); renderTimeline(true); }
    if (desktop() && $("in-msg")) $("in-msg").focus({ preventScroll: true });
  }
  async function enviarAvaliacao(btn) {
    if (!btn || btn.disabled) return;
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      await api.avaliar(S.conv.id, S.nota, $("in-coment").value);
      S.conv = await api.chamado(S.conv.id);
      toast("Obrigado! Sua avaliação foi registrada.", "ok"); S.modoComp = ""; renderConversa(true); carregarLista();
    } catch (e) { falha(e); btn.disabled = false; btn.textContent = "Enviar avaliação"; }
  }

  /* ---------- Plano B do tempo real: consulta leve periódica ---------- */
  setInterval(function () {
    if (!eu() || document.hidden) return;
    if (S.conv && S.rota === "c") atualizarConversa();
    else carregarLista();
  }, REAL ? 15000 : 4000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && eu()) { if (S.conv) { atualizarConversa(); marcarLidas(); } carregarLista(); } });

  /* ---------- PWA ---------- */
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});

  /* ---------- Início ---------- */
  (async function () {
    var ret = api.retornoLogin ? api.retornoLogin() : null;
    if (ret) { mostrarLogin("ms", "O login não foi concluído: " + ret); return; }
    await comecar();
  })();
  window.__app = { S: S, api: api };
})();
