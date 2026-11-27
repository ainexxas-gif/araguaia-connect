/* Camada real: login Microsoft (Supabase Auth, provedor azure, implicit flow),
   funções public.ca_* (docs/api.md) e Realtime por WebSocket, sem biblioteca.
   O front não lê tabela. Só a chave publicável fica aqui. */
(function (g) {
  "use strict";
  var CFG = g.APP_CONFIG || {};
  var URL_ = (CFG.supabaseUrl || "").replace(/\/$/, "");
  var KEY = CFG.supabaseKey || "";
  var SK = "ld_sessao_v2";
  var sess = null, renovando = null;

  function lerSess() { try { return JSON.parse(localStorage.getItem(SK)); } catch (e) { return null; } }
  function gravarSess(s) { sess = s; try { if (s) localStorage.setItem(SK, JSON.stringify(s)); else localStorage.removeItem(SK); } catch (e) { /* ok */ } }

  function erroAmigavel(st, corpo) {
    var msg = (corpo && (corpo.message || corpo.msg || corpo.error_description)) || "";
    var cod = (corpo && corpo.code) || "";
    var e;
    if (st === 401 || cod === "28000" || cod === "PGRST301") { e = new Error("Sua sessão expirou. Entre de novo."); cod = "28000"; }
    else if (cod === "PGRST202") e = new Error("A plataforma foi atualizada. Recarregue a página para continuar.");
    else if (/^(42501|23514|23505|23503|P0001)$/.test(cod) && msg) e = new Error(msg);
    else if (st >= 500 || st === 0) e = new Error("Não foi possível falar com o servidor. Confira a internet e tente de novo.");
    else e = new Error(msg || "Algo deu errado. Tente de novo.");
    e.codigo = cod || String(st);
    return e;
  }

  function guardarToken(j) {
    gravarSess({ access_token: j.access_token, refresh_token: j.refresh_token, expira: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60000 });
  }
  /* Volta do login Microsoft: o token chega no #hash; lê e remove da URL. */
  function lerRetornoLogin() {
    var h = location.hash || "";
    if (h.indexOf("access_token=") < 0 && h.indexOf("error_description=") < 0) return null;
    var p = new URLSearchParams(h.replace(/^#/, ""));
    history.replaceState(null, "", location.pathname + location.search + "#/");
    if (p.get("error_description")) return p.get("error_description").replace(/\+/g, " ");
    guardarToken({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_in: p.get("expires_in") });
    return "";
  }
  async function renovar() {
    if (!sess || !sess.refresh_token) throw erroAmigavel(401, {});
    if (!renovando) {
      renovando = fetch(URL_ + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: sess.refresh_token })
      }).then(async function (r) {
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok) { gravarSess(null); throw erroAmigavel(401, j); }
        guardarToken(j);
      }).finally(function () { renovando = null; });
    }
    return renovando;
  }
  async function token() {
    if (!sess) sess = lerSess();
    if (!sess) throw erroAmigavel(401, {});
    if (Date.now() > sess.expira) await renovar();
    return sess.access_token;
  }
  async function rpc(nome, args, tentou) {
    var tk = await token(), r;
    try {
      r = await fetch(URL_ + "/rest/v1/rpc/" + nome, {
        method: "POST",
        headers: { apikey: KEY, Authorization: "Bearer " + tk, "Content-Type": "application/json" },
        body: JSON.stringify(args || {})
      });
    } catch (e) { throw erroAmigavel(0, {}); }
    if (r.status === 401 && !tentou) { await renovar(); return rpc(nome, args, true); }
    var txt = await r.text(), j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
    if (!r.ok) throw erroAmigavel(r.status, j);
    return j;
  }

  /* ---------- Realtime (protocolo Phoenix do Supabase) ---------- */
  var ws = null, ref = 0, canais = {}, hb = null, filaEnvio = [];
  function enviar(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); else filaEnvio.push(o); }
  function conectar() {
    if (ws && ws.readyState <= 1) return;
    ws = new WebSocket(URL_.replace(/^https/, "wss") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(KEY) + "&vsn=1.0.0");
    ws.onopen = function () {
      Object.keys(canais).forEach(function (t) { juntar(canais[t]); });
      while (filaEnvio.length) ws.send(JSON.stringify(filaEnvio.shift()));
      clearInterval(hb);
      hb = setInterval(function () { enviar({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref) }); }, 25000);
    };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      var c = canais[m.topic]; if (!c) return;
      if (m.event === "postgres_changes" && c.aoMudar) c.aoMudar();
      if (m.event === "broadcast" && m.payload && m.payload.event === "digitando" && c.aoDigitar) c.aoDigitar(m.payload.payload || {});
    };
    ws.onclose = function () { clearInterval(hb); if (Object.keys(canais).length) setTimeout(conectar, 3000); };
  }
  async function juntar(c) {
    var tk; try { tk = await token(); } catch (e) { return; }
    enviar({ topic: c.topico, event: "phx_join", ref: String(++ref), payload: { access_token: tk, config: {
      broadcast: { self: false }, presence: { key: "" },
      postgres_changes: c.filtros.map(function (f) { return { event: "*", schema: "central_atendimento", table: f.tabela, filter: f.filtro }; })
    } } });
  }
  function assinarCanal(topico, filtros, aoMudar, aoDigitar) {
    var c = { topico: "realtime:" + topico, filtros: filtros, aoMudar: aoMudar, aoDigitar: aoDigitar };
    canais[c.topico] = c;
    if (ws && ws.readyState === 1) juntar(c); else conectar();
    return function () {
      enviar({ topic: c.topico, event: "phx_leave", payload: {}, ref: String(++ref) });
      delete canais[c.topico];
    };
  }

  var API = {
    modo: "supabase",
    /* Abre o login Microsoft da Araguaia; volta para esta página com o token no #hash. */
    entrarMicrosoft: function () {
      var volta = location.origin + location.pathname;
      location.href = URL_ + "/auth/v1/authorize?provider=azure&scopes=" + encodeURIComponent("email openid profile") + "&redirect_to=" + encodeURIComponent(volta);
      return new Promise(function () {});
    },
    retornoLogin: lerRetornoLogin,
    sessao: async function () { if (!lerSess()) return null; return rpc("ca_sessao", {}); },
    identificar: function (matricula) { return rpc("ca_identificar", { p_matricula: String(matricula || "").trim() }); },
    sair: async function () {
      try { var tk = sess && sess.access_token; if (tk) await fetch(URL_ + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + tk } }); } catch (e) { /* ok */ }
      gravarSess(null);
      Object.keys(canais).forEach(function (t) { delete canais[t]; });
      if (ws) ws.close();
    },
    menu: function () { return rpc("ca_menu", {}); },
    iniciar: function (assuntoId) { return rpc("ca_iniciar", { p_assunto: Number(assuntoId) }); },
    enviarRespostas: function (id, respostas) { return rpc("ca_enviar_respostas", { p_chamado: id, p_respostas: respostas }); },
    meusChamados: function () { return rpc("ca_meus_chamados", { p_limite: 50 }); },
    chamado: function (id) { return rpc("ca_chamado", { p_chamado: id }); },
    enviarMensagem: function (id, conteudo) { return rpc("ca_enviar_mensagem", { p_chamado: id, p_conteudo: conteudo }); },
    marcarLidas: function (id) { return rpc("ca_marcar_lidas", { p_chamado: id }); },
    desistir: function (id, motivo) { return rpc("ca_desistir", { p_chamado: id, p_motivo: motivo || null }); },
    avaliar: function (id, nota, comentario) { return rpc("ca_avaliar", { p_chamado: id, p_nota: nota, p_comentario: comentario || null }); },
    /* Conversa aberta: mensagens e o próprio chamado; "digitando" por broadcast. */
    assinar: function (id, aoMudar, aoDigitar) {
      return assinarCanal("ca-chamado-" + id, [{ tabela: "mensagens", filtro: "chamado_id=eq." + id }, { tabela: "chamados", filtro: "id=eq." + id }], aoMudar, aoDigitar);
    },
    /* Lista: qualquer mudança nos meus chamados (o Realtime filtra por RLS). */
    assinarLista: function (aoMudar) { return assinarCanal("ca-meus", [{ tabela: "chamados" }], aoMudar); },
    avisarDigitando: function (id) {
      enviar({ topic: "realtime:ca-chamado-" + id, event: "broadcast", ref: String(++ref), payload: { type: "broadcast", event: "digitando", payload: { autor: "solicitante" } } });
    }
  };
  g.ApiSupabase = API;
})(window);
