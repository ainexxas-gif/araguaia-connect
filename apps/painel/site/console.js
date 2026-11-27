/* Console do atendente sobre as funções ca_*: fila, conversa, assumir, responder, pedir informação,
   nota interna, repassar, transferir, devolver à fila, encerrar com resultado e nº do documento. */
(function(){
"use strict";
var A=window.A,$=A.$,$$=A.$$,esc=A.esc;
var S={painel:null,equipe:[],encerrados:[],filtro:"fila",busca:"",sel:null,det:null,assin:"",modo:"resposta",montado:false,timer:null,timerDet:null,timerEnc:null,relogio:null};
var EV={aberto:"Chamado aberto",entrou_fila:"Entrou na fila",atribuido:"Distribuído",assumido:"Assumido",repasse:"Repassado",transferencia:"Transferido",
  devolvido_fila:"Devolvido à fila",aguardando_solicitante:"Pediu informação ao consultor",retomado:"Consultor respondeu",encerrado:"Encerrado",
  reaberto:"Reaberto",desistencia:"Consultor desistiu",avaliado:"Avaliado",prioridade:"Prioridade alterada"};
function fila(id){return (A.cad.filas||[]).find(function(f){return f.id===id;})||{};}
function souDono(c){return c&&c.atendente&&c.atendente.id===A.eu.atendente_id;}
function podeGerir(c){return souDono(c)||A.pode("supervisor");}
function corEspera(c){var lim=fila(c.fila.id).sla_espera_min||15,m=A.minEntre(c.entrou_fila_em);return m<lim*0.7?"t-ok":m<lim?"t-at":"t-rd";}
function ativo(c){return c.status==="em_atendimento"||c.status==="aguardando_solicitante";}

var CHIPS=[
  {id:"fila",nome:"Na fila",l:function(){return S.painel?S.painel.fila:[];}},
  {id:"meus",nome:"Comigo",l:function(){return S.painel?S.painel.meus:[];}},
  {id:"equipe",nome:"Em atendimento",papel:"supervisor",l:function(){return S.equipe;}},
  {id:"encerrados",nome:"Encerrados hoje",l:function(){return S.encerrados;}}
];
function chipsVis(){return CHIPS.filter(function(c){return !c.papel||A.pode(c.papel);});}
function todos(){var m={};CHIPS.forEach(function(c){c.l().forEach(function(x){m[x.id]=x;});});return m;}
function visiveis(){
  var ch=CHIPS.find(function(c){return c.id===S.filtro;})||CHIPS[0],b=A.norm(S.busca);
  return ch.l().filter(function(c){
    if(!b)return true;
    return A.norm([c.protocolo,c.solicitante.nome,c.solicitante.matricula,c.solicitante.equipe,c.assunto.nome,c.fila.nome,c.documento_numero,c.atendente&&c.atendente.nome].join(" ")).indexOf(b)>=0;
  });
}

/* ---------- montagem ---------- */
function montar(){
  $("#pane-console").innerHTML=
  '<div class="cons" id="cons">'+
   '<section class="cl">'+
    '<div class="cl-top"><div class="chips" id="clChips"></div>'+
    '<div style="display:flex;gap:6px"><input id="clBusca" type="search" placeholder="Nome, matrícula, protocolo ou nº do documento" aria-label="Buscar chamados"><button class="bt" id="clProx" title="Assume o próximo das suas filas (prioridade e depois o mais antigo)">Pegar próximo</button></div>'+
    '<div class="filasAgora" id="clFilas"></div></div>'+
    '<div class="cl-lista" id="clLista"></div>'+
   '</section>'+
   '<section class="cv" id="cv"><div class="vazio" style="margin:auto">Escolha um chamado na lista.<br><span class="sub">Na fila, os mais antigos e os prioritários aparecem primeiro.</span></div></section>'+
   '<section class="inf" id="inf"></section>'+
  '</div>';
  $("#clBusca").addEventListener("input",function(e){S.busca=e.target.value;desenhaLista();});
  $("#clChips").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;S.filtro=b.getAttribute("data-f");desenhaLista();
    if(S.filtro==="encerrados")carregarEncerrados();});
  $("#clLista").addEventListener("click",function(e){var b=e.target.closest(".it");if(b)abrir(b.getAttribute("data-id"));});
  $("#clProx").addEventListener("click",async function(){
    var r;try{r=await A.acao("ca_proximo",{});}catch(e){return;}
    if(!r){A.toast("Não há chamados aguardando nas suas filas.");return;}
    A.toast("Chamado "+r.protocolo+" assumido.","ok");S.filtro="meus";await carregarLista();abrir(r.id);});
  $("#cv").addEventListener("click",cliqueConversa);
  $("#inf").addEventListener("click",cliqueInfo);
  $("#inf").addEventListener("change",function(e){if(e.target.id==="infPrio")prioridade(+e.target.value);});
  S.montado=true;
}

