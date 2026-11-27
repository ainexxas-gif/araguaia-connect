/* Núcleo: utilidades, sessão, rede (rpc), tema, abas, toast, modal.
   Toda regra de acesso mora no banco; aqui a tela só obedece ao que o servidor devolve. */
(function(){
"use strict";
var CFG=window.CFG||{};
var A=window.A={cfg:CFG,eu:null,cad:null,abaAtual:null};

/* ---------- utilidades ---------- */
A.$=function(s,r){return (r||document).querySelector(s);};
A.$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
A.esc=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};
A.norm=function(s){return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();};
A.num=function(n,d){if(n==null||isNaN(n))return "—";return Number(n).toLocaleString("pt-BR",{minimumFractionDigits:d||0,maximumFractionDigits:d||0});};
A.pct=function(n,d){if(n==null||isNaN(n))return "—";return A.num(n*100,d==null?0:d)+"%";};
var TZ="America/Sao_Paulo";
A.data=function(iso){if(!iso)return "—";return new Date(iso).toLocaleDateString("pt-BR",{timeZone:TZ});};
A.hora=function(iso){if(!iso)return "—";return new Date(iso).toLocaleTimeString("pt-BR",{timeZone:TZ,hour:"2-digit",minute:"2-digit"});};
A.dataHora=function(iso){if(!iso)return "—";return A.data(iso)+" "+A.hora(iso);};
A.ehHoje=function(iso){return iso&&A.data(iso)===A.data(new Date().toISOString());};
A.quando=function(iso){return A.ehHoje(iso)?A.hora(iso):A.data(iso).slice(0,5)+" "+A.hora(iso);};
/* duração em minutos → "4 min", "1 h 12 min", "2 d 3 h" */
A.dur=function(min){if(min==null||isNaN(min))return "—";min=Math.max(0,Math.round(min));
  if(min<60)return min+" min";var h=Math.floor(min/60),m=min%60;
  if(h<24)return h+" h"+(m?" "+m+" min":"");var d=Math.floor(h/24);return d+" d "+(h%24)+" h";};
A.minEntre=function(a,b){if(!a)return null;return ((b?new Date(b):new Date())-new Date(a))/60000;};
A.uid=function(){return Math.random().toString(36).slice(2,10);};
A.ls={get:function(k){try{return localStorage.getItem(k);}catch(e){return null;}},
      set:function(k,v){try{localStorage.setItem(k,v);}catch(e){}},
      del:function(k){try{localStorage.removeItem(k);}catch(e){}}};

/* ---------- toast ---------- */
A.toast=function(txt,tipo){var d=document.createElement("div");d.className=tipo||"";d.textContent=txt;
  A.$("#toast").appendChild(d);setTimeout(function(){d.remove();},tipo==="erro"?6000:3200);};

/* ---------- mensagens de erro traduzidas ---------- */
function traduz(e){
  var c=e&&e.code,m=(e&&(e.message||e.msg))||"";
  if(c==="42501")return "Você não tem permissão para esta ação.";
  if(c==="23505")return "Já existe um registro com esses dados.";
  if(c==="23514")return "Valor fora do permitido. Confira os campos.";
  if(c==="23503")return "Este registro está em uso e não pode ser removido.";
  if(c==="28000"||c==="PGRST301"||/JWT/i.test(m))return "Sua sessão expirou. Entre de novo.";
  if(c==="PGRST202")return "A plataforma foi atualizada. Recarregue a página (F5) para continuar.";
  if(c==="P0001"&&m)return m; /* erro de regra escrito pelo banco, já em português */
  if(e instanceof TypeError)return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  return m||"Algo deu errado. Tente de novo em instantes.";
}
A.traduz=traduz;

/* ---------- sessão (Supabase Auth, login Microsoft @araguaia.com.br) ---------- */
var SK="cai.sessao";
function lerSessao(){try{return JSON.parse(A.ls.get(SK)||"null");}catch(e){return null;}}
function gravarSessao(s){if(s)A.ls.set(SK,JSON.stringify(s));else A.ls.del(SK);}
var renovando=null;
async function authReq(path,body){
  var r=await fetch(CFG.supabaseUrl+"/auth/v1/"+path,{method:"POST",headers:{"apikey":CFG.chave,"Content-Type":"application/json"},body:JSON.stringify(body)});
  var j=await r.json().catch(function(){return {};});
  if(!r.ok){var e=new Error(j.error_description||j.msg||"Falha no login");e.code=j.error_code||j.error;throw e;}
  return j;
}
async function renovar(){
  if(renovando)return renovando;
  var s=lerSessao();if(!s||!s.refresh_token)throw Object.assign(new Error("sessão"),{code:"28000"});
  renovando=authReq("token?grant_type=refresh_token",{refresh_token:s.refresh_token}).then(function(j){
    gravarSessao({access_token:j.access_token,refresh_token:j.refresh_token,expira:Date.now()+j.expires_in*1000});
  }).finally(function(){renovando=null;});
  return renovando;
}
/* SSO Microsoft (Azure) pelo Supabase Auth: o token volta no #hash e é retirado da URL na hora. */
A.lerRetornoLogin=function(){
  var h=location.hash||"";if(h.indexOf("access_token=")<0&&h.indexOf("error=")<0)return null;
  var q=new URLSearchParams(h.slice(1));history.replaceState(null,"",location.pathname+location.search);
  if(q.get("error"))return q.get("error_description")||"Não foi possível entrar com a conta Microsoft.";
  gravarSessao({access_token:q.get("access_token"),refresh_token:q.get("refresh_token"),expira:Date.now()+(+q.get("expires_in")||3600)*1000});
  return null;
};
A.entrarMicrosoft=function(){
  if(window.MOCK){window.MOCK.entrarMicrosoft().then(function(){location.reload();});return;}
  var volta=location.origin+location.pathname;
  location.href=CFG.supabaseUrl+"/auth/v1/authorize?provider=azure&scopes=email&redirect_to="+encodeURIComponent(volta);
};
A.sair=function(){
  var s=lerSessao();gravarSessao(null);if(window.MOCK)window.MOCK.sair();
  if(s&&!window.MOCK)fetch(CFG.supabaseUrl+"/auth/v1/logout",{method:"POST",headers:{"apikey":CFG.chave,"Authorization":"Bearer "+s.access_token}}).catch(function(){});
  history.replaceState(null,"",location.pathname+location.search);location.reload();
};
A.temSessao=function(){return window.MOCK?window.MOCK.logado():!!lerSessao();};

/* ---------- rede: uma função para tudo ---------- */
A.rpc=async function(nome,args,tentou){
  if(window.MOCK)return window.MOCK.rpc(nome,args||{}).catch(function(e){if(e.code==="28000")A.sessaoExpirada();throw e;});
  var s=lerSessao();
  if(s&&s.expira&&s.expira-Date.now()<60000){try{await renovar();s=lerSessao();}catch(e){}}
  var r=await fetch(CFG.supabaseUrl+"/rest/v1/rpc/"+nome,{method:"POST",
    headers:{"apikey":CFG.chave,"Authorization":"Bearer "+(s?s.access_token:CFG.chave),"Content-Type":"application/json"},
    body:JSON.stringify(args||{})});
  if(r.status===401&&!tentou){try{await renovar();return A.rpc(nome,args,true);}catch(e){A.sessaoExpirada();throw e;}}
  var t=await r.text();var j=t?JSON.parse(t):null;
  if(!r.ok){var e=new Error((j&&j.message)||"Erro");e.code=j&&j.code;throw e;}
  return j;
};
A.sessaoExpirada=function(){gravarSessao(null);A.toast("Sua sessão expirou. Entre de novo.","erro");setTimeout(function(){location.reload();},1500);};
/* chamada com feedback: trava a tela, mostra erro traduzido */
A.acao=async function(nome,args,okMsg){
  document.body.classList.add("ocupado");
  try{var r=await A.rpc(nome,args);if(okMsg)A.toast(okMsg,"ok");return r;}
  catch(e){A.toast(traduz(e),"erro");throw e;}
  finally{document.body.classList.remove("ocupado");}
};

/* ---------- tema: claro por padrão, escuro só por botão ---------- */
function aplicaTema(t){document.documentElement.setAttribute("data-theme",t);
  var b=A.$("#btTema");if(b)b.textContent=t==="dark"?"Tema claro":"Tema escuro";}
A.iniciaTema=function(){aplicaTema(A.ls.get("cai.tema")==="dark"?"dark":"light");
  A.$("#btTema").addEventListener("click",function(){var t=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";A.ls.set("cai.tema",t);aplicaTema(t);});};

/* ---------- altura do cabeçalho (barra de filtros e console usam) ---------- */
A.setTop=function(){var h=A.$("#hdr");if(h)document.documentElement.style.setProperty("--htop",h.offsetHeight+"px");};

/* ---------- papéis ---------- */
var NIVEL={atendente:1,supervisor:2,admin:3};
/* rótulos únicos usados em todas as telas */
A.RESULTADOS=[["resolvido","Resolvido",1],["resolvido_parcial","Resolvido em parte",1],["nao_resolvido","Não resolvido",0],["encaminhado_outra_area","Encaminhado a outra área",0],
  ["sem_retorno_solicitante","Sem retorno do consultor",0],["duplicado","Duplicado",0],["fora_do_escopo","Fora do escopo",0]];
A.nomeResultado=function(id){if(id==="desistiu")return "Desistência";var r=A.RESULTADOS.find(function(x){return x[0]===id;});return r?r[1]:(id||"—");};
A.STATUS={bot:"No fluxo",na_fila:"Na fila",em_atendimento:"Em atendimento",aguardando_solicitante:"Aguardando consultor",encerrado:"Encerrado",desistiu:"Desistiu"};
A.PRESENCA={online:"Disponível",pausa:"Em pausa",offline:"Offline"};
A.pode=function(papel){return A.eu&&NIVEL[A.eu.papel]>=NIVEL[papel];};

/* ---------- abas (F5 mantém a aba pelo hash) ---------- */
A.modulos={};
A.irPara=function(aba,sub){
  if(!A.modulos[aba])aba="console";
  var b=A.$('#abas [data-aba="'+aba+'"]');if(b&&b.hidden)aba="console";
  var mudou=A.abaAtual!==aba;A.abaAtual=aba;
  A.$$("#abas [data-aba]").forEach(function(x){x.classList.toggle("ativa",x.getAttribute("data-aba")===aba);});
  A.$$("main>.pane").forEach(function(p){p.hidden=p.id!=="pane-"+aba;});
  var h="#"+aba+(sub?"/"+sub:"");if(location.hash!==h)history.replaceState(null,"",h);
  A.modulos[aba].mostrar(sub);
  if(mudou)window.scrollTo(0,0);
  var ab=A.$('#abas [data-aba="'+aba+'"]');if(ab&&ab.scrollIntoView)ab.scrollIntoView({block:"nearest",inline:"nearest"});
};
A.subHash=function(sub){history.replaceState(null,"","#"+A.abaAtual+(sub?"/"+sub:""));};

/* ---------- modal ---------- */
A.modal=function(o){
  var raiz=A.$("#modalRaiz");
  var f=document.createElement("div");f.className="modalFundo";
  f.innerHTML='<div class="modal'+(o.larga?" larga":"")+'" role="dialog" aria-modal="true"><div class="mh"><h3>'+A.esc(o.titulo)+'</h3><button class="bt sm" data-x>Fechar</button></div><div class="mb">'+o.corpo+'</div><div class="mf">'+(o.rodape||"")+'</div></div>';
  raiz.appendChild(f);
  function fechar(){f.remove();document.removeEventListener("keydown",esc);if(o.aoFechar)o.aoFechar();}
  function esc(e){if(e.key==="Escape")fechar();}
  document.addEventListener("keydown",esc);
  f.addEventListener("click",function(e){if(e.target===f||e.target.hasAttribute("data-x"))fechar();});
  var prim=f.querySelector("input:not([type=hidden]),select,textarea");if(prim)setTimeout(function(){prim.focus({preventScroll:true});},30);
  /* Enter em qualquer campo dispara a ação principal (exceto textarea) */
  f.addEventListener("keydown",function(e){
    if(e.key==="Enter"&&!e.shiftKey&&e.target.tagName!=="TEXTAREA"&&e.target.tagName!=="BUTTON"){var p=f.querySelector(".mf .bt.pri,.mf .bt.ok");if(p){e.preventDefault();p.click();}}
    if(e.key==="Enter"&&e.ctrlKey&&e.target.tagName==="TEXTAREA"){var p2=f.querySelector(".mf .bt.pri,.mf .bt.ok");if(p2){e.preventDefault();p2.click();}}
  });
  return {el:f,fechar:fechar};
};
/* botão de dois cliques para ação destrutiva/decisão: primeiro clique arma, segundo executa */
A.doisCliques=function(bt,textoConfirma,fn){
  bt.addEventListener("click",function(){
    if(bt.classList.contains("armado")){bt.classList.remove("armado");fn();return;}
    var orig=bt.textContent;bt.classList.add("armado");bt.textContent=textoConfirma;
    setTimeout(function(){if(bt.classList.contains("armado")){bt.classList.remove("armado");bt.textContent=orig;}},4000);
  });
};
/* validação de formulário no modal: campos com data-obr; mostra erro abaixo do campo */
A.validar=function(raiz){
  var ok=true;A.$$(".fg",raiz).forEach(function(fg){fg.classList.remove("erro");var m=fg.querySelector(".msgErro");if(m)m.remove();});
  A.$$("[data-obr]",raiz).forEach(function(el){
    if(el.closest("[hidden]"))return;
    var v=el.value!=null?String(el.value).trim():"";
    if(el.getAttribute("data-obr")==="escolha")v=el.getAttribute("data-valor")||"";
    if(!v){ok=false;var fg=el.closest(".fg");if(fg){fg.classList.add("erro");var s=document.createElement("span");s.className="msgErro";s.textContent=el.getAttribute("data-msg")||"Preencha este campo.";fg.appendChild(s);}}
  });
  if(!ok){var p=raiz.querySelector(".fg.erro input,.fg.erro select,.fg.erro textarea,.fg.erro [data-obr]");if(p&&p.focus)p.focus();}
  return ok;
};

/* ---------- exportação: CSV com ; e BOM (abre direto no Excel) ---------- */
A.baixarCsv=function(nome,titulo,recorte,cab,linhas){
  function c(v){v=v==null?"":String(v);return /[;"\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
  var out=[c(A.cfg.nomeProduto||"Central de Atendimento")+" · "+c(titulo),c("Recorte: "+recorte),c("Gerado em "+A.dataHora(new Date().toISOString())),""];
  out.push(cab.map(c).join(";"));linhas.forEach(function(l){out.push(l.map(c).join(";"));});
  var b=new Blob(["﻿"+out.join("\r\n")],{type:"text/csv;charset=utf-8"});
  var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=nome+".csv";document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);
};
A.imprimir=function(el){
  document.body.classList.add("printing");el.classList.add("print-alvo");
  function limpa(){document.body.classList.remove("printing");el.classList.remove("print-alvo");}
  window.addEventListener("afterprint",limpa,{once:true});window.print();setTimeout(limpa,1500);
};
})();
