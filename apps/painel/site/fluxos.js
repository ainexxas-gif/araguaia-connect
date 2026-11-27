/* Construtor de fluxos: perguntas do assistente por assunto, no formato do banco (nós + arestas).
   Edita um rascunho versionado (ca_admin_fluxo_salvar); o app do consultor só usa a versão publicada.
   O simulador percorre o rascunho com o mesmo motor do banco (fluxo_motor.js) e confere no servidor. */
(function(){
"use strict";
var A=window.A,$=A.$,$$=A.$$,esc=A.esc,F=window.FLUXO;
var S={sel:null,versoes:[],pub:null,rasc:null,def:null,montado:false,tmr:null,estado:"",sim:null,abertos:{}};
var CAMPOS=[["texto","Texto"],["numero","Número"],["data","Data"],["opcoes","Uma opção"],["multipla","Várias opções"],["sim_nao","Sim / Não"],["documento","Nº de documento"],["arquivo","Foto ou arquivo"]];
var VALID=[["","Sem regra"],["num612","Só números, 6 a 12 dígitos"],["centro","Centro (4 caracteres)"],["cpf","CPF válido"],["placa","Placa (ABC1D23)"],["regex","Regra personalizada"]];
var RX={num612:["^[0-9]{6,12}$","Só números, de 6 a 12 dígitos."],centro:["^[A-Za-z0-9]{4}$","O centro tem 4 caracteres (ex.: 1001)."]};
var OPS=[["igual","for igual a"],["diferente","for diferente de"],["em","for uma destas"],["preenchido","for respondida"]];
function clone(o){return JSON.parse(JSON.stringify(o));}
function cad(t){return (A.cadAdmin&&A.cadAdmin[t])||[];}
function assunto(){return cad("assuntos").find(function(s){return s.id===S.sel;});}
function passos(){return S.def.nos.filter(function(n){return n.tipo!=="fim";});}
function idFim(){var f=S.def.nos.find(function(n){return n.tipo==="fim";});return f?f.id:null;}
function validTipo(n){if(n.validador)return n.validador;if(!n.regex)return "";var k=Object.keys(RX).find(function(k){return RX[k][0]===n.regex;});return k||"regex";}
function slug(t){return A.norm(t).replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").replace(/^([0-9])/,"p_$1").slice(0,40)||"pergunta";}
function chaveLivre(base,exceto){var c=base,i=2;while(S.def.nos.some(function(n){return n!==exceto&&n.chave===c;}))c=base.slice(0,37)+"_"+i++;return c;}
function novoId(){var i=1;while(S.def.nos.some(function(n){return n.id==="p"+i;}))i++;return "p"+i;}
function defPadrao(){return {inicio:"p1",nos:[{id:"p1",tipo:"pergunta",chave:"descricao",rotulo:"Descreva o que você precisa",campo:"texto",obrigatorio:true,max_caracteres:1500},{id:"fim",tipo:"fim"}],arestas:[]};}

/* arestas de cada passo, lidas e escritas no formato do banco */
function condsDe(id){return (S.def.arestas||[]).filter(function(a){return a.de===id&&a.se;});}
function senaoDe(id){var a=(S.def.arestas||[]).find(function(a){return a.de===id&&!a.se;});return a?a.para:null;}
function proxLista(id){var l=S.def.nos,i=l.findIndex(function(n){return n.id===id;});return i>=0&&i+1<l.length?l[i+1].id:null;}
function normalizar(){
  /* fim sempre por último; ligações sem destino caem fora; passo com desvio ganha "senão" explícito */
  var fim=S.def.nos.filter(function(n){return n.tipo==="fim";});if(!fim.length)fim=[{id:"fim",tipo:"fim"}];
  S.def.nos=S.def.nos.filter(function(n){return n.tipo!=="fim";}).concat([fim[0]]);
  var ids=S.def.nos.map(function(n){return n.id;});
  S.def.arestas=(S.def.arestas||[]).filter(function(a){return ids.indexOf(a.de)>=0&&ids.indexOf(a.para)>=0;});
  passos().forEach(function(n){var c=condsDe(n.id),s=senaoDe(n.id);
    if(c.length&&!s)S.def.arestas.push({de:n.id,para:proxLista(n.id)});
    if(!c.length&&s&&s===proxLista(n.id))S.def.arestas=S.def.arestas.filter(function(a){return !(a.de===n.id&&!a.se);});});
  /* ordem estável: desvios antes do senão, na ordem dos passos */
  var ord={};S.def.nos.forEach(function(n,i){ord[n.id]=i;});
  S.def.arestas.sort(function(a,b){return (ord[a.de]-ord[b.de])||((!a.se)-(!b.se));});
  S.def.inicio=S.def.nos[0].id;
}

/* ---------- montagem e carga ---------- */
function montar(){
  $("#pane-fluxos").innerHTML='<h2>Fluxos do assistente</h2><div class="flx"><section class="flx-arv" id="fxArv"></section><section class="flx-ed" id="fxEd"><div class="vazio">Carregando…</div></section><section class="sim" id="fxSim"></section></div>';
  $("#fxArv").addEventListener("click",function(e){var b=e.target.closest("[data-sel],[data-novo]");if(!b)return;
    if(b.hasAttribute("data-novo")){A.editarCadastro("assuntos",null,function(){desenhaArv();});return;}
    abrir(+b.getAttribute("data-sel"));if(window.innerWidth<=760)$("#fxEd").scrollIntoView({behavior:"smooth"});});
  $("#fxEd").addEventListener("input",editou);
  $("#fxEd").addEventListener("change",editou);
  $("#fxEd").addEventListener("click",cliqueEd);
  S.montado=true;
}
function desenhaArv(){
  var h="";
  cad("areas").filter(function(a){return a.ativa!==false;}).forEach(function(ar){
    var as=cad("assuntos").filter(function(s){return s.area_id===ar.id;});
    h+='<div class="arv-area"><div class="cab"><span>'+esc(ar.nome)+'</span></div>'+(as.length?as.map(function(s){
      return '<button class="arv-it'+(S.sel===s.id?" sel":"")+'" data-sel="'+s.id+'"'+(s.ativo===false?' style="opacity:.55" title="Fora do menu"':"")+'>'+esc(s.nome)+'</button>';}).join(""):'<div class="sub" style="padding:4px 10px">Nenhum assunto.</div>')+'</div>';});
  h+='<button class="bt" data-novo style="width:100%">+ Novo assunto</button><p class="ajuda">Nome, fila e documento de cada assunto ficam em Cadastros › Assuntos.</p>';
  $("#fxArv").innerHTML=h;
}
async function abrir(id){
  if(S.tmr){clearTimeout(S.tmr);await salvarAgora();}
  S.sel=id;A.subHash(String(id));desenhaArv();
  $("#fxEd").innerHTML='<div class="vazio">Carregando…</div>';
  try{S.versoes=await A.rpc("ca_admin_fluxos",{p_assunto:id});}catch(e){$("#fxEd").innerHTML='<div class="vazio">'+esc(A.traduz(e))+'</div>';return;}
  S.pub=S.versoes.find(function(v){return v.status==="publicado";})||null;
  S.rasc=S.versoes.find(function(v){return v.status==="rascunho";})||null;
  S.def=clone(S.rasc?S.rasc.definicao:S.pub?S.pub.definicao:defPadrao());normalizar();
  S.estado=S.rasc?"salvo":"";S.abertos={};
  desenhaEd();reiniciaSim();
}

/* ---------- editor ---------- */
function desenhaEd(){
  var s=assunto();if(!s){$("#fxEd").innerHTML='<div class="vazio">Escolha um assunto à esquerda.</div>';return;}
  var igual=S.pub&&S.rasc&&JSON.stringify(S.rasc.definicao)===JSON.stringify(S.pub.definicao);
  var ver='<div class="versao'+(S.rasc&&!igual?" rasc":"")+'" id="fxVer">'+
    (S.pub?'<span><b>Versão '+S.pub.versao+' no app</b> desde '+A.dataHora(S.pub.publicado_em)+'</span>':'<span class="tag rd">Sem versão publicada: o assunto não aparece no app</span>')+
    (S.rasc&&!igual?'<span class="tag at">Rascunho v'+S.rasc.versao+' com alterações</span>':S.rasc?'<span class="tag">Rascunho igual ao publicado</span>':'<span class="tag ok">Sem alterações</span>')+
    '<span class="sub" id="fxEstado">'+estadoTxt()+'</span><span style="flex:1"></span>'+
    (S.rasc&&S.pub&&!igual?'<button class="bt perigo" id="fxVolta">Voltar ao publicado</button>':"")+
    (S.rasc&&!igual?'<button class="bt ok" id="fxPub">Publicar no app</button>':"")+'</div>';
  var l=passos();
  $("#fxEd").innerHTML=ver+
    '<div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><h3 style="margin:0;flex:1">'+esc(s.nome)+'</h3><span class="sub">'+esc((cad("filas").find(function(f){return f.id===s.fila_id;})||{}).nome||"")+(s.documento_tipo?" · documento "+esc(s.documento_tipo):"")+'</span><button class="bt sm" data-acao="cad">Dados do assunto</button></div>'+
    '<p class="ajuda">Os passos aparecem ao consultor nesta ordem. Use os desvios para pular perguntas conforme a resposta. Tudo o que ele responder chega ao atendente como um resumo no topo da conversa.</p>'+
    '<div id="fxPassos">'+l.map(function(n,i){return htmlPasso(n,i,l);}).join("")+'</div>'+
    '<div class="barra"><button class="bt" data-acao="addP">+ Pergunta</button><button class="bt" data-acao="addM">+ Mensagem</button></div>'+
    htmlVersoes();
  var pub=$("#fxPub");if(pub)A.doisCliques(pub,"Confirmar: publicar v"+S.rasc.versao,publicar);
  var vt=$("#fxVolta");if(vt)A.doisCliques(vt,"Confirmar: descartar alterações",function(){S.def=clone(S.pub.definicao);normalizar();agendar(0);desenhaEd();reiniciaSim();});
}
function estadoTxt(){return {salvando:"Salvando rascunho…",salvo:"Rascunho salvo",erro:"Rascunho não salvo: "+(S.erroMsg||""),"":""}[S.estado]||"";}
function mostraEstado(){var e=$("#fxEstado");if(e){e.textContent=estadoTxt();e.className=S.estado==="erro"?"t-rd":"sub";}}
function htmlPasso(n,i,l){
  var aberto=S.abertos[n.id]!==false,tipo=n.tipo==="mensagem"?"Mensagem":(CAMPOS.find(function(c){return c[0]===n.campo;})||["",""])[1];
  var h='<div class="perg'+(aberto?"":" fechado")+'" data-id="'+esc(n.id)+'"><div class="ph"><span class="num">'+(i+1)+'</span>'+
    '<button class="tit" data-acao="abre" aria-expanded="'+aberto+'"><b>'+esc(n.tipo==="mensagem"?(n.texto||"Mensagem"):(n.rotulo||"Nova pergunta"))+'</b><span class="sub"> · '+esc(tipo)+(n.tipo==="pergunta"&&!n.obrigatorio?" · pode pular":"")+(condsDe(n.id).length?" · "+condsDe(n.id).length+" desvio(s)":"")+'</span></button>'+
    '<span class="ord"><button class="bt sm" data-acao="sobe" aria-label="Subir"'+(i===0?" disabled":"")+'>↑</button><button class="bt sm" data-acao="desce" aria-label="Descer"'+(i===l.length-1?" disabled":"")+'>↓</button><button class="bt sm perigo" data-acao="del">Remover</button></span></div>';
  if(!aberto)return h+'</div>';
  if(n.tipo==="mensagem")return h+'<div class="fg"><label>Texto da mensagem</label><textarea data-k="texto">'+esc(n.texto||"")+'</textarea></div>'+htmlDesvios(n,i,l)+'</div>';
  var vt=validTipo(n),extra="";
  if(n.campo==="opcoes"||n.campo==="multipla")extra+='<div class="fg"><label>Opções (uma por linha)</label><textarea data-k="opcoes" rows="4">'+esc((n.opcoes||[]).join("\n"))+'</textarea><span class="obr">Obrigatório</span></div>';
  if(n.campo==="texto"||n.campo==="documento")extra+='<div class="grid2"><div class="fg"><label>Regra de formato</label><select data-k="valid">'+VALID.map(function(v){return '<option value="'+v[0]+'"'+(v[0]===vt?" selected":"")+'>'+v[1]+'</option>';}).join("")+'</select></div>'+
    '<div class="fg"><label>Mensagem quando estiver errado</label><input data-k="msg_erro" value="'+esc(n.msg_erro||"")+'" placeholder="Ex.: O nº da OV tem só números."></div></div>'+
    (vt==="regex"?'<div class="fg"><label>Regra personalizada (expressão regular)</label><input data-k="regex" value="'+esc(n.regex||"")+'" placeholder="^[0-9]{10}$" spellcheck="false"></div>':"")+
    (n.campo==="texto"?'<div class="fg"><label>Limite de caracteres</label><input type="number" inputmode="numeric" data-k="max_caracteres" value="'+(n.max_caracteres||"")+'" placeholder="2000"></div>':"");
  if(n.campo==="numero")extra+='<div class="grid2"><div class="fg"><label>Valor mínimo</label><input type="number" inputmode="decimal" data-k="min" value="'+(n.min==null?"":n.min)+'"></div><div class="fg"><label>Valor máximo</label><input type="number" inputmode="decimal" data-k="max" value="'+(n.max==null?"":n.max)+'"></div></div>';
  if(n.campo==="data")extra+='<div class="fg"><label>Datas passadas</label><div class="escolhas" data-sn="min_hoje"><button type="button" data-v="1" class="'+(n.min_hoje?"sel":"")+'">Não aceitar</button><button type="button" data-v="0" class="'+(n.min_hoje?"":"sel")+'">Aceitar</button></div></div>';
  return h+
    '<div class="fg"><label>Pergunta</label><input data-k="rotulo" value="'+esc(n.rotulo||"")+'" placeholder="Ex.: Qual o nº da OV?"><span class="obr">Obrigatório</span></div>'+
    '<div class="fg"><label>Tipo de resposta</label><div class="escolhas" data-k="campo">'+CAMPOS.map(function(c){return '<button type="button" data-v="'+c[0]+'" class="'+(n.campo===c[0]?"sel":"")+'">'+c[1]+'</button>';}).join("")+'</div></div>'+extra+
    '<div class="grid2"><div class="fg"><label>Dica mostrada ao consultor</label><input data-k="ajuda" value="'+esc(n.ajuda||"")+'" placeholder="Ex.: 10 dígitos, começa com 45"></div>'+
    '<div class="fg"><label>Resposta obrigatória</label><div class="escolhas" data-sn="obrigatorio"><button type="button" data-v="1" class="'+(n.obrigatorio?"sel":"")+'">Sim</button><button type="button" data-v="0" class="'+(n.obrigatorio?"":"sel")+'">Não, pode pular</button></div></div></div>'+
    '<div class="grid2"><div class="fg"><label>Nome no resumo do atendente</label><input data-k="rotulo_resumo" value="'+esc(n.rotulo_resumo||"")+'" placeholder="'+esc(n.rotulo||"")+'"></div>'+
    '<div class="fg"><label>Chave (relatórios e desvios)</label><input data-k="chave" value="'+esc(n.chave||"")+'" spellcheck="false" autocapitalize="off"><span class="ajuda">Minúsculas e _; única no fluxo.</span></div></div>'+
    htmlDesvios(n,i,l)+'</div>';
}
function htmlDesvios(n,i,l){
  var antes=l.slice(0,i+1).filter(function(x){return x.tipo==="pergunta";});
  var destinos=l.slice(i+1).map(function(x){return [x.id,(l.indexOf(x)+1)+". "+(x.rotulo||x.texto||"").slice(0,50)];}).concat([[idFim(),"Fim (enviar para a fila)"]]);
  var conds=condsDe(n.id),sen=senaoDe(n.id);
  var h='<div class="desvios"><div class="sub" style="font-weight:700;margin:6px 0">Depois deste passo</div>';
  conds.forEach(function(a,k){var p=antes.find(function(x){return x.chave===a.se.chave;})||antes[antes.length-1]||{};
    var op=Object.keys(a.se).find(function(x){return x!=="chave";})||"igual",v=a.se[op];
    var vals=p.campo==="sim_nao"?[["true","Sim"],["false","Não"]]:(p.opcoes||[]).map(function(o){return [o,o];});
    var campoV;
    if(op==="preenchido")campoV='<select data-d="valor"><option value="true"'+(v!==false?" selected":"")+'>sim</option><option value="false"'+(v===false?" selected":"")+'>não</option></select>';
    else if(op==="em")campoV='<div class="checks">'+vals.map(function(o){var on=(v||[]).some(function(x){return String(x)===o[0];});return '<label class="'+(on?"sel":"")+'"><input type="checkbox" data-d="em" value="'+esc(o[0])+'"'+(on?" checked":"")+'> '+esc(o[1])+'</label>';}).join("")+'</div>';
    else if(vals.length)campoV='<select data-d="valor"><option value="">Escolha…</option>'+vals.map(function(o){return '<option value="'+esc(o[0])+'"'+(String(v)===o[0]?" selected":"")+'>'+esc(o[1])+'</option>';}).join("")+'</select>';
    else campoV='<input data-d="valor" value="'+esc(v==null?"":v)+'" placeholder="valor">';
    h+='<div class="regra" data-k2="'+k+'"><div class="fg"><label>Se a resposta de</label><select data-d="chave">'+antes.map(function(x){return '<option value="'+esc(x.chave)+'"'+(x.chave===a.se.chave?" selected":"")+'>'+esc(x.rotulo||x.chave)+'</option>';}).join("")+'</select></div>'+
      '<div class="fg"><label>&nbsp;</label><select data-d="op">'+OPS.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===op?" selected":"")+'>'+o[1]+'</option>';}).join("")+'</select></div>'+
      '<div class="fg"><label>&nbsp;</label>'+campoV+'</div>'+
      '<div class="fg"><label>ir para</label><select data-d="para">'+destinos.map(function(d){return '<option value="'+esc(d[0])+'"'+(d[0]===a.para?" selected":"")+'>'+esc(d[1])+'</option>';}).join("")+'</select></div>'+
      '<button class="bt sm perigo" data-acao="delD" style="align-self:end;margin-bottom:12px">Remover</button></div>';});
  h+='<div class="regra" style="grid-template-columns:auto 1fr"><span class="sub" style="align-self:center">'+(conds.length?"Senão, ir para":"Ir para")+'</span><select data-d="senao">'+
    '<option value="">Próximo passo da lista</option>'+destinos.map(function(d){return '<option value="'+esc(d[0])+'"'+(sen&&d[0]===sen&&!(sen===proxLista(n.id)&&!conds.length)?" selected":"")+'>'+esc(d[1])+'</option>';}).join("")+'</select></div>'+
    (antes.some(function(x){return ["opcoes","multipla","sim_nao","texto","numero","documento","data"].indexOf(x.campo)>=0;})?'<button class="bt sm" data-acao="addD">+ Desvio conforme a resposta</button>':"")+'</div>';
  return h;
}
function htmlVersoes(){
  if(!S.versoes.length)return "";
  return '<details class="versoes"><summary>Histórico de versões ('+S.versoes.length+')</summary><div class="tabWrap"><table class="tb"><thead><tr><th>Versão</th><th>Situação</th><th>Publicada em</th><th>Por</th><th></th></tr></thead><tbody>'+
    S.versoes.map(function(v){return '<tr><td>v'+v.versao+'</td><td>'+({publicado:'<span class="tag ok">No app</span>',rascunho:'<span class="tag at">Rascunho</span>',arquivado:'<span class="tag">Arquivada</span>'}[v.status])+'</td><td>'+A.dataHora(v.publicado_em)+'</td><td>'+esc(v.publicado_por||v.criado_por||"")+'</td><td>'+(v.status==="arquivado"?'<button class="bt sm" data-acao="restaura" data-v="'+v.id+'">Usar como rascunho</button>':"")+'</td></tr>';}).join("")+'</tbody></table></div></details>';
}
function passoDe(el){var box=el.closest(".perg");return box?S.def.nos.find(function(n){return n.id===box.getAttribute("data-id");}):null;}
function editou(e){
  var t=e.target,n=passoDe(t);if(!n)return;
  var k=t.getAttribute("data-k"),d=t.getAttribute("data-d");
  if(k){
    if(k==="opcoes")n.opcoes=t.value.split("\n").map(function(x){return x.trim();}).filter(Boolean);
    else if(k==="valid"){if(e.type!=="change")return;delete n.validador;delete n.regex;
      if(t.value==="cpf"||t.value==="placa")n.validador=t.value;else if(RX[t.value]){n.regex=RX[t.value][0];if(!n.msg_erro)n.msg_erro=RX[t.value][1];}else if(t.value==="regex")n.regex="";
      if(t.value==="cpf"&&!n.msg_erro)n.msg_erro="CPF inválido. Confira os 11 números.";if(t.value==="placa"&&!n.msg_erro)n.msg_erro="Placa no formato ABC1D23 ou ABC1234.";
      mudou(true);return;}
    else if(["min","max","max_caracteres"].indexOf(k)>=0){if(t.value==="")delete n[k];else n[k]=+t.value;}
    else if(k==="chave")n.chave=t.value.trim();
    else{if(t.value==="")delete n[k];else n[k]=t.value;
      if(k==="rotulo"&&n._novo){n.chave=chaveLivre(slug(t.value),n);var ch=t.closest(".perg").querySelector("[data-k=chave]");if(ch)ch.value=n.chave;}}
    if(k==="rotulo"||k==="texto"){var b=t.closest(".perg").querySelector(".tit b");if(b)b.textContent=t.value||"Nova pergunta";}
    mudou(false);return;
  }
  if(d&&e.type==="change"){
    if(d==="senao"){S.def.arestas=S.def.arestas.filter(function(a){return !(a.de===n.id&&!a.se);});if(t.value)S.def.arestas.push({de:n.id,para:t.value});mudou(true);return;}
    var k2=+t.closest(".regra").getAttribute("data-k2"),a=condsDe(n.id)[k2];if(!a)return;
    var op=Object.keys(a.se).find(function(x){return x!=="chave";})||"igual";
    if(d==="chave"){a.se={chave:t.value,igual:""};}
    else if(d==="op"){var v=a.se[op];a.se={chave:a.se.chave};a.se[t.value]=t.value==="em"?[]:t.value==="preenchido"?true:(Array.isArray(v)?"":v);}
    else if(d==="valor"){a.se[op]=converte(a.se.chave,t.value,op);}
    else if(d==="em"){a.se.em=$$('[data-d=em]:checked',t.closest(".regra")).map(function(c){return converte(a.se.chave,c.value);});}
    else if(d==="para")a.para=t.value;
    mudou(d!=="valor"&&d!=="em");
  }
}
/* o valor da condição precisa ter o mesmo tipo da resposta normalizada pelo banco */
function converte(chave,v,op){if(op==="preenchido")return v==="true";var p=S.def.nos.find(function(n){return n.chave===chave;})||{};
  if(p.campo==="sim_nao")return v==="true";if(p.campo==="numero"&&v!==""&&!isNaN(+v))return +v;return v;}