/* ---------- lista ---------- */
function desenhaLista(){
  $("#clChips").innerHTML=chipsVis().map(function(c){var n=c.l().length;
    return '<button data-f="'+c.id+'" class="'+(S.filtro===c.id?"ativa":"")+'">'+c.nome+' <span class="n">'+(c.id==="encerrados"&&!S.encLido?"…":n)+'</span></button>';}).join("");
  var nf=S.painel?S.painel.fila.length:0,b=$("#nFila");b.hidden=!nf;b.textContent=nf;
  document.title=(nf?"("+nf+") ":"")+A.cfg.nomeProduto;
  /* resumo das filas: só as que têm gente esperando */
  var fs=(S.painel?S.painel.filas:[]).filter(function(f){return f.na_fila>0;});
  $("#clFilas").innerHTML=fs.length?fs.map(function(f){var m=A.minEntre(f.mais_antigo_em),lim=fila(f.id).sla_espera_min||15,cl=m<lim*.7?"ok":m<lim?"at":"rd";
    return '<span class="tag '+cl+'" title="'+esc(f.nome)+': '+f.na_fila+' aguardando, o mais antigo há '+A.dur(m)+'; '+f.online+' online'+(f.em_expediente?"":" · fora do expediente")+'">'+esc(f.nome.replace(/^[A-Z]+ · /,""))+' · '+f.na_fila+' · '+A.dur(m)+'</span>';}).join(""):'<span class="sub">Nenhuma fila com chamado esperando.</span>';
  $("#clProx").hidden=!(A.eu.filas||[]).length;
  var el=$("#clLista"),top=el.scrollTop,v=visiveis();
  if(!v.length){el.innerHTML='<div class="vazio">'+({fila:"Ninguém aguardando nas suas filas.",meus:"Você não tem chamados em atendimento.",equipe:"Ninguém em atendimento agora.",encerrados:S.encLido?"Nenhum chamado encerrado hoje.":"Carregando…"}[S.filtro])+(S.busca?"<br>Nada encontrado para a busca.":"")+'</div>';return;}
  el.innerHTML=v.map(function(c){
    var t,cls="",tags='<span class="tag">'+esc(c.fila.nome)+'</span>';
    if(c.status==="na_fila"){t=A.dur(A.minEntre(c.entrou_fila_em));cls=corEspera(c);}
    else if(ativo(c))t=A.quando(c.ultima_msg_em||c.assumido_em);
    else t=A.hora(c.encerrado_em||c.desistencia_em);
    if(c.prioridade>0)tags='<span class="tag rd">Prioridade '+c.prioridade+'</span>'+tags;
    if(ativo(c)&&!souDono(c)&&c.atendente)tags+='<span class="tag az">'+esc(c.atendente.nome)+'</span>';
    if(c.status==="aguardando_solicitante")tags+='<span class="tag">Aguardando consultor</span>';
    else if(ativo(c)&&c.ultima_msg_autor==="solicitante")tags+='<span class="tag at">Consultor aguardando</span>';
    if(c.status==="encerrado"||c.status==="desistiu")tags+='<span class="tag '+(c.status==="desistiu"?"rd":"ok")+'">'+esc(A.nomeResultado(c.status==="desistiu"?"desistiu":c.resultado))+'</span>';
    if(c.fora_horario&&c.status==="na_fila")tags+='<span class="tag at">Fora do horário</span>';
    var ult=(c.resumo||"").split("\n")[0].replace(/([?:]): /,"$1 ");
    return '<button class="it'+(S.sel===c.id?" sel":"")+'" data-id="'+c.id+'">'+
      '<div class="l1"><span class="nome">'+esc(c.solicitante.nome)+'</span><span class="tempo '+cls+'">'+t+'</span></div>'+
      '<div class="l2">'+esc(c.assunto.nome)+' · <span class="id">'+esc(c.protocolo)+'</span></div>'+
      (ult?'<div class="l2 sub">'+esc(ult)+'</div>':"")+
      '<div class="l3">'+tags+'</div>'+(c.nao_lidas?'<span class="naoLidas">'+c.nao_lidas+'</span>':"")+'</button>';
  }).join("");
  el.scrollTop=top;
}
async function carregarLista(){
  try{
    var p=A.rpc("ca_painel_atendente",{}),q=A.pode("supervisor")?A.rpc("ca_console_lista",{p_visao:"equipe"}):Promise.resolve([]);
    S.painel=await p;S.equipe=await q;
    A.eu.presenca=S.painel.eu.presenca;A.mostraPresenca();
    desenhaLista();
    if(S.sel&&S.det){var c=todos()[S.sel];
      if(!c||c.status!==S.det.status||(c.atendente&&c.atendente.id)!==(S.det.atendente&&S.det.atendente.id)||c.ultima_msg_em!==S.det.ultima_msg_em)carregarDet();}
  }catch(e){}
}
async function carregarEncerrados(){try{S.encerrados=await A.rpc("ca_console_lista",{p_visao:"encerrados_hoje"});S.encLido=true;desenhaLista();}catch(e){}}

