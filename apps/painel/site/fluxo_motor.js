/* Motor do fluxo em JS: tradução fiel de central_atendimento.validar_definicao / cond_ok / validar_respostas.
   Usado pelo simulador do construtor e pela prévia local. A regra oficial é a do banco:
   o construtor sempre confere no servidor (ca_fluxo_simular) antes de publicar. */
(function(raiz){
"use strict";
var CAMPOS=["texto","numero","data","opcoes","multipla","sim_nao","documento","arquivo"];
function erro(m){var e=new Error(m);e.code="23514";return e;}
function hojeBR(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());}
function cpfValido(p){var d=String(p||"").replace(/\D/g,"");if(d.length!==11||/^(\d)\1{10}$/.test(d))return false;
  function dv(n){var s=0;for(var i=0;i<n;i++)s+=(+d[i])*(n+1-i);return s%11<2?0:11-s%11;}
  return dv(9)===+d[9]&&dv(10)===+d[10];}
function vazio(v){return v==null||v===""||(Array.isArray(v)&&!v.length);}
function igualJson(a,b){return JSON.stringify(a)===JSON.stringify(b);}

function validarDefinicao(d){
  if(!d||!Array.isArray(d.nos)||!d.nos.length)throw erro("O fluxo precisa ter ao menos um passo.");
  var ids=[],chaves=[];
  d.nos.forEach(function(n){
    if(!n.id)throw erro("Todo passo do fluxo precisa de id.");
    if(ids.indexOf(n.id)>=0)throw erro("Passo repetido no fluxo: "+n.id);ids.push(n.id);
    if(["pergunta","mensagem","fim"].indexOf(n.tipo)<0)throw erro("Tipo de passo inválido em "+n.id+": "+n.tipo);
    if(n.tipo==="pergunta"){
      if(!/^[a-z][a-z0-9_]{0,40}$/.test(n.chave||""))throw erro("Pergunta "+n.id+" precisa de uma chave em minúsculas (ex.: numero_ov).");
      if(chaves.indexOf(n.chave)>=0)throw erro("Chave repetida no fluxo: "+n.chave);chaves.push(n.chave);
      if(!n.rotulo)throw erro("Pergunta "+n.id+" sem texto.");
      if(CAMPOS.indexOf(n.campo)<0)throw erro("Campo inválido na pergunta "+n.id+": "+n.campo);
      if((n.campo==="opcoes"||n.campo==="multipla")&&!(n.opcoes&&n.opcoes.length))throw erro("Pergunta "+n.id+" precisa de opções.");
      if(n.validador&&["cpf","placa"].indexOf(n.validador)<0)throw erro("Validador desconhecido na pergunta "+n.id+": "+n.validador);
    }
  });
  (d.arestas||[]).forEach(function(a){
    if(ids.indexOf(a.de)<0||ids.indexOf(a.para)<0)throw erro("Ligação aponta para passo inexistente: "+a.de+" → "+a.para);
  });
}
function condOk(se,resp){
  if(se==null)return true;
  var v=resp[se.chave];
  if("igual" in se)return v!==undefined&&igualJson(v,se.igual);
  if("diferente" in se)return !igualJson(v,se.diferente);
  if("em" in se)return (se.em||[]).some(function(e){return v!==undefined&&igualJson(e,v);});
  if("preenchido" in se)return (v!=null&&v!=="")===!!se.preenchido;
  return true;
}
/* próximo passo a partir de "atual", dadas as respostas normalizadas até aqui */
function proximo(d,atual,saida){
  var ar=(d.arestas||[]).map(function(a,i){return {a:a,i:i};}).filter(function(x){return x.a.de===atual;});
  var ok=ar.filter(function(x){return condOk(x.a.se,saida);}).sort(function(x,y){return ((x.a.se==null)-(y.a.se==null))||(x.i-y.i);});
  if(ok.length)return ok[0].a.para;
  if(!ar.length){var i=d.nos.findIndex(function(n){return n.id===atual;});return i>=0&&i+1<d.nos.length?d.nos[i+1].id:null;}
  return null;
}
/* valida e normaliza a resposta de UMA pergunta; devolve {v, txt} ou lança erro em português */
function validarResposta(n,v){
  var nome=n.rotulo,campo=n.campo,txt;
  if(vazio(v)){if(n.obrigatorio)throw erro("Responda: "+nome);return null;}
  txt=typeof v==="string"?v:JSON.stringify(v);
  if(campo==="numero"){var num=Number(String(txt).replace(",","."));
    if(String(txt).trim()===""||isNaN(num))throw erro(nome+" precisa ser um número.");
    if(n.min!=null&&num<n.min)throw erro(nome+" precisa ser no mínimo "+n.min+".");
    if(n.max!=null&&num>n.max)throw erro(nome+" precisa ser no máximo "+n.max+".");
    v=num;txt=String(txt);}
  else if(campo==="data"){if(!/^\d{4}-\d{2}-\d{2}$/.test(txt)||isNaN(new Date(txt+"T12:00:00")))throw erro(nome+" precisa ser uma data válida.");
    if(n.min_hoje&&txt<hojeBR())throw erro(nome+" não pode ser uma data passada.");
    v=txt;txt=txt.slice(8,10)+"/"+txt.slice(5,7)+"/"+txt.slice(0,4);}
  else if(campo==="opcoes"){if((n.opcoes||[]).indexOf(txt)<0)throw erro("Escolha uma opção válida em: "+nome);}
  else if(campo==="multipla"){if(!Array.isArray(v)||v.some(function(x){return (n.opcoes||[]).indexOf(x)<0;}))throw erro("Escolha opções válidas em: "+nome);txt=v.join(", ");}
  else if(campo==="sim_nao"){var l=String(txt).toLowerCase();
    if(["true","sim","s"].indexOf(l)>=0){v=true;txt="Sim";}else if(["false","nao","não","n"].indexOf(l)>=0){v=false;txt="Não";}else throw erro("Responda Sim ou Não em: "+nome);}
  else{txt=String(txt).trim();v=txt;if(txt.length>(n.max_caracteres||2000))throw erro(nome+" passou do limite de caracteres.");}
  if(n.regex&&["texto","documento","numero"].indexOf(campo)>=0&&!new RegExp(n.regex).test(txt))throw erro(n.msg_erro||("Formato inválido em: "+nome));
  if(n.validador==="cpf"&&!cpfValido(txt))throw erro(n.msg_erro||("CPF inválido em: "+nome));
  if(n.validador==="placa"&&!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(txt.replace(/[^A-Za-z0-9]/g,"").toUpperCase()))throw erro(n.msg_erro||("Placa inválida em: "+nome));
  if(n.validador==="placa"){txt=txt.replace(/[^A-Za-z0-9]/g,"").toUpperCase();v=txt;}
  if(n.validador==="cpf"){txt=txt.replace(/\D/g,"");v=txt;}
  return {v:v,txt:txt};
}
/* percorre o fluxo inteiro com as respostas dadas (igual ao validar_respostas do banco) */
function validarRespostas(d,resp){
  resp=resp||{};var atual=d.inicio||(d.nos[0]&&d.nos[0].id),saida={},resumo=[],itens=[],passos=0;
  while(atual&&passos++<200){
    var n=d.nos.find(function(x){return x.id===atual;});if(!n||n.tipo==="fim")break;
    if(n.tipo==="pergunta"){var r=validarResposta(n,resp[n.chave]);if(r){saida[n.chave]=r.v;resumo.push((n.rotulo_resumo||n.rotulo)+": "+r.txt);itens.push({chave:n.chave,rotulo:n.rotulo_resumo||n.rotulo,valor:r.txt});}}
    atual=proximo(d,atual,saida);
  }
  return {respostas:saida,resumo:resumo.join("\n"),itens:itens};
}
var F={CAMPOS:CAMPOS,cpfValido:cpfValido,hojeBR:hojeBR,validarDefinicao:validarDefinicao,condOk:condOk,proximo:proximo,validarResposta:validarResposta,validarRespostas:validarRespostas};
if(typeof module!=="undefined"&&module.exports)module.exports=F;else raiz.FLUXO=F;
})(typeof window!=="undefined"?window:globalThis);