function cliqueEd(e){
  var b=e.target.closest("button");if(!b)return;var ac=b.getAttribute("data-acao"),n=passoDe(b);
  var esc2=b.closest(".escolhas");
  if(esc2&&n){var v=b.getAttribute("data-v");
    if(esc2.hasAttribute("data-sn")){n[esc2.getAttribute("data-sn")]=v==="1";}
    else if(esc2.getAttribute("data-k")==="campo"){n.campo=v;if((v==="opcoes"||v==="multipla")&&!(n.opcoes&&n.opcoes.length))n.opcoes=["Opção 1","Opção 2"];
      if(["texto","documento","numero"].indexOf(v)<0){delete n.regex;delete n.validador;delete n.msg_erro;}if(v!=="numero"){delete n.min;delete n.max;}if(v!=="data")delete n.min_hoje;}
    mudou(true);return;}
  if(ac==="cad"){A.editarCadastro("assuntos",String(S.sel),function(){desenhaArv();desenhaEd();});return;}
  if(ac==="addP"||ac==="addM"){var id=novoId(),novo=ac==="addP"?{id:id,tipo:"pergunta",chave:chaveLivre("pergunta_"+id.slice(1)),rotulo:"",campo:"texto",obrigatorio:true,_novo:true}:{id:id,tipo:"mensagem",texto:""};
    S.def.nos.splice(S.def.nos.length-1,0,novo);S.abertos[id]=true;mudou(true);
    var box=$('#fxPassos .perg[data-id="'+id+'"]');if(box){box.scrollIntoView({block:"center"});var i=box.querySelector("[data-k=rotulo],[data-k=texto]");if(i)i.focus({preventScroll:true});}return;}
  if(ac==="restaura"){var ver=S.versoes.find(function(x){return x.id===+b.getAttribute("data-v");});if(ver){S.def=clone(ver.definicao);normalizar();mudou(true);A.toast("Versão v"+ver.versao+" carregada no rascunho.","ok");}return;}
  if(!n)return;
  var l=S.def.nos,i=l.indexOf(n);
  if(ac==="abre"){S.abertos[n.id]=S.abertos[n.id]===false;desenhaEd();return;}
  if(ac==="sobe"&&i>0){l.splice(i-1,0,l.splice(i,1)[0]);mudou(true);}
  else if(ac==="desce"&&i<l.length-2){l.splice(i+1,0,l.splice(i,1)[0]);mudou(true);}
  else if(ac==="del"){if(!b.classList.contains("armado")){b.classList.add("armado");b.textContent="Confirmar";setTimeout(function(){b.classList.remove("armado");b.textContent="Remover";},4000);return;}
    var prox=proxLista(n.id);l.splice(i,1);
    S.def.arestas=S.def.arestas.filter(function(a){return a.de!==n.id&&!(a.se&&a.se.chave===n.chave);}).map(function(a){if(a.para===n.id)a.para=prox;return a;});mudou(true);}
  else if(ac==="addD"){var antes=passos().slice(0,passos().indexOf(n)+1).filter(function(x){return x.tipo==="pergunta";});var p=antes[antes.length-1];
    var dest=passos()[passos().indexOf(n)+2];
    S.def.arestas.push({de:n.id,para:dest?dest.id:idFim(),se:{chave:p.chave,igual:p.campo==="sim_nao"?true:(p.opcoes&&p.opcoes[0])||""}});mudou(true);}
  else if(ac==="delD"){var k2=+b.closest(".regra").getAttribute("data-k2"),a=condsDe(n.id)[k2];S.def.arestas.splice(S.def.arestas.indexOf(a),1);mudou(true);}
}
function mudou(redesenha){normalizar();if(redesenha)desenhaEd();agendar(700);reiniciaSim();}
function agendar(ms){clearTimeout(S.tmr);S.tmr=setTimeout(salvarAgora,ms);}
async function salvarAgora(){
  S.tmr=null;var def=limpa(S.def);
  try{F.validarDefinicao(def);}catch(e){S.estado="erro";S.erroMsg=e.message;mostraEstado();return false;}
  S.estado="salvando";mostraEstado();
  try{var r=await A.rpc("ca_admin_fluxo_salvar",{p_assunto:S.sel,p_definicao:def});var tinha=!!S.rasc;S.rasc=r;
    var i=S.versoes.findIndex(function(v){return v.id===r.id;});if(i>=0)S.versoes[i]=r;else S.versoes.unshift(r);
    S.estado="salvo";if(!tinha||$("#fxPub")==null)desenhaEd();else mostraEstado();return true;}
  catch(e){S.estado="erro";S.erroMsg=A.traduz(e);mostraEstado();return false;}
}
function limpa(d){var c=clone(d);c.nos.forEach(function(n){delete n._novo;});return c;}
async function publicar(){
  if(S.tmr)clearTimeout(S.tmr);if(!(await salvarAgora())){A.toast("Corrija o rascunho antes de publicar: "+S.erroMsg,"erro");return;}
  try{await A.acao("ca_admin_fluxo_publicar",{p_fluxo:S.rasc.id},"Publicado. O app do consultor já usa a versão nova.");}catch(e){return;}
  abrir(S.sel);
}