/* ---------- conversa ---------- */
async function abrir(id){
  S.sel=id;S.det=null;S.assin="";S.modo="resposta";A.subHash(id);
  $$("#clLista .it").forEach(function(b){b.classList.toggle("sel",b.getAttribute("data-id")===id);});
  var cons=$("#cons");cons.classList.add("verCv");cons.classList.remove("verInf");
  $("#cv").innerHTML='<div class="vazio" style="margin:auto">Carregando…</div>';$("#inf").innerHTML="";
  await carregarDet(true);
}
async function carregarDet(novo){
  if(!S.sel)return;var id=S.sel,d;
  try{d=await A.rpc("ca_chamado",{p_chamado:id});}
  catch(e){if(S.sel===id)$("#cv").innerHTML='<div class="vazio" style="margin:auto">Não foi possível abrir este chamado.<br>'+esc(A.traduz(e))+'</div>';return;}
  if(S.sel!==id)return;
  var mudou=!S.det||S.det.status!==d.status||(S.det.atendente&&S.det.atendente.id)!==(d.atendente&&d.atendente.id);
  S.det=d;
  if(novo||mudou)desenhaConversa();else atualizaMsgs();
  desenhaInfo();
  if(souDono(d)&&d.mensagens.some(function(m){return m.autor==="solicitante"&&!m.lida_em;})){
    A.rpc("ca_marcar_lidas",{p_chamado:d.id}).then(function(){var c=todos()[d.id];if(c){c.nao_lidas=0;desenhaLista();}}).catch(function(){});}
}
function itens(d){
  var it=d.mensagens.map(function(m){return {em:m.criada_em,m:m};});
  (d.eventos||[]).forEach(function(e){if(["aberto","entrou_fila"].indexOf(e.tipo)<0)it.push({em:e.criado_em,e:e});});
  return it.sort(function(a,b){return new Date(a.em)-new Date(b.em);});
}
function htmlEvento(e){
  var t=EV[e.tipo]||e.tipo,det="";
  if(e.tipo==="transferencia")det=(e.de_fila||"")+" → "+(e.para_fila||"")+(e.para_atendente?" ("+e.para_atendente+")":"");
  else if(e.tipo==="repasse")det=(e.de_atendente||"")+" → "+(e.para_atendente||"");
  else if(e.tipo==="atribuido"||e.tipo==="assumido")det=e.para_atendente||"";
  else if(e.tipo==="encerrado")det=A.nomeResultado(e.motivo);
  var mot=e.motivo&&["encerrado","aguardando_solicitante"].indexOf(e.tipo)<0?" · “"+e.motivo+"”":"";
  return '<div class="msg sis">'+A.hora(e.criado_em)+' · <b>'+esc(t)+'</b>'+(det?" · "+esc(det):"")+esc(mot)+'</div>';
}
function htmlMsg(m){
  if(m.autor==="sistema")return '<div class="msg sis">'+esc(m.conteudo)+'</div>';
  var cls=m.interna?"nota":m.autor==="atendente"?"eu":m.autor==="bot"?"bot":"";
  var quem=m.interna?"Nota interna · "+(m.atendente||""):m.autor==="bot"?"Assistente":m.autor==="atendente"?(m.atendente||"Atendente"):S.det.solicitante.nome;
  var anexo=m.anexo_path?'<div class="anexo">📎 '+esc(m.anexo_nome||"anexo")+'</div>':"";
  var chk=m.autor==="atendente"&&!m.interna?' <span class="chk'+(m.lida_em?" lida":"")+'" title="'+(m.lida_em?"Lida":"Entregue")+'">✓✓</span>':"";
  return '<div class="msg '+cls+'"><div class="au">'+esc(quem)+'</div>'+esc(m.conteudo||"")+anexo+'<div class="hr">'+A.hora(m.criada_em)+chk+'</div></div>';
}
function htmlColeta(d){
  var it=d.resumo_itens&&d.resumo_itens.length?d.resumo_itens:(d.resumo||"").split("\n").filter(Boolean).map(function(l){var i=l.indexOf(": ");return {rotulo:l.slice(0,i),valor:l.slice(i+2)};});
  if(!it.length)return "";
  return '<div class="coleta"><h4>Coletado pelo assistente · '+esc(d.assunto.nome)+'</h4><dl>'+it.map(function(c){return '<dt>'+esc(c.rotulo)+'</dt><dd>'+esc(c.valor)+'</dd>';}).join("")+'</dl></div>';
}
function desenhaConversa(){
  var d=S.det,dono=souDono(d),acoes="";
  if(d.status==="na_fila"){acoes='<button class="bt pri" data-a="assumir">Assumir</button><button class="bt" data-a="transferir">Transferir</button>';}
  else if(ativo(d)&&podeGerir(d)){acoes='<button class="bt" data-a="repassar">Repassar</button><button class="bt" data-a="transferir">Transferir</button><button class="bt" data-a="devolver">Devolver à fila</button><button class="bt ok" data-a="encerrar">Encerrar</button>';}
  var rodape;
  if(ativo(d)&&(dono||A.pode("supervisor"))){
    var rap=(A.cad.respostas_rapidas||[]).filter(function(r){return r.area_id==null||r.area_id===d.area.id;});
    rodape='<div class="cv-comp"><div class="modos" id="cvModos">'+
      '<button data-m="resposta" class="'+(S.modo==="resposta"?"sel":"")+'">Responder</button>'+
      (dono?'<button data-m="pedir" class="'+(S.modo==="pedir"?"sel":"")+'" title="Envia a pergunta e marca o chamado como aguardando o consultor">Pedir informação</button>':"")+
      '<button data-m="nota" class="'+(S.modo==="nota"?"sel":"")+'" title="Só atendentes veem">Nota interna</button></div>'+
      '<div class="rapidas">'+rap.map(function(r){return '<button data-a="rapida" data-t="'+esc(r.texto)+'" title="'+esc(r.atalho+" · "+r.texto)+'">'+esc(r.titulo)+'</button>';}).join("")+'</div>'+
      '<div class="linha"><textarea id="txMsg" rows="1" placeholder="Escreva a resposta. Digite / para respostas rápidas" enterkeyhint="send" aria-label="Mensagem"></textarea><button class="bt pri" id="btEnviar" data-a="enviar">Enviar</button></div>'+
      '<div class="ajuda" id="dicaEnter">Enter envia · Shift+Enter pula linha</div></div>';
    if(!dono)rodape=rodape.replace('<div class="cv-comp">','<div class="cv-comp"><div class="ajuda">Em atendimento com <b>'+esc(d.atendente?d.atendente.nome:"")+'</b>. Como supervisor, sua resposta aparece para o consultor com o seu nome.</div>');
  }else if(d.status==="na_fila"){
    rodape='<div class="cv-aviso">Aguardando na fila <b>'+esc(d.fila.nome)+'</b> há '+A.dur(A.minEntre(d.entrou_fila_em))+(d.posicao_fila?' · '+d.posicao_fila+'º da fila':"")+'. Assuma para responder.</div>';
  }else if(ativo(d)){
    rodape='<div class="cv-aviso">Em atendimento com <b>'+esc(d.atendente?d.atendente.nome:"")+'</b>.</div>';
  }else{
    rodape='<div class="cv-aviso">'+(d.status==="desistiu"?"O consultor desistiu antes do atendimento.":'Encerrado em '+A.dataHora(d.encerrado_em)+' · <b>'+esc(A.nomeResultado(d.resultado))+'</b>'+
      (d.documento_numero?' · '+esc(d.documento_tipo||"Documento")+' '+esc(d.documento_numero):"")+
      (d.avaliacao?' · <span class="estrelas" title="Avaliação '+d.avaliacao.nota+' de 5">'+"★".repeat(d.avaliacao.nota)+"☆".repeat(5-d.avaliacao.nota)+'</span>':' · Avaliação ainda não respondida'))+'</div>';
  }
  $("#cv").innerHTML=
    '<div class="cv-top"><button class="bt sm voltar" data-a="voltar">← Chamados</button>'+
    '<div class="quem"><b>'+esc(d.solicitante.nome)+'</b><div class="sub">'+esc(d.assunto.nome)+' · '+esc(d.area.nome)+' · <span class="id">'+esc(d.protocolo)+'</span> · '+esc(A.STATUS[d.status]||d.status)+'</div></div>'+
    '<div class="cv-acoes">'+acoes+'<button class="bt btInf" data-a="info">Detalhes</button></div></div>'+
    '<div class="cv-msgs" id="cvMsgs"></div>'+rodape;
  S.assin="";atualizaMsgs();
  var tx=$("#txMsg");
  if(tx){
    var chave="cai.rasc::"+A.eu.email+"::"+d.id,r=A.ls.get(chave);if(r)tx.value=r;
    var toque=window.matchMedia&&matchMedia("(pointer:coarse)").matches;
    if(toque)$("#dicaEnter").textContent="Toque em Enviar para mandar";
    tx.addEventListener("keydown",function(e){
      if(e.key==="Enter"&&!e.shiftKey&&!e.ctrlKey&&!toque){e.preventDefault();enviar();}
      if(e.key==="Tab"&&/^\/\S*$/.test(tx.value)){var m=atalho(tx.value);if(m){e.preventDefault();tx.value=m.texto;tx.dispatchEvent(new Event("input"));}}});
    tx.addEventListener("input",function(){A.ls.set(chave,tx.value);tx.style.height="auto";tx.style.height=Math.min(160,tx.scrollHeight)+"px";
      var m=/^\/\S*$/.test(tx.value)?atalho(tx.value):null;$("#dicaEnter").textContent=m?"Tab insere “"+m.titulo+"”":(toque?"Toque em Enviar para mandar":"Enter envia · Shift+Enter pula linha");});
    $("#cvModos").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;S.modo=b.getAttribute("data-m");
      $$("#cvModos button").forEach(function(x){x.classList.toggle("sel",x===b);});
      $("#btEnviar").textContent=S.modo==="nota"?"Salvar nota":S.modo==="pedir"?"Perguntar":"Enviar";
      tx.placeholder=S.modo==="nota"?"Nota para os colegas. O consultor não vê.":S.modo==="pedir"?"O que falta? Ex.: qual o centro de destino?":"Escreva a resposta. Digite / para respostas rápidas";
      tx.classList.toggle("modoNota",S.modo==="nota");tx.focus({preventScroll:true});});
    if(!toque)tx.focus({preventScroll:true});
  }
}
function atalho(v){return (A.cad.respostas_rapidas||[]).find(function(r){return r.atalho.indexOf(v)===0&&v.length>1;});}
function atualizaMsgs(){
  var d=S.det,el=$("#cvMsgs");if(!el)return;
  var it=itens(d),assin=it.length+"|"+d.mensagens.filter(function(m){return m.lida_em;}).length;if(assin===S.assin)return;
  var noFim=el.scrollHeight-el.scrollTop-el.clientHeight<60||!S.assin;S.assin=assin;
  var ult="",h=htmlColeta(d);
  it.forEach(function(x){var dia=A.data(x.em);if(dia!==ult){ult=dia;h+='<div class="msg sis dia"><b>'+(A.ehHoje(x.em)?"Hoje":dia)+'</b></div>';}h+=x.e?htmlEvento(x.e):htmlMsg(x.m);});
  el.innerHTML=h;if(noFim)el.scrollTop=el.scrollHeight;
}
function cliqueConversa(e){
  var b=e.target.closest("[data-a]");if(!b)return;var a=b.getAttribute("data-a");
  if(a==="voltar"){$("#cons").classList.remove("verCv","verInf");S.sel=null;S.det=null;A.subHash("");desenhaLista();}
  else if(a==="info")$("#cons").classList.toggle("verInf");
  else if(a==="assumir")assumir();else if(a==="repassar")repassar();else if(a==="transferir")transferir();
  else if(a==="devolver")devolver();else if(a==="encerrar")encerrar();else if(a==="enviar")enviar();
  else if(a==="rapida"){var tx=$("#txMsg"),t=b.getAttribute("data-t");if(!tx)return;tx.value=tx.value?tx.value+" "+t:t;tx.dispatchEvent(new Event("input"));tx.focus({preventScroll:true});}
}

