/* Backend simulado para a prévia local. Imita as funções public.ca_* (docs/api.md):
   mesmos nomes de campo, mesmos status e os MESMOS fluxos da carga inicial
   (fluxos-previa.js é gerado pelo montar.py a partir da migração 5).
   Dados fictícios, gravados só neste navegador. */
(function (g) {
  "use strict";
  var CHAVE = "ld_mock_v4";
  var arquivosMock = {};
  var M = g.Motor;
  var FLUXOS = g.FLUXOS_PREVIA || {};

  var AREAS = [
    { id: 1, codigo: "PI", nome: "Planejamento Integrado", descricao: "RC, OV e troca de centro", icone: "calendario", cor: "#003D7C" },
    { id: 2, codigo: "OC", nome: "Operações Comerciais", descricao: "Motoristas, modificação de pedidos, data de remessa e entregas", icone: "caminhao", cor: "#3F8C00" },
    { id: 3, codigo: "SAC", nome: "Serviço ao Cliente", descricao: "Documentos, pagamentos, produto e preço", icone: "balao", cor: "#1A5A9E" }
  ];
  var ASSUNTOS = [
    [1, 1, "RC", "Requisição de compra (RC)", "Criar ou ajustar RC", "RC", 6],
    [2, 1, "OV", "Ordem de venda (OV)", "Criar ou ajustar OV", "OV", 5],
    [3, 1, "TROCA_CENTRO", "Troca de centro", "Mudar o centro de origem do pedido", "OV", 8],
    [4, 2, "CAD_MOTORISTA", "Cadastro de motoristas", "Cadastrar motorista e veículo", null, 7],
    [5, 2, "MODIF_PEDIDO", "Modificação de pedidos", "Alterar quantidade, produto ou condição", "PEDIDO", 9],
    [6, 2, "DATA_REMESSA", "Alteração de data de remessa", "Antecipar ou adiar a remessa", "PEDIDO", 6],
    [7, 2, "ENTREGAS", "Entregas", "Status, ocorrência ou agendamento", "PEDIDO", 5],
    [8, 3, "DOC_PAGAMENTO", "Documentos e pagamentos", "Boleto, NF, comprovante, 2ª via", "NF", 10],
    [9, 3, "PRODUTO_PRECO", "Produto e preço", "Dúvida de produto, tabela ou preço", null, 12]
  ].map(function (a) { return { id: a[0], area_id: a[1], codigo: a[2], nome: a[3], descricao: a[4], documento_tipo: a[5], espera: a[6] }; });
  var ATENDENTES = { 1: ["Marina Costa", "Rafael Lima"], 2: ["Bruno Alves", "Camila Rocha", "Diego Martins"], 3: ["Patrícia Nunes", "Lucas Ferraz"] };

  function agora() { return new Date().toISOString(); }
  function emSeg(s) { return new Date(Date.now() + s * 1000).toISOString(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function erro(msg, cod) { var e = new Error(msg); e.codigo = cod || "P0001"; return e; }
  function emExpediente() {
    var d = new Date(), dia = d.getDay(), m = d.getHours() * 60 + d.getMinutes();
    if (dia >= 1 && dia <= 5) return m >= 450 && m < 1080;
    if (dia === 6) return m >= 480 && m < 720;
    return false;
  }
  var FORA = "Recebemos o seu pedido fora do horário de atendimento (seg a sex 07:30–18:00, sáb 08:00–12:00). Ele já está na fila e será atendido no próximo expediente.";

  var mem = null;
  function db() {
    if (mem) return mem;
    try { mem = JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { mem = null; }
    if (!mem) mem = semente();
    return mem;
  }
  function gravar() { try { localStorage.setItem(CHAVE, JSON.stringify(mem)); } catch (e) { /* segue em memória */ } }
  function assunto(id) { return ASSUNTOS.filter(function (s) { return s.id === Number(id); })[0]; }
  function area(id) { return AREAS.filter(function (a) { return a.id === id; })[0]; }

  function novoChamado(s, status) {
    var d = db(); d.prot = (d.prot || 40) + 1;
    var ar = area(s.area_id), ano = String(new Date().getFullYear()).slice(2);
    return { id: "00000000-0000-4000-8000-" + String(d.prot).padStart(12, "0"), protocolo: ar.codigo + ano + "-" + String(d.prot).padStart(5, "0"), status: status,
      area: { id: ar.id, codigo: ar.codigo, nome: ar.nome }, assunto: { id: s.id, codigo: s.codigo, nome: s.nome, documento_tipo: s.documento_tipo },
      fila: { id: s.id, nome: ar.codigo + " · " + s.nome }, atendente: null, respostas: {}, resumo: null, prioridade: 0, fora_horario: false,
      criado_em: agora(), entrou_fila_em: null, assumido_em: null, primeira_resposta_em: null, encerrado_em: null, espera_seg: null, atendimento_seg: null,
      resultado: null, documento_tipo: null, documento_numero: null, avaliacao: null, ultima_msg_em: null, ultima_msg_autor: null,
      mensagens: [], _ev: [], posicao_fila: null, espera_estimada_min: s.espera };
  }
  function msg(c, autor, conteudo, quando) {
    var d = db(); d.seq = (d.seq || 0) + 1;
    var m = { id: d.seq, autor: autor, atendente: autor === "atendente" && c.atendente ? c.atendente.nome : null, conteudo: conteudo, tipo: "texto",
      criada_em: quando || agora(), lida_em: null };
    c.mensagens.push(m); c.ultima_msg_em = m.criada_em; c.ultima_msg_autor = autor;
    return m;
  }

  function semente() {
    mem = { seq: 0, prot: 40, chamados: [], sessao: null, matricula: null };
    var base = Date.now() - 26 * 3600 * 1000;
    function iso(ms) { return new Date(ms).toISOString(); }
    function feito(sid, resp, ms, nota, docNum, falas) {
      var s = assunto(sid), c = novoChamado(s, "encerrado"), def = FLUXOS[s.codigo];
      c.respostas = def ? M.paraEnviar(def, resp) : resp;
      c.resumo = def ? M.resumo(def, resp).map(function (r) { return r.rotulo + ": " + r.valor; }).join("\n") : "";
      c.criado_em = c.entrou_fila_em = iso(ms); c.assumido_em = iso(ms + 6 * 60000); c.encerrado_em = iso(ms + 28 * 60000);
      c.espera_seg = 360; c.atendimento_seg = 1320; c.resultado = "resolvido"; c.documento_tipo = s.documento_tipo; c.documento_numero = docNum;
      c.atendente = { id: "a1", nome: ATENDENTES[s.area_id][0] };
      msg(c, "bot", c.resumo, c.criado_em);
      msg(c, "sistema", "Pedido recebido. Protocolo " + c.protocolo + ". Você será atendido em instantes.", c.criado_em);
      falas.forEach(function (f, i) { msg(c, f[0], f[1], iso(ms + (7 + i * 3) * 60000)); });
      msg(c, "sistema", "Atendimento encerrado · " + M.RESULTADOS.resolvido + (docNum ? " · " + s.documento_tipo + " " + docNum : ""), c.encerrado_em);
      c.mensagens.forEach(function (m) { m.lida_em = m.criada_em; });
      c.avaliacao = nota ? { nota: nota, comentario: null } : null;
      mem.chamados.push(c);
    }
    feito(4, { numero_pedido: "4500012345", motorista_nome: "José Exemplo da Silva", motorista_cpf: "52998224725", motorista_cnh: "12345678900",
      motorista_telefone: "64999990000", placa_cavalo: "QWE1R23", placa_carreta: "", transportadora: "Transportes Exemplo", foto_cnh: "" }, base, 5, null,
      [["atendente", "Motorista cadastrado e vinculado ao pedido 4500012345. Já pode carregar."], ["solicitante", "Perfeito, obrigado!"]]);
    feito(8, { tipo: "2ª via de boleto", cliente: "1023456", documento: "", observacao: "Cliente perdeu o boleto que vence sexta." }, base - 22 * 3600 * 1000, null, null,
      [["atendente", "Segue a 2ª via com vencimento mantido. Enviei também para o e-mail do cliente."]]);
    return mem;
  }

  /* Simulação do atendente: eventos agendados que vencem com o tempo. */
  function tick(c) {
    var t = agora(), mudou = false;
    c._ev = (c._ev || []).filter(function (ev) {
      if (ev.em > t) return true;
      mudou = true;
      if (ev.tipo === "posicao" && c.status === "na_fila") { c.posicao_fila = ev.valor; c.espera_estimada_min = Math.max(1, ev.valor * 2); }
      else if (ev.tipo === "assume" && c.status === "na_fila") {
        var nomes = ATENDENTES[c.area.id];
        c.status = "em_atendimento"; c.assumido_em = t; c.posicao_fila = null;
        c.atendente = { id: "a" + c.area.id, nome: nomes[Number(c.protocolo.slice(-1)) % nomes.length] };
        c.mensagens.forEach(function (m) { if (m.autor === "solicitante" && !m.lida_em) m.lida_em = t; });
        msg(c, "atendente", "Olá! Aqui é " + c.atendente.nome.split(" ")[0] + ", de " + c.area.nome + ". Já estou com o seu pedido de " +
          c.assunto.nome.toLowerCase() + " em mãos. Vou conferir e já te retorno.");
        c.primeira_resposta_em = t;
      } else if (ev.tipo === "lida") c.mensagens.forEach(function (m) { if (m.autor === "solicitante" && !m.lida_em) m.lida_em = t; });
      else if (ev.tipo === "digitando") c._digitando_ate = ev.ate;
      else if (ev.tipo === "resposta" && c.status === "em_atendimento") {
        var falas = ["Certo, estou conferindo no SAP.", "Pronto, ajustei aqui. Pode conferir se ficou como você precisa?", "Mais alguma coisa sobre este pedido?"];
        c._resp = (c._resp || 0) + 1;
        msg(c, "atendente", falas[Math.min(c._resp - 1, falas.length - 1)]);
        c._digitando_ate = null;
      }
      return false;
    });
    return mudou;
  }
  function exige() {
    var d = db();
    if (!d.sessao) throw erro("Sua sessão expirou. Entre de novo.", "28000");
    return d;
  }
  function meu(id) {
    var c = exige().chamados.filter(function (x) { return x.id === id; })[0];
    if (!c) throw erro("Chamado não encontrado.", "42501");
    tick(c);
    return c;
  }
  function json(c, comMsgs) {
    var o = clone(c); delete o._ev; delete o._resp; delete o._digitando_ate;
    o.digitando = !!(c._digitando_ate && c._digitando_ate > agora());
    var def = FLUXOS[c.assunto.codigo];
    o.resumo_itens = def && c.status !== "bot" ? M.resumo(def, c.respostas) : [];
    if (c.status !== "na_fila") { o.posicao_fila = null; o.espera_estimada_min = null; }
    if (!comMsgs) delete o.mensagens;
    return o;
  }
  function sessaoJson() {
    var d = db();
    return { email: "consultor.exemplo@araguaia.com.br", nome: "Consultor Exemplo",
      solicitante: d.matricula ? { id: "s1", matricula: d.matricula, nome: "Consultor Exemplo", funcao: "Consultor técnico de vendas",
        equipe: { id: 1, codigo: "EV214", descricao: "Rio Verde (GO)" } } : null,
      atendente: null, admin: false, precisa_identificar: !d.matricula };
  }

  var API = {
    modo: "previa",
    /* Na prévia o botão Microsoft só simula o login. */
    entrarMicrosoft: async function () { await espera(200); db().sessao = { email: "consultor.exemplo@araguaia.com.br" }; gravar(); return true; },
    sessao: async function () { return db().sessao ? sessaoJson() : null; },
    identificar: async function (matricula) {
      exige(); await espera(250);
      var m = String(matricula || "").trim();
      if (!/^[0-9A-Za-z]{3,20}$/.test(m)) throw erro("Informe a sua matrícula (só números).", "23514");
      if (m === "000") throw erro("Matrícula " + m + " não encontrada. Confira o número ou fale com a administração da Central.", "23503");
      db().matricula = m; gravar();
      return sessaoJson();
    },
    sair: async function () { var d = db(); d.sessao = null; d.matricula = null; gravar(); },
    menu: async function () {
      exige();
      var exp = emExpediente();
      return AREAS.map(function (a) {
        var o = clone(a);
        o.assuntos = ASSUNTOS.filter(function (s) { return s.area_id === a.id; }).map(function (s) {
          return { id: s.id, codigo: s.codigo, nome: s.nome, descricao: s.descricao, em_expediente: exp, msg_fora_horario: FORA, espera_estimada_min: s.espera };
        });
        return o;
      });
    },
    iniciar: async function (assuntoId) {
      var d = exige(); await espera(150);
      var s = assunto(assuntoId);
      if (!s) throw erro("Assunto indisponível.", "23503");
      var def = FLUXOS[s.codigo];
      if (!def) throw erro("Este assunto ainda não tem fluxo publicado.", "23503");
      var c = d.chamados.filter(function (x) { return x.assunto.id === s.id && x.status === "bot" && Date.now() - new Date(x.criado_em) < 1800000; })[0];
      if (!c) { c = novoChamado(s, "bot"); d.chamados.push(c); gravar(); }
      return { chamado: json(c), fluxo: { id: s.id, versao: 1, definicao: clone(def) } };
    },
    enviarRespostas: async function (id, respostas) {
      exige(); await espera(300);
      var c = meu(id);
      if (c.status !== "bot") throw erro("Este chamado já foi enviado.", "23514");
      var def = FLUXOS[c.assunto.codigo], e = M.validarTudo(def, respostas);
      if (e) throw erro(e, "23514");
      c.respostas = M.paraEnviar(def, respostas);
      c.resumo = M.resumo(def, respostas).map(function (r) { return r.rotulo + ": " + r.valor; }).join("\n");
      c.status = "na_fila"; c.entrou_fila_em = agora(); c.fora_horario = !emExpediente(); c.posicao_fila = 3;
      if (c.resumo) msg(c, "bot", c.resumo);
      msg(c, "sistema", c.fora_horario ? FORA : "Pedido recebido. Protocolo " + c.protocolo + ". Você será atendido em instantes.");
      c._ev = [{ em: emSeg(3), tipo: "posicao", valor: 2 }, { em: emSeg(6), tipo: "posicao", valor: 1 }, { em: emSeg(9), tipo: "assume" }];
      gravar();
      return json(c);
    },
    meusChamados: async function () {
      var d = exige();
      var lista = d.chamados.filter(function (c) { tick(c); return c.status !== "bot"; });
      gravar();
      return lista.sort(function (a, b) { return a.criado_em < b.criado_em ? 1 : -1; }).map(function (c) {
        var o = json(c);
        o.nao_lidas = c.mensagens.filter(function (m) { return (m.autor === "atendente" || m.autor === "sistema") && !m.lida_em; }).length;
        var u = c.mensagens.filter(function (m) { return m.autor !== "bot"; }).slice(-1)[0];
        o.ultima_msg = u ? { autor: u.autor, conteudo: u.conteudo, lida_em: u.lida_em } : null;
        return o;
      });
    },
    chamado: async function (id) { var c = meu(id); gravar(); return json(c, true); },
    enviarArquivo: async function (id, arquivo) {
      exige(); await espera(300);
      var path = id + "/" + Date.now().toString(36) + "-" + (arquivo.name || "arquivo");
      arquivosMock[path] = URL.createObjectURL(arquivo);
      return { path: path, nome: arquivo.name || "arquivo", mime: arquivo.type || "" };
    },
    linkArquivo: async function (path) { if (!arquivosMock[path]) throw erro("Anexo de exemplo (só existe na prévia).", "P0001"); return arquivosMock[path]; },
    enviarMensagem: async function (id, conteudo, anexo) {
      exige(); await espera(200);
      var c = meu(id);
      if (c.status === "encerrado" || c.status === "desistiu") throw erro("Este chamado está encerrado. Abra um novo pelo menu.", "23514");
      if (c.status === "bot") throw erro("Termine de responder as perguntas antes de conversar.", "23514");
      var t = String(conteudo || "").trim();
      if (!t && !anexo) throw erro("Mensagem vazia.", "23514");
      if (c.status === "aguardando_solicitante") c.status = "em_atendimento";
      var m = msg(c, "solicitante", t || null);
      if (anexo) { m.anexo_path = anexo.path; m.anexo_nome = anexo.nome; m.anexo_mime = anexo.mime; m.tipo = /^image\//.test(anexo.mime) ? "imagem" : "arquivo"; }
      if (c.status === "em_atendimento") c._ev.push({ em: emSeg(1), tipo: "lida" }, { em: emSeg(1.5), tipo: "digitando", ate: emSeg(4) }, { em: emSeg(4), tipo: "resposta" });
      gravar();
      return { id: m.id, autor: m.autor, criada_em: m.criada_em };
    },
    marcarLidas: async function (id) {
      var c = meu(id), n = 0;
      c.mensagens.forEach(function (m) { if (m.autor !== "solicitante" && !m.lida_em) { m.lida_em = agora(); n++; } });
      gravar(); return n;
    },
    desistir: async function (id, motivo) {
      exige(); var c = meu(id);
      if (!/^(bot|na_fila|em_atendimento|aguardando_solicitante)$/.test(c.status)) throw erro("Este chamado já foi encerrado.", "23514");
      var antes = c.status;
      c.status = "desistiu"; c.encerrado_em = agora(); c._ev = []; c.posicao_fila = null;
      if (antes !== "bot") msg(c, "sistema", "O consultor cancelou o pedido." + (motivo ? " Motivo: " + motivo : ""));
      gravar(); return json(c);
    },
    avaliar: async function (id, nota, comentario) {
      exige(); var c = meu(id);
      if (c.status !== "encerrado") throw erro("A avaliação abre quando o chamado for encerrado.", "23514");
      if (c.avaliacao) throw erro("Este chamado já foi avaliado.", "23505");
      nota = Number(nota);
      if (!(nota >= 1 && nota <= 5)) throw erro("Escolha uma nota de 1 a 5.", "23514");
      c.avaliacao = { nota: nota, comentario: String(comentario || "").trim() || null };
      gravar(); return json(c);
    },
    /* Tempo real: na prévia, a própria simulação avisa a cada segundo. */
    assinar: function (id, aoMudar) { var t = setInterval(aoMudar, 1000); return function () { clearInterval(t); }; },
    /* Só na prévia: simula ações do atendente. */
    _simular: async function (id, acao) {
      var c = meu(id), t = agora();
      if (!c.atendente) c.atendente = { id: "a" + c.area.id, nome: ATENDENTES[c.area.id][0] };
      if (!c.assumido_em) c.assumido_em = t;
      c._ev = []; c._digitando_ate = null; c.posicao_fila = null;
      if (acao === "aguardar") {
        c.status = "aguardando_solicitante";
        msg(c, "atendente", "Preciso de uma informação: o cliente aceita receber em duas cargas?");
      } else {
        var doc = c.assunto.documento_tipo ? String(4500000000 + (Date.now() % 99999)) : null;
        c.status = "encerrado"; c.encerrado_em = t; c.resultado = "resolvido";
        c.documento_tipo = doc ? c.assunto.documento_tipo : null; c.documento_numero = doc;
        c.espera_seg = Math.round((new Date(c.assumido_em) - new Date(c.entrou_fila_em || c.criado_em)) / 1000);
        c.atendimento_seg = Math.round((new Date(t) - new Date(c.assumido_em)) / 1000);
        msg(c, "sistema", "Atendimento encerrado · " + M.RESULTADOS.resolvido + (doc ? " · " + c.documento_tipo + " " + doc : ""));
      }
      gravar(); return json(c, true);
    },
    _zerar: function () { mem = semente(); gravar(); }
  };
  g.ApiMock = API;
})(window);