/* ---------- simulador: percorre o rascunho como o app ---------- */
function reiniciaSim(){S.sim={atual:null,msgs:[],saida:{},resp:{},fim:false};
  var s=assunto();if(!s){desenhaSim();return;}
  S.sim.msgs.push({de:"eu",t:s.nome});avancaPara(S.def.inicio||S.def.nos[0].id);desenhaSim();}
function avancaPara(id){var g=0;
  while(id&&g++<100){var n=S.def.nos.find(function(x){return x.id===id;});
    if(!n||n.tipo==="fim"){fimSim();return;}
    if(n.tipo==="mensagem"){S.sim.msgs.push({de:"bot",t:n.texto||"(mensagem vazia)"});id=F.proximo(S.def,n.id,S.sim.saida);continue;}
    S.sim.atual=n;S.sim.msgs.push({de:"bot",t:n.rotulo+(n.ajuda?"\n"+n.ajuda:""),n:n});return;}
  fimSim();}
function fimSim(){S.sim.atual=null;S.sim.fim=true;var s=assunto(),f=cad("filas").find(function(x){return x.id===s.fila_id;});
  S.sim.msgs.push({de:"bot",t:"Pronto! Seu pedido entrou na fila de "+(f?f.nome:"atendimento")+". Protocolo 2611-00001."});}