/* ---------- informações ---------- */
function desenhaInfo(){
  var d=S.det,s=d.solicitante;
  var esp=d.espera_seg!=null?d.espera_seg/60:(d.status==="na_fila"?A.minEntre(d.entrou_fila_em):null);
  var at=d.atendimento_seg!=null?d.atendimento_seg/60:(d.assumido_em&&ativo(d)?A.minEntre(d.assumido_em):null);
  var f=fila(d.fila.id);
  $("#inf").innerHTML=
    '<button class="bt sm voltar" data-a="vcv">← Conversa</button>'+
    '<div><h4>Consultor</h4><dl><dt>Nome</dt><dd>'+esc(s.nome)+'</dd><dt>Matrícula</dt><dd>'+esc(s.matricula)+'</dd><dt>Equipe</dt><dd>'+esc(s.equipe||"Não informada")+'</dd></dl></div>'+
    '<div><h4>Tempos deste chamado</h4><div class="tempos"><div><span>Espera na fila</span><b>'+A.dur(esp)+'</b></div><div><span>Atendimento</span><b>'+A.dur(at)+'</b></div></div>'+
      '<div class="ajuda" style="margin-top:6px">Metas da fila: espera '+A.dur(f.sla_espera_min)+' · atendimento '+A.dur(f.sla_atendimento_min)+(d.fora_horario?' · chegou fora do horário':"")+'</div></div>'+
    (A.pode("supervisor")&&d.status!=="encerrado"&&d.status!=="desistiu"?'<div class="fg"><label for="infPrio">Prioridade</label><select id="infPrio">'+[0,1,2,3,5,9].map(function(p){return '<option value="'+p+'"'+(p===d.prioridade?" selected":"")+'>'+(p===0?"Normal":p===9?"9 · Urgente":p)+'</option>';}).join("")+'</select><span class="ajuda">Prioridade maior passa na frente na fila.</span></div>':"")+
    '<div><h4>Linha do tempo</h4><ul class="linhaTempo">'+(d.eventos||[]).map(function(e){return '<li>'+A.quando(e.criado_em)+' · '+esc(EV[e.tipo]||e.tipo)+(e.para_atendente?" · "+esc(e.para_atendente):"")+(e.motivo&&e.tipo!=="encerrado"?'<br><span class="sub">'+esc(e.motivo)+'</span>':"")+'</li>';}).join("")+'</ul></div>'+
    '<div><h4>Chamados anteriores ('+(d.historico_solicitante||[]).length+')</h4><div class="hist">'+((d.historico_solicitante||[]).length?d.historico_solicitante.map(function(h){
      return '<button data-a="hist" data-id="'+h.id+'"><b>'+esc(h.assunto)+'</b> · '+A.data(h.criado_em)+'<br><span class="sub">'+esc(h.status==="encerrado"?A.nomeResultado(h.resultado):A.STATUS[h.status]||h.status)+(h.documento_numero?" · "+esc(h.documento_numero):"")+'</span></button>';}).join(""):'<span class="sub">Primeiro chamado deste consultor.</span>')+'</div></div>';
}
function cliqueInfo(e){var b=e.target.closest("[data-a]");if(!b)return;
  if(b.getAttribute("data-a")==="vcv")$("#cons").classList.remove("verInf");
  if(b.getAttribute("data-a")==="hist")abrir(b.getAttribute("data-id"));}

