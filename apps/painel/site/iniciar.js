/* Partida: tema, retorno do login Microsoft, sessão, contexto do console e navegação. */
(function(){
"use strict";
var A=window.A,$=A.$,$$=A.$$,esc=A.esc;
A.iniciaTema();

A.mostraPresenca=function(){var p=A.eu&&A.eu.presenca||"offline";$("#stSel").value=p;$("#stDot").className="dot "+p;};
A.recarregarContexto=async function(){A.cad=await A.rpc("ca_console_contexto",{});};

function telaLogin(msg){
  $("#telaLogin").hidden=false;$("#app").hidden=true;
  $("#btMs").addEventListener("click",function(){A.entrarMicrosoft();});
  if(msg){$("#lgErro").hidden=false;$("#lgErro").textContent=msg;}
  if(window.MOCK){var p=$("#lgPrevia");p.hidden=false;
    p.innerHTML='<div class="aviso" style="margin-top:8px"><b>Prévia com dados simulados.</b> Nada aqui é real nem grava no banco. Entrar como: '+
      Object.keys(window.MOCK.perfis).map(function(k){return '<a href="?perfil='+k+'">'+esc(k)+'</a>';}).join(" · ")+'</div>';}
}
function semAcesso(s){
  $("#telaLogin").hidden=false;$("#app").hidden=true;
  $(".loginCorpo").innerHTML='<p><b>'+esc(s.nome||s.email)+'</b>, seu e-mail <b>'+esc(s.email)+'</b> ainda não está cadastrado como atendente.</p>'+
    '<p class="ajuda">Peça à administração da Central para incluir você em Cadastros › Atendentes. Se você é consultor, use o app do consultor no celular.</p><button class="bt" id="btSair2">Sair</button>';
  $("#btSair2").addEventListener("click",A.sair);
}

async function iniciar(){
  var erroLogin=A.lerRetornoLogin();
  if(!A.temSessao()){telaLogin(erroLogin);return;}
  var s;
  try{s=await A.rpc("ca_sessao",{});}catch(e){telaLogin(A.traduz(e));return;}
  if(!s.atendente){semAcesso(s);return;}
  A.eu={email:s.email,nome:s.atendente.nome,papel:s.atendente.papel,atendente_id:s.atendente.id,presenca:s.atendente.presenca,area_id:s.atendente.area_id,
    filas:(s.atendente.filas||[]).map(function(f){return f.id;})};
  try{await A.recarregarContexto();}catch(e){telaLogin(A.traduz(e));return;}
  $("#telaLogin").hidden=true;$("#app").hidden=false;
  var papel={atendente:"Atendente",supervisor:"Supervisor",admin:"Administrador"}[A.eu.papel];
  $("#ctxUser").textContent=A.eu.nome+" · "+A.eu.email+" · "+papel+(window.MOCK?" · PRÉVIA COM DADOS SIMULADOS":"");
  $$("#abas [data-papel]").forEach(function(b){b.hidden=!A.pode(b.getAttribute("data-papel"));});
  $("#abas").addEventListener("click",function(e){var b=e.target.closest("[data-aba]");if(b)A.irPara(b.getAttribute("data-aba"));});
  $("#btSair").addEventListener("click",A.sair);
  A.mostraPresenca();
  $("#stSel").addEventListener("change",async function(e){var v=e.target.value;
    try{var r=await A.acao("ca_presenca",{p_presenca:v},{online:"Você está disponível. Chamados das suas filas podem chegar direto para você.",pausa:"Em pausa: nada novo chega para você.",offline:"Offline."}[v]);
      A.eu.presenca=r.atendente?r.atendente.presenca:v;}catch(er){}
    A.mostraPresenca();if(A.modulos.console.recarregar)A.modulos.console.recarregar();});
  A.setTop();if(window.ResizeObserver)new ResizeObserver(A.setTop).observe($("#hdr"));window.addEventListener("resize",A.setTop);
  var h=(location.hash||"").slice(1).split("/");
  A.irPara(h[0]||"console",h[1]?decodeURIComponent(h[1]):null);
  /* contexto (presença dos colegas, cadastros) atualiza a cada minuto */
  setInterval(function(){if(!document.hidden)A.recarregarContexto().catch(function(){});},60000);
}
iniciar();
})();