function responde(v){var n=S.sim.atual;if(!n)return;
  var mostra=Array.isArray(v)?v.join(", "):v===""?"(pulou)":String(v);
  if(n.campo==="data"&&/^\d{4}-\d{2}-\d{2}$/.test(v))mostra=v.slice(8,10)+"/"+v.slice(5,7)+"/"+v.slice(0,4);
  S.sim.msgs.push({de:"eu",t:mostra});
  try{var r=F.validarResposta(n,v===""?null:v);if(r){S.sim.saida[n.chave]=r.v;S.sim.resp[n.chave]=v;}}
  catch(e){S.sim.msgs.push({de:"bot",t:e.message,erro:true});S.sim.msgs.push({de:"bot",t:n.rotulo,n:n});desenhaSim();return;}
  avancaPara(F.proximo(S.def,n.id,S.sim.saida));desenhaSim();}
function desenhaSim(){
  var el=$("#fxSim");if(!el)return;
  if(!el.firstChild){el.innerHTML='<div class="sh"><span class="av">'+A.cfg.iconeMini+'</span><div style="flex:1;min-width:0"><b>'+esc(A.cfg.nomeProduto)+'</b><div style="font-size:12px;opacity:.85">Simulador do rascunho</div></div><button class="bt sm" id="simRe">Reiniciar</button></div><div class="sb" id="simB"></div><div class="sf" id="simF"></div>';
    $("#simRe").addEventListener("click",reiniciaSim);
    el.addEventListener("click",cliqueSim);
    el.addEventListener("submit",function(e){e.preventDefault();var i=$("#simI");if(!i)return;var v=i.value.trim();if(!v&&S.sim.atual.obrigatorio)return;i.value="";responde(v);});}
  var ult=S.sim.msgs.length-1;
  $("#simB").innerHTML=S.sim.msgs.map(function(m,i){return '<div class="msg '+(m.de==="eu"?"eu":m.erro?"erroSim":"")+'">'+esc(m.t)+'</div>';}).join("")+
    (S.sim.fim?resumoSim():"");
  var b=$("#simB");b.scrollTop=b.scrollHeight;
  var n=S.sim.atual,f=$("#simF");
  if(!n){f.innerHTML=S.sim.fim?'<button class="bt" data-s="srv" style="flex:1">Conferir no servidor</button>':"";return;}
  var pular=n.obrigatorio?"":'<button class="bt" type="button" data-s="pular">Pular</button>';
  if(n.campo==="opcoes")f.innerHTML='<div class="opcs">'+n.opcoes.map(function(o){return '<button type="button" data-s="op" data-v="'+esc(o)+'">'+esc(o)+'</button>';}).join("")+'</div>'+pular;
  else if(n.campo==="sim_nao")f.innerHTML='<div class="opcs"><button type="button" data-s="op" data-v="Sim">Sim</button><button type="button" data-s="op" data-v="Não">Não</button></div>'+pular;
  else if(n.campo==="multipla")f.innerHTML='<div class="opcs">'+n.opcoes.map(function(o){return '<label class="checkSim"><input type="checkbox" value="'+esc(o)+'"> '+esc(o)+'</label>';}).join("")+'<button type="button" class="bt pri" data-s="multi">Enviar</button></div>'+pular;
  else if(n.campo==="arquivo")f.innerHTML='<button type="button" class="bt" data-s="op" data-v="anexos/exemplo.jpg" style="flex:1">📷 Enviar foto de exemplo</button>'+pular;
  else f.innerHTML='<form id="simForm" style="display:flex;gap:6px;flex:1"><input id="simI" type="'+(n.campo==="data"?"date":"text")+'"'+(n.campo==="numero"||n.campo==="documento"?' inputmode="numeric"':"")+' placeholder="Responder como consultor" enterkeyhint="send" aria-label="Resposta do consultor"><button class="bt pri">Enviar</button></form>'+pular;
}
function resumoSim(){var r;try{r=F.validarRespostas(S.def,S.sim.resp);}catch(e){return '<div class="msg erroSim">'+esc(e.message)+'</div>';}
  return '<div class="coleta"><h4>O atendente vai ver</h4><dl>'+r.itens.map(function(i){return '<dt>'+esc(i.rotulo)+'</dt><dd>'+esc(i.valor)+'</dd>';}).join("")+'</dl></div>';}
async function cliqueSim(e){var b=e.target.closest("[data-s]");if(!b)return;var s=b.getAttribute("data-s");
  if(s==="op")responde(b.getAttribute("data-v"));
  else if(s==="pular")responde("");
  else if(s==="multi")responde($$("#simF input:checked").map(function(c){return c.value;}));
  else if(s==="srv"){try{var r=await A.rpc("ca_fluxo_simular",{p_definicao:limpa(S.def),p_respostas:S.sim.resp});A.toast("O servidor aceitou as respostas: "+Object.keys(r.respostas).length+" campos no resumo.","ok");}
    catch(er){A.toast("O servidor recusou: "+A.traduz(er),"erro");}}
}

A.modulos.fluxos={mostrar:async function(sub){
  if(!S.montado)montar();
  try{await A.carregarCadastrosAdmin();}catch(e){$("#fxEd").innerHTML='<div class="vazio">'+esc(A.traduz(e))+'</div>';return;}
  desenhaArv();var id=+sub||S.sel||(cad("assuntos")[0]||{}).id;if(id)abrir(id);}};
})();