/* ---------- ações ---------- */
async function depoisDeAgir(fechar){await carregarLista();if(fechar){S.sel=null;S.det=null;$("#cv").innerHTML='<div class="vazio" style="margin:auto">'+fechar+'</div>';$("#inf").innerHTML="";$("#cons").classList.remove("verCv","verInf");A.subHash("");}else await carregarDet(true);}
async function assumir(){try{await A.acao("ca_assumir",{p_chamado:S.sel},"Chamado assumido. Ele está com você.");}catch(e){carregarLista();return;}S.filtro="meus";depoisDeAgir();}
async function enviar(){
  var tx=$("#txMsg"),t=tx.value.trim();if(!t)return;var d=S.det,modo=S.modo;
  tx.value="";tx.style.height="auto";A.ls.del("cai.rasc::"+A.eu.email+"::"+d.id);
  d.mensagens.push({id:0,autor:"atendente",atendente:A.eu.nome,conteudo:t,interna:modo==="nota",criada_em:new Date().toISOString()});atualizaMsgs();
  try{
    if(modo==="pedir"){await A.rpc("ca_aguardar_solicitante",{p_chamado:d.id,p_mensagem:t});S.modo="resposta";}
    else await A.rpc("ca_enviar_mensagem",{p_chamado:d.id,p_conteudo:t,p_interna:modo==="nota"});
  }catch(e){A.toast(A.traduz(e),"erro");tx.value=t;}
  await carregarLista();carregarDet(modo==="pedir");
}
function repassar(){
  var d=S.det;
  var cand=(A.cad.atendentes||[]).filter(function(a){return a.id!==(d.atendente&&d.atendente.id)&&(a.filas||[]).indexOf(d.fila.id)>=0;});
  var m=A.modal({titulo:"Repassar para outro atendente da fila",corpo:
    '<p class="sub">Continua na fila <b>'+esc(d.fila.nome)+'</b> e vai direto para quem você escolher, com toda a conversa.</p>'+
    (cand.length?'<div class="fg"><label>Para quem</label><div class="escolhas col" id="esAt" data-obr="escolha" data-msg="Escolha o atendente.">'+cand.map(function(a){
      return '<button type="button" data-v="'+a.id+'"><span class="dot '+a.presenca+'"></span> '+esc(a.nome)+'<span class="sub"> · '+esc(A.PRESENCA[a.presenca])+' · '+a.em_atendimento+' em atendimento</span></button>';}).join("")+'</div><span class="obr">Obrigatório</span></div>'
      :'<div class="aviso">Não há outro atendente nesta fila. Use Transferir para mandar a outra fila.</div>')+
    '<div class="fg"><label for="mRep">Motivo do repasse</label><textarea id="mRep" data-obr data-msg="Escreva o motivo: ele fica na linha do tempo." placeholder="Ex.: vou sair para reunião; falta só confirmar o centro"></textarea><span class="obr">Obrigatório</span></div>',
    rodape:'<button class="bt" data-x>Cancelar</button>'+(cand.length?'<button class="bt pri" id="okRep">Repassar</button>':"")});
  A.escolhas($("#esAt",m.el));
  var ok=$("#okRep",m.el);if(ok)ok.addEventListener("click",async function(){
    if(!A.validar(m.el))return;
    try{await A.acao("ca_transferir",{p_chamado:d.id,p_atendente:$("#esAt",m.el).getAttribute("data-valor"),p_motivo:$("#mRep",m.el).value.trim()},"Chamado repassado.");}catch(e){return;}
    m.fechar();depoisDeAgir(A.pode("supervisor")?null:"Chamado repassado.");});
}
function transferir(){
  var d=S.det;
  var opts=(A.cad.areas||[]).filter(function(a){return a.ativa!==false;}).map(function(a){
    var fs=(A.cad.filas||[]).filter(function(f){return f.area_id===a.id&&f.ativa!==false&&f.id!==d.fila.id;});
    return fs.length?'<optgroup label="'+esc(a.nome)+'">'+fs.map(function(f){return '<option value="'+f.id+'">'+esc(f.nome)+'</option>';}).join("")+'</optgroup>':"";}).join("");
  var m=A.modal({titulo:"Transferir para outra fila",corpo:
    '<p class="sub">Sai de <b>'+esc(d.fila.nome)+'</b> e entra na fila de destino com toda a conversa e a coleta. O consultor recebe um aviso.</p>'+
    '<div class="fg"><label for="mFila">Fila de destino</label><select id="mFila" data-obr data-msg="Escolha a fila de destino."><option value="">Escolha…</option>'+opts+'</select><span class="obr">Obrigatório</span></div>'+
    '<div class="fg"><label for="mPara">Entregar direto para</label><select id="mPara"><option value="">Quem estiver livre na fila</option></select></div>'+
    '<div class="fg"><label for="mMot">Motivo da transferência</label><textarea id="mMot" data-obr data-msg="Escreva o motivo: ele aparece para a próxima fila e entra nos indicadores." placeholder="Ex.: o pedido é de troca de centro, não de OV"></textarea><span class="obr">Obrigatório</span></div>',
    rodape:'<button class="bt" data-x>Cancelar</button><button class="bt pri" id="okTr">Transferir</button>'});
  $("#mFila",m.el).addEventListener("change",function(e){var fid=+e.target.value;
    $("#mPara",m.el).innerHTML='<option value="">Quem estiver livre na fila</option>'+(A.cad.atendentes||[]).filter(function(a){return (a.filas||[]).indexOf(fid)>=0;}).map(function(a){return '<option value="'+a.id+'">'+esc(a.nome)+' · '+esc(A.PRESENCA[a.presenca])+'</option>';}).join("");});
  $("#okTr",m.el).addEventListener("click",async function(){
    if(!A.validar(m.el))return;
    try{await A.acao("ca_transferir",{p_chamado:d.id,p_fila:+$("#mFila",m.el).value,p_atendente:$("#mPara",m.el).value||null,p_motivo:$("#mMot",m.el).value.trim()},"Chamado transferido.");}catch(e){return;}
    m.fechar();depoisDeAgir("Chamado transferido.");});
}
function devolver(){
  var d=S.det;
  var m=A.modal({titulo:"Devolver à fila",corpo:'<p class="sub">O chamado volta para <b>'+esc(d.fila.nome)+'</b> e pode ser pego por outro atendente.</p>'+
    '<div class="fg"><label for="mDev">Motivo</label><textarea id="mDev" data-obr data-msg="Escreva o motivo." placeholder="Ex.: preciso sair; não é comigo"></textarea><span class="obr">Obrigatório</span></div>',
    rodape:'<button class="bt" data-x>Cancelar</button><button class="bt pri" id="okDev">Devolver</button>'});
  $("#okDev",m.el).addEventListener("click",async function(){if(!A.validar(m.el))return;
    try{await A.acao("ca_devolver_fila",{p_chamado:d.id,p_motivo:$("#mDev",m.el).value.trim()},"Chamado devolvido à fila.");}catch(e){return;}
    m.fechar();depoisDeAgir("Chamado devolvido à fila.");});
}
/* nº do documento: tenta achar nas respostas do fluxo para já vir preenchido */
function docSugerido(d){var r=d.respostas||{},k=Object.keys(r).find(function(k){return /^numero_(ov|rc|pedido)$|^documento$/.test(k);});return k?String(r[k]):"";}
var OBS_OBRIG=["nao_resolvido","encaminhado_outra_area","fora_do_escopo"];
function encerrar(){
  var d=S.det,tipo=d.assunto.documento_tipo,rot=tipo?"Nº da "+(tipo==="PEDIDO"?"pedido":tipo==="REMESSA"?"remessa":tipo):"Nº do documento";
  var m=A.modal({titulo:"Encerrar "+d.protocolo,corpo:
    '<div class="fg"><label>Resultado</label><div class="escolhas" id="esRes" data-obr="escolha" data-msg="Escolha o resultado.">'+A.RESULTADOS.map(function(r){return '<button type="button" data-v="'+r[0]+'">'+esc(r[1])+'</button>';}).join("")+'</div><span class="obr">Obrigatório</span></div>'+
    '<div class="fg"><label for="mDoc">'+esc(rot)+'</label><input id="mDoc" inputmode="numeric" autocomplete="off" value="'+esc(d.documento_numero||docSugerido(d))+'" placeholder="Ex.: 4500123456"><span class="obr" id="obrDoc"></span></div>'+
    '<div class="fg"><label for="mObs">Observação do encerramento</label><textarea id="mObs" placeholder="O que foi feito, ou por que não foi possível"></textarea><span class="obr" id="obrObs"></span></div>'+
    '<p class="ajuda">Ao encerrar, o consultor recebe no app a avaliação de 1 a 5.</p>',
    rodape:'<button class="bt" data-x>Cancelar</button><button class="bt ok" id="okEnc">Encerrar</button>'});
  var es=$("#esRes",m.el);
  function regra(){var r=es.getAttribute("data-valor")||"";
    var exige=d.assunto.documento_obrigatorio&&(r==="resolvido"||r==="resolvido_parcial");
    var doc=$("#mDoc",m.el);if(exige)doc.setAttribute("data-obr","");else doc.removeAttribute("data-obr");
    doc.setAttribute("data-msg","Informe o "+rot.charAt(0).toLowerCase()+rot.slice(1)+": ele rastreia o pedido e mede retrabalho.");$("#obrDoc",m.el).textContent=exige?"Obrigatório":"";
    var o=$("#mObs",m.el),eo=OBS_OBRIG.indexOf(r)>=0;if(eo)o.setAttribute("data-obr","");else o.removeAttribute("data-obr");
    o.setAttribute("data-msg","Explique em uma frase: ajuda a área a entender o que não deu certo.");$("#obrObs",m.el).textContent=eo?"Obrigatório":"";}
  A.escolhas(es,regra);regra();
  $("#okEnc",m.el).addEventListener("click",async function(){
    if(!A.validar(m.el))return;var doc=$("#mDoc",m.el).value.trim();
    try{await A.acao("ca_encerrar",{p_chamado:d.id,p_resultado:es.getAttribute("data-valor"),p_documento_tipo:doc?tipo:null,p_documento_numero:doc||null,p_obs:$("#mObs",m.el).value.trim()||null},"Chamado encerrado.");}catch(e){return;}
    m.fechar();carregarEncerrados();depoisDeAgir();});
}
async function prioridade(p){try{await A.acao("ca_prioridade",{p_chamado:S.sel,p_prioridade:p,p_motivo:"Prioridade "+p},"Prioridade alterada.");}catch(e){}carregarLista();carregarDet();}

