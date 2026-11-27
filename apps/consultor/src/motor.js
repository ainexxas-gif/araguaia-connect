/* Motor de regras do app do consultor. Percorre o fluxo (grafo de nós e arestas,
   formato em docs/fluxos.md) exatamente como central_atendimento.validar_respostas
   faz no servidor, valida cada resposta com as mesmas regras e monta o resumo.
   O banco valida de novo ao receber: esta cópia existe só para a experiência. */
(function (g) {
  "use strict";

  function semAcento(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }
  function soDigitos(s) { return String(s == null ? "" : s).replace(/\D+/g, ""); }
  function cpfValido(v) {
    var c = soDigitos(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (var t = 9; t < 11; t++) {
      var s = 0;
      for (var i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
      if (((10 * s) % 11) % 10 !== Number(c[t])) return false;
    }
    return true;
  }
  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dataBR(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return m ? m[3] + "/" + m[2] + "/" + m[1] : String(iso || "");
  }
  function vazio(v) { return v == null || v === "" || (Array.isArray(v) && !v.length); }

  /* Tipo de teclado e limpeza a partir do campo e da regex do nó. */
  function soNumeros(n) { return n.campo === "documento" || n.campo === "numero" || n.validador === "cpf" || /^\^\[0-9\]/.test(n.regex || ""); }
  function ehPlaca(n) { return n.validador === "placa" || /\[A-Za-z\]\{3\}/.test(n.regex || ""); }

  function normalizar(n, v) {
    if (v == null) return "";
    if (n.campo === "multipla") return Array.isArray(v) ? v.slice() : [];
    if (n.campo === "opcoes" || n.campo === "sim_nao" || n.campo === "data") return String(v).trim();
    var s = String(v).trim();
    if (n.campo === "numero") return s.replace(/\s+/g, "");
    if (n.campo === "documento" || (n.campo === "texto" && soNumeros(n))) return s.replace(/[\s.\-\/]+/g, "");
    if (n.campo === "texto" && ehPlaca(n)) return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return s;
  }

  /* "" quando válido; senão a mensagem (mesmas regras do servidor + validadores opcionais). */
  function validar(n, v) {
    v = normalizar(n, v);
    var nome = n.rotulo;
    if (vazio(v)) return n.obrigatorio ? "Esta resposta é obrigatória." : "";
    var txt = Array.isArray(v) ? v.join(", ") : String(v);
    switch (n.campo) {
      case "numero":
        var num = Number(txt.replace(",", "."));
        if (!isFinite(num)) return "Digite só o número.";
        if (n.min != null && num < Number(n.min)) return "O mínimo é " + n.min + ".";
        if (n.max != null && num > Number(n.max)) return "O máximo é " + n.max + ".";
        break;
      case "data":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(txt) || isNaN(new Date(txt + "T12:00:00"))) return "Informe uma data válida.";
        if (n.min_hoje && txt < hojeISO()) return "A data não pode ser anterior a hoje.";
        break;
      case "opcoes":
        if ((n.opcoes || []).indexOf(txt) < 0) return "Escolha uma das opções.";
        break;
      case "multipla":
        if (v.some(function (x) { return (n.opcoes || []).indexOf(x) < 0; })) return "Escolha opções da lista.";
        break;
      case "sim_nao":
        if (["sim", "não", "nao", "s", "n", "true", "false"].indexOf(txt.toLowerCase()) < 0) return "Responda Sim ou Não.";
        break;
      case "arquivo":
        break;
      default:
        if (txt.length > (Number(n.max_caracteres) || 2000)) return "Use no máximo " + (Number(n.max_caracteres) || 2000) + " caracteres.";
    }
    if (n.regex && /^(texto|documento|numero)$/.test(n.campo)) {
      var re; try { re = new RegExp(n.regex); } catch (e) { re = null; }
      if (re && !re.test(txt)) return n.msg_erro || ("Formato inválido em: " + nome);
    }
    if (n.validador === "cpf" && !cpfValido(txt)) return "CPF inválido. Confira os 11 números.";
    if (n.validador === "placa" && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(txt)) return "Placa inválida. Use ABC1D23 ou ABC1234.";
    return "";
  }

  /* Valor como o servidor guarda (usado nas condições das arestas). */
  function valorServidor(n, v) {
    if (n.campo === "numero") return Number(String(v).replace(",", "."));
    if (n.campo === "sim_nao") return /^(sim|s|true)$/i.test(String(v));
    return v;
  }
  function igual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function condOk(se, saida) {
    if (!se) return true;
    var v = saida[se.chave];
    if ("igual" in se) return igual(v, se.igual);
    if ("diferente" in se) return !igual(v, se.diferente);
    if ("em" in se) return (se.em || []).some(function (x) { return igual(x, v); });
    if ("preenchido" in se) return (!vazio(v)) === !!se.preenchido;
    return true;
  }
  function proximo(def, atual, saida) {
    var arestas = (def.arestas || []).filter(function (a) { return a.de === atual; });
    if (arestas.length) {
      var com = arestas.filter(function (a) { return a.se && condOk(a.se, saida); })[0];
      if (com) return com.para;
      var sem = arestas.filter(function (a) { return !a.se; })[0];
      return sem ? sem.para : null;
    }
    var nos = def.nos || [];
    for (var i = 0; i < nos.length - 1; i++) if (nos[i].id === atual) return nos[i + 1].id;
    return null;
  }

  /* Percorre o fluxo com as respostas dadas. Devolve o caminho visitado e a próxima
     pergunta sem resposta (pendente = null quando o fluxo terminou).
     Pergunta pulada fica gravada como "" em respostas. */
  function percorrer(def, respostas, simularResto) {
    var nos = {}; (def.nos || []).forEach(function (n) { nos[n.id] = n; });
    var atual = def.inicio || ((def.nos || [])[0] || {}).id;
    var saida = {}, visitados = [], pendente = null, restantes = 0, passos = 0;
    while (atual && passos++ < 200) {
      var n = nos[atual];
      if (!n || n.tipo === "fim") break;
      if (n.tipo === "pergunta") {
        if (!(n.chave in respostas)) {
          if (!pendente) pendente = n;
          if (!simularResto) { visitados.push(n); break; }
          restantes++;
        } else {
          visitados.push(n);
          var v = normalizar(n, respostas[n.chave]);
          if (!vazio(v)) saida[n.chave] = valorServidor(n, v);
        }
      } else if (!pendente) visitados.push(n);
      atual = proximo(def, atual, saida);
    }
    return { pendente: pendente, visitados: visitados, saida: saida, restantes: restantes };
  }
  function progresso(def, respostas) {
    var r = percorrer(def, respostas, true);
    var feitas = r.visitados.filter(function (n) { return n.tipo === "pergunta" && n.chave in respostas; }).length;
    return { atual: feitas + (r.pendente ? 1 : 0), total: feitas + r.restantes };
  }
  function exibir(n, v) {
    if (vazio(v)) return "Não informado";
    if (n.campo === "data") return dataBR(v);
    if (n.campo === "multipla") return v.join(", ");
    if (n.campo === "sim_nao") return /^(sim|s|true)$/i.test(String(v)) ? "Sim" : "Não";
    return String(v);
  }
  /* Respostas do caminho percorrido, prontas para ca_enviar_respostas. */
  function paraEnviar(def, respostas) {
    var r = percorrer(def, respostas, false), out = {};
    r.visitados.forEach(function (n) {
      if (n.tipo !== "pergunta" || !(n.chave in respostas)) return;
      var v = normalizar(n, respostas[n.chave]);
      if (!vazio(v)) out[n.chave] = v;
    });
    return out;
  }
  function resumo(def, respostas) {
    return percorrer(def, respostas, false).visitados
      .filter(function (n) { return n.tipo === "pergunta" && n.chave in respostas; })
      .map(function (n) { return { chave: n.chave, rotulo: n.rotulo_resumo || n.rotulo, valor: exibir(n, normalizar(n, respostas[n.chave])) }; });
  }
  /* Validação completa (mesma ordem do servidor): primeira mensagem de erro ou "". */
  function validarTudo(def, respostas) {
    var r = percorrer(def, respostas, false);
    if (r.pendente) return "Responda: " + r.pendente.rotulo;
    for (var i = 0; i < r.visitados.length; i++) {
      var n = r.visitados[i];
      if (n.tipo !== "pergunta") continue;
      var e = validar(n, respostas[n.chave]);
      if (e) return n.rotulo + ": " + e;
    }
    return "";
  }
  /* Resumo do servidor em texto ("Rótulo: valor" por linha) para cartão. */
  function resumoDeTexto(t) {
    return String(t || "").split("\n").filter(Boolean).map(function (l) {
      var i = l.indexOf(": ");
      return i > 0 ? { rotulo: l.slice(0, i), valor: l.slice(i + 2) } : { rotulo: "", valor: l };
    });
  }

  function horaCurta(iso) {
    var d = new Date(iso);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function quandoLista(iso) {
    var d = new Date(iso), h = new Date();
    if (d.toDateString() === h.toDateString()) return horaCurta(iso);
    var ontem = new Date(h); ontem.setDate(h.getDate() - 1);
    if (d.toDateString() === ontem.toDateString()) return "Ontem";
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }
  function rotuloDia(iso) {
    var d = new Date(iso), h = new Date();
    if (d.toDateString() === h.toDateString()) return "Hoje";
    var ontem = new Date(h); ontem.setDate(h.getDate() - 1);
    if (d.toDateString() === ontem.toDateString()) return "Ontem";
    return quandoLista(iso);
  }
  function duracao(min) {
    min = Math.max(0, Math.round(min));
    if (min < 1) return "menos de 1 min";
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60), m = min % 60;
    return h + " h" + (m ? " " + m + " min" : "");
  }
  function buscarAssuntos(menu, termo) {
    var t = semAcento(termo);
    if (!t) return [];
    var partes = t.split(/\s+/), out = [];
    (menu || []).forEach(function (a) {
      (a.assuntos || []).forEach(function (s) {
        var alvo = semAcento([s.nome, s.descricao, s.codigo, a.nome, a.descricao].join(" ").replace(/_/g, " "));
        if (partes.every(function (x) { return alvo.indexOf(x) >= 0; })) out.push({ area: a, assunto: s });
      });
    });
    return out;
  }

  var STATUS = {
    bot: { rotulo: "Rascunho", cls: "st-canc" },
    na_fila: { rotulo: "Na fila", cls: "st-fila" },
    em_atendimento: { rotulo: "Em atendimento", cls: "st-atend" },
    aguardando_solicitante: { rotulo: "Aguardando você", cls: "st-voce" },
    encerrado: { rotulo: "Encerrado", cls: "st-enc" },
    desistiu: { rotulo: "Cancelado", cls: "st-canc" }
  };
  var RESULTADOS = {
    resolvido: "Resolvido", resolvido_parcial: "Resolvido em parte", nao_resolvido: "Não resolvido",
    encaminhado_outra_area: "Encaminhado a outra área", sem_retorno_solicitante: "Sem retorno do consultor",
    duplicado: "Pedido duplicado", fora_do_escopo: "Fora do escopo da área"
  };
  function aberto(st) { return st === "na_fila" || st === "em_atendimento" || st === "aguardando_solicitante"; }

  var M = {
    semAcento: semAcento, soDigitos: soDigitos, cpfValido: cpfValido, hojeISO: hojeISO, dataBR: dataBR, vazio: vazio,
    soNumeros: soNumeros, ehPlaca: ehPlaca, normalizar: normalizar, validar: validar, condOk: condOk, percorrer: percorrer,
    progresso: progresso, exibir: exibir, paraEnviar: paraEnviar, resumo: resumo, validarTudo: validarTudo,
    resumoDeTexto: resumoDeTexto, horaCurta: horaCurta, quandoLista: quandoLista, rotuloDia: rotuloDia, duracao: duracao,
    buscarAssuntos: buscarAssuntos, STATUS: STATUS, RESULTADOS: RESULTADOS, aberto: aberto
  };
  if (typeof module !== "undefined" && module.exports) module.exports = M; else g.Motor = M;
})(typeof window !== "undefined" ? window : globalThis);