/* escolha única: clique marca, clique de novo desmarca */
A.escolhas=function(el,cb){if(!el)return;el.addEventListener("click",function(e){var b=e.target.closest("button[data-v]");if(!b)return;
  var ja=b.classList.contains("sel");$$("button",el).forEach(function(x){x.classList.remove("sel");});
  if(!ja){b.classList.add("sel");el.setAttribute("data-valor",b.getAttribute("data-v"));}else el.removeAttribute("data-valor");if(cb)cb();});};

A.modulos.console={
  mostrar:function(sub){
    if(!S.montado)montar();
    carregarLista().then(function(){if(sub&&sub!==S.sel)abrir(sub);});
    if(!S.encLido)carregarEncerrados();
    clearInterval(S.timer);clearInterval(S.timerDet);clearInterval(S.relogio);clearInterval(S.timerEnc);
    /* Realtime do Supabase fica para a próxima versão; até lá, consulta leve a cada 5 s só com a aba visível */
    S.timer=setInterval(function(){if(A.abaAtual==="console"&&!document.hidden)carregarLista();},5000);
    S.timerDet=setInterval(function(){if(A.abaAtual==="console"&&S.sel&&!document.hidden)carregarDet();},4000);
    S.timerEnc=setInterval(function(){if(A.abaAtual==="console"&&!document.hidden)carregarEncerrados();},60000);
    S.relogio=setInterval(function(){if(A.abaAtual==="console"&&S.filtro==="fila")desenhaLista();},30000);
  },
  recarregar:carregarLista
};
})();
