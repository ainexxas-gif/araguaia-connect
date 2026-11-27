/* PRÉVIA LOCAL — imitação das funções public.ca_* do banco, com dados SIMULADOS.
   Só entra no build de prévia (montar.py --previa). Nunca vai para produção.
   Regras copiadas das migrações (supabase/migrations/*central_3_rpc.sql); cadastros e fluxos
   vêm do seed das migrações (mock_seed.js, gerado pelo montar.py). Nomes de pessoas são fictícios. */
(function(){
"use strict";
var SEED=window.__SEED__,F=window.FLUXO;
/* ---------- aleatório reprodutível ---------- */
var semente=20261127;function rnd(){semente|=0;semente=semente+0x6D2B79F5|0;var t=Math.imul(semente^semente>>>15,1|semente);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;}
function pick(a){return a[Math.floor(rnd()*a.length)];}
function pesos(o){var t=0,k;for(k in o)t+=o[k];var r=rnd()*t;for(k in o){r-=o[k];if(r<=0)return k;}return k;}
function logn(med,sig){var u=rnd()||1e-9,v=rnd();var z=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);return med*Math.exp(sig*z);}
function uuid(){return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=rnd()*16|0;return (c==="x"?r:(r&3|8)).toString(16);});}
function erro(code,msg){var e=new Error(msg);e.code=code;return e;}
function iso(d){return new Date(d).toISOString();}
var AGORA=Date.now(),MIN=60000,TZ_OFF=-3; /* Brasília sem horário de verão */
function local(ms){var d=new Date(ms+TZ_OFF*3600000);return {dow:d.getUTCDay(),h:d.getUTCHours(),m:d.getUTCMinutes(),dia:d.toISOString().slice(0,10)};}
function inicioDiaBR(ms){var l=local(ms);return Date.parse(l.dia+"T00:00:00-03:00");}

/* ---------- cadastros (do seed das migrações) ---------- */
var DB={areas:[],filas:[],horarios:[],feriados:[],assuntos:[],fluxos:[],atendentes:[],fila_atendentes:[],equipes_venda:[],solicitantes:[],
  chamados:[],mensagens:[],eventos:[],avaliacoes:[],respostas_rapidas:[],config:[]};
var seq={areas:1,filas:1,assuntos:1,horarios:1,feriados:1,fluxos:1,respostas_rapidas:1,mensagens:1,eventos:1,equipes_venda:1,protocolo:1};
SEED.areas.forEach(function(a){DB.areas.push({id:seq.areas++,codigo:a.codigo,nome:a.nome,descricao:a.descricao,icone:a.icone,cor:a.cor,ordem:a.ordem,ativa:true});});
function areaCod(c){return DB.areas.find(function(a){return a.codigo===c;});}
SEED.filas.forEach(function(f){DB.filas.push({id:seq.filas++,area_id:areaCod(f.area).id,codigo:f.codigo,nome:f.nome,descricao:null,
  distribuicao:f.area==="PI"?"automatica":"manual",sla_espera_min:f.sla_e,sla_atendimento_min:f.sla_a,msg_fora_horario:null,ativa:true});});
DB.filas.forEach(function(f){for(var d=1;d<=5;d++)DB.horarios.push({id:seq.horarios++,fila_id:f.id,dia_semana:d,inicio:"07:30",fim:"18:00"});
  DB.horarios.push({id:seq.horarios++,fila_id:f.id,dia_semana:6,inicio:"08:00",fim:"12:00"});});
DB.feriados.push({id:seq.feriados++,data:"2026-12-25",fila_id:null,descricao:"Natal"},{id:seq.feriados++,data:"2027-01-01",fila_id:null,descricao:"Confraternização Universal"});
SEED.assuntos.forEach(function(s){var f=DB.filas.find(function(x){return x.codigo===s.fila;});
  DB.assuntos.push({id:seq.assuntos++,area_id:areaCod(s.area).id,fila_id:f.id,codigo:s.codigo,nome:s.nome,descricao:s.descr,icone:s.icone,ordem:s.ordem,
    documento_tipo:s.doc,documento_obrigatorio_no_encerramento:s.obrig,ativo:true});});
DB.assuntos.forEach(function(s){var d=SEED.fluxos[s.codigo];if(d)DB.fluxos.push({id:seq.fluxos++,assunto_id:s.id,versao:1,status:"publicado",definicao:JSON.parse(JSON.stringify(d)),criado_por:"carga_inicial",criado_em:iso(AGORA-40*86400000),publicado_por:"carga_inicial",publicado_em:iso(AGORA-40*86400000)});});
SEED.respostas.forEach(function(r){DB.respostas_rapidas.push({id:seq.respostas_rapidas++,area_id:null,atalho:r.atalho,titulo:r.titulo,texto:r.texto,ativo:true});});
DB.respostas_rapidas.push({id:seq.respostas_rapidas++,area_id:areaCod("PI").id,atalho:"/centro",titulo:"Confirmar centro",texto:"Pode me confirmar o centro de destino? São 4 caracteres, ex.: 1001.",ativo:true});
DB.config.push({chave:"bot_abandono_min",valor:30,descricao:"Minutos sem enviar o fluxo até o chamado em bot contar como desistência"},
  {chave:"resolvido_1o_contato_horas",valor:72,descricao:"Janela sem novo chamado do mesmo assunto para contar como resolvido no 1º contato"});

/* pessoas fictícias */
var NOMES=["Ana","Bruno","Carla","Diego","Eduarda","Felipe","Gabriela","Henrique","Isabela","João","Karina","Lucas","Mariana","Natália","Otávio","Patrícia","Rafael","Sabrina","Thiago","Vanessa","Wagner","Yasmin","Rodrigo","Letícia","André","Camila","Fernando","Juliana","Marcelo","Priscila","Renato","Tatiane","Vinícius","Aline","Caio","Débora","Gustavo","Helena","Igor","Larissa"];
var SOBRE=["Almeida","Barbosa","Cardoso","Dias","Esteves","Ferraz","Gomes","Lacerda","Machado","Nogueira","Oliveira","Pacheco","Queiroz","Rezende","Siqueira","Teixeira","Vasconcelos","Xavier","Zanetti","Moraes","Fonseca","Andrade","Brandão","Coelho","Duarte","Freitas","Guimarães","Lopes","Mendes","Pires"];
function nomePessoa(){return pick(NOMES)+" "+pick(SOBRE);}
function emailDe(n){return n.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/ /g,".")+"@araguaia.com.br";}
var UFS=["GO","MT","MS","MG","BA","TO","PR","SP","MA","PI"];
for(var i=0;i<124;i++){var uf=pick(UFS);DB.equipes_venda.push({id:seq.equipes_venda++,codigo:"EV"+String(1000+i*7),descricao:"Equipe "+uf+" "+(i+1),uf:uf,canal:pick(["Revenda","Direto","Cooperativa"]),regiao:pick(["Centro-Oeste","Norte","Nordeste","Sudeste","Sul"]),ativa:true});}
var usados={};
for(i=0;i<434;i++){var n;do{n=nomePessoa();}while(usados[n]);usados[n]=1;
  DB.solicitantes.push({id:uuid(),matricula:String(100000+Math.floor(rnd()*800000)),nome:n,email:emailDe(n),equipe_venda_id:pick(DB.equipes_venda).id,funcao:pesos({CTC:70,GERENTE:15,FATURISTA:15}),telefone:null,ativo:true,identificado_em:iso(AGORA-60*86400000)});}
/* perfis de login da prévia */
var PERFIS={admin:{nome:"Marina Siqueira",papel:"admin",area:"PI",filas:["PI_RC","PI_OV","PI_TROCA_CENTRO"]},
  supervisor:{nome:"Paulo Teixeira",papel:"supervisor",area:"OC",filas:["OC_MODIFICACAO","OC_DATA_REMESSA"]},
  atendente:{nome:"Júlia Prado",papel:"atendente",area:"PI",filas:["PI_RC","PI_OV"]}};
function filaCod(c){return DB.filas.find(function(f){return f.codigo===c;});}
Object.keys(PERFIS).forEach(function(k){var p=PERFIS[k],a={id:uuid(),email:emailDe(p.nome),nome:p.nome,matricula:null,area_id:areaCod(p.area).id,papel:p.papel,presenca:"online",presenca_desde:iso(AGORA-3600000),capacidade:5,ativo:true};
  DB.atendentes.push(a);p.id=a.id;p.email=a.email;p.filas.forEach(function(fc,i){DB.fila_atendentes.push({fila_id:filaCod(fc).id,atendente_id:a.id,prioridade:1,ativo:true});});});
var EQUIPE={PI:7,OC:10,SAC:3};
Object.keys(EQUIPE).forEach(function(ar){for(var j=0;j<EQUIPE[ar];j++){var n;do{n=nomePessoa();}while(usados[n]);usados[n]=1;
  var a={id:uuid(),email:emailDe(n),nome:n,matricula:null,area_id:areaCod(ar).id,papel:j===0&&ar!=="PI"?"supervisor":"atendente",presenca:pesos({online:6,pausa:2,offline:2}),presenca_desde:iso(AGORA-7200000),capacidade:5,ativo:true};
  DB.atendentes.push(a);
  var fs=DB.filas.filter(function(f){return f.area_id===a.area_id;});
  fs.forEach(function(f){if(fs.length<=3||rnd()<0.55)DB.fila_atendentes.push({fila_id:f.id,atendente_id:a.id,prioridade:1,ativo:true});});}});

/* ---------- histórico simulado (60 dias) ---------- */
var HORA={0:.1,1:.05,2:.05,3:.05,4:.1,5:.2,6:.8,7:3,8:8,9:14,10:13,11:10,12:4,13:5,14:9,15:10,16:13,17:8,18:3,19:1.2,20:.8,21:.5,22:.3,23:.2};
var ASSUNTO={RC:30,OV:22,TROCA_CENTRO:8,CAD_MOTORISTA:9,MODIF_PEDIDO:9,DATA_REMESSA:7,ENTREGAS:7,DOC_PAGAMENTO:5,PRODUTO_PRECO:3};
var ATEND={RC:4,OV:5,TROCA_CENTRO:9,CAD_MOTORISTA:40,MODIF_PEDIDO:55,DATA_REMESSA:18,ENTREGAS:14,DOC_PAGAMENTO:22,PRODUTO_PRECO:16};
var ESPERA={PI:1.5,OC:7,SAC:9};
var RESULT={resolvido:80,resolvido_parcial:6,nao_resolvido:4,encaminhado_outra_area:4,sem_retorno_solicitante:3,duplicado:2,fora_do_escopo:1};
function emExpediente(filaId,ms){var l=local(ms);
  if(DB.feriados.some(function(f){return f.data===l.dia&&(f.fila_id==null||f.fila_id===filaId);}))return false;
  var hm=("0"+l.h).slice(-2)+":"+("0"+l.m).slice(-2);
  return DB.horarios.some(function(h){return h.fila_id===filaId&&h.dia_semana===l.dow&&hm>=h.inicio&&hm<h.fim;});}
function proxAbertura(filaId,ms){for(var t=ms;t<ms+4*86400000;t+=10*MIN)if(emExpediente(filaId,t))return t;return ms;}
function novoProtocolo(ms){var l=local(ms);return l.dia.slice(2,4)+l.dia.slice(5,7)+"-"+String(seq.protocolo++).padStart(5,"0");}
function respostasExemplo(s){
  var d=fluxoPublicado(s.id);if(!d)return {resumo:"",itens:[],respostas:{}};
  var resp={},atual=d.definicao.inicio||d.definicao.nos[0].id,g=0;
  while(atual&&g++<50){var n=d.definicao.nos.find(function(x){return x.id===atual;});if(!n||n.tipo==="fim")break;
    if(n.tipo==="pergunta"&&(n.obrigatorio||rnd()<.5))resp[n.chave]=exemplo(n);
    atual=F.proximo(d.definicao,atual,resp);}
  try{return F.validarRespostas(d.definicao,resp);}catch(e){return {resumo:"",itens:[],respostas:{}};}
}
function exemplo(n){
  if(n.campo==="opcoes")return pick(n.opcoes);if(n.campo==="multipla")return [pick(n.opcoes)];
  if(n.campo==="sim_nao")return pick(["Sim","Não"]);if(n.campo==="data")return new Date(AGORA+(2+Math.floor(rnd()*10))*86400000).toISOString().slice(0,10);
  if(n.campo==="numero")return String(Math.round(10+rnd()*90));if(n.campo==="arquivo")return "";
  if(n.validador==="cpf")return "52998224725";if(n.validador==="placa")return pick(["RTA1B23","QWE4C56","GHT2J98"]);
  if(/centro/.test(n.chave))return pick(["1001","1002","2003","3101"]);
  if(n.campo==="documento"||/numero|material/.test(n.chave))return String(4500000000+Math.floor(rnd()*99999999)).slice(0,10);
  if(/telefone/.test(n.chave))return "64999"+String(100000+Math.floor(rnd()*899999));
  if(/cnh/.test(n.chave))return "0"+String(10000000+Math.floor(rnd()*89999999))+"5";
  if(/nome/.test(n.chave))return nomePessoa();if(/transportadora/.test(n.chave))return pick(["Rodo Cerrado","TransGoiás","Via Norte Log"]);
  if(/cliente/.test(n.chave))return pick(["Fazenda Boa Vista","Agro São Jorge","Coop. Rio Verde","1002345"]);
  return pick(["Cliente pediu urgência para esta semana.","Conferir com o comercial antes.","Item 10 do pedido.","Precisamos para o carregamento de amanhã."]);
}
function fluxoPublicado(assuntoId){return DB.fluxos.find(function(f){return f.assunto_id===assuntoId&&f.status==="publicado";});}
function membros(filaId){return DB.fila_atendentes.filter(function(x){return x.fila_id===filaId&&x.ativo;}).map(function(x){return DB.atendentes.find(function(a){return a.id===x.atendente_id;});}).filter(function(a){return a&&a.ativo;});}
var porSol={};
(function gerar(){
  var dias=62;
  for(var d=dias;d>=0;d--){
    var base=inicioDiaBR(AGORA-d*86400000),dow=local(base+12*3600000).dow;
    var vol=dow===0?3:dow===6?48:Math.round(118+rnd()*30-15);
    for(var k=0;k<vol;k++){
      var h=+pesos(HORA),ms=base+h*3600000+Math.floor(rnd()*3600000);
      if(ms>AGORA-20*MIN)continue;
      var sc=pesos(ASSUNTO),s=DB.assuntos.find(function(x){return x.codigo===sc;}),ar=DB.areas.find(function(a){return a.id===s.area_id;});
      var sol=pick(DB.solicitantes),f=DB.filas.find(function(x){return x.id===s.fila_id;});
      var bot=1+rnd()*3,fila=ms+bot*MIN,fora=!emExpediente(f.id,fila);
      var c={id:uuid(),protocolo:novoProtocolo(ms),solicitante_id:sol.id,equipe_venda_id:sol.equipe_venda_id,area_id:s.area_id,assunto_id:s.id,fila_id:f.id,fluxo_id:null,
        status:"encerrado",atendente_id:null,respostas:{},resumo:null,resumo_itens:[],prioridade:0,fora_horario:fora,criado_em:iso(ms),entrou_fila_em:iso(fila),
        assumido_em:null,primeira_resposta_em:null,encerrado_em:null,resultado:null,resultado_obs:null,documento_tipo:null,documento_numero:null,
        desistencia_em:null,desistencia_etapa:null,desistencia_motivo:null,qtd_transferencias:0,ultima_msg_em:null,ultima_msg_autor:null,_hist:true};
      var abre=fora?proxAbertura(f.id,fila):fila;
      var desist=rnd()<(ar.codigo==="SAC"?.11:.035);
      var esp=logn(ESPERA[ar.codigo],.9);
      if(desist){var dm=abre+Math.min(esp*3,240)*MIN;if(dm>AGORA){c.status="na_fila";}else{c.status="desistiu";c.desistencia_em=iso(dm);c.desistencia_etapa="fila";c.desistencia_motivo=pick([null,"Resolvi por outro canal","Demorou"]);}}
      else{
        var ass=abre+esp*MIN,at=logn(ATEND[sc],.8),enc=ass+at*MIN;
        var ms2=membros(f.id),quem=pick(ms2.length?ms2:DB.atendentes);
        if(ass>AGORA){c.status="na_fila";}
        else{c.assumido_em=iso(ass);c.atendente_id=quem.id;c.primeira_resposta_em=iso(ass+Math.min(at,1+rnd()*2)*MIN);
          if(rnd()<.06)c.qtd_transferencias=1;
          if(enc>AGORA){c.status=rnd()<.25?"aguardando_solicitante":"em_atendimento";}
          else{c.encerrado_em=iso(enc);c.resultado=pesos(RESULT);
            if(s.documento_tipo&&(c.resultado==="resolvido"||c.resultado==="resolvido_parcial")&&(s.documento_obrigatorio_no_encerramento||rnd()<.6)){c.documento_tipo=s.documento_tipo;c.documento_numero=String(4500000000+Math.floor(rnd()*99999999)).slice(0,10);}
            if(rnd()<.56){var nota=+pesos({5:62,4:22,3:9,2:4,1:3});DB.avaliacoes.push({chamado_id:c.id,nota:nota,comentario:nota<=2?pick(["Demorou muito para responder.","Precisei explicar duas vezes.","Não resolveu, tive que abrir outro."]):nota===5&&rnd()<.25?pick(["Rápido e certeiro, obrigado!","Excelente, resolveu na hora.","Muito atenciosa."]):null,criada_em:iso(enc+5*MIN)});}}}}
      var ex=respostasExemplo(s);c.respostas=ex.respostas;c.resumo=ex.resumo;c.resumo_itens=ex.itens;
      c.ultima_msg_em=c.encerrado_em||c.primeira_resposta_em||c.entrou_fila_em;c.ultima_msg_autor=c.encerrado_em?"sistema":c.primeira_resposta_em?"atendente":"bot";
      if(c.status==="aguardando_solicitante")c.ultima_msg_autor="atendente";
      if(c.status==="em_atendimento"&&rnd()<.5){c.ultima_msg_autor="solicitante";c.ultima_msg_em=iso(Math.min(AGORA-MIN,Date.parse(c.primeira_resposta_em)+3*MIN));}
      DB.chamados.push(c);(porSol[sol.id]=porSol[sol.id]||[]).push(c);
    }
  }
  /* garante uma situação de demonstração: 2 chamados comigo e fila visível */
  var eu=PERFIS.admin;
  DB.chamados.filter(function(c){return c.status==="em_atendimento"||c.status==="aguardando_solicitante";}).slice(0,0);
  var meus=DB.chamados.filter(function(c){return (c.status==="em_atendimento")&&PERFIS.admin.filas.map(filaCod).some(function(f){return f.id===c.fila_id;});}).slice(0,2);
  meus.forEach(function(c){c.atendente_id=eu.id;});
  var sup=DB.chamados.filter(function(c){return c.status==="em_atendimento"&&filaCod("OC_MODIFICACAO").id===c.fila_id;}).slice(0,1);
  sup.forEach(function(c){c.atendente_id=PERFIS.supervisor.id;});
  var jl=DB.chamados.filter(function(c){return c.status==="em_atendimento"&&c.atendente_id!==eu.id&&(c.fila_id===filaCod("PI_RC").id||c.fila_id===filaCod("PI_OV").id);}).slice(0,2);
  jl.forEach(function(c){c.atendente_id=PERFIS.atendente.id;});
  /* fila presente: alguns aguardando em cada área */
  ["PI_RC","PI_OV","OC_MOTORISTA","OC_MODIFICACAO","OC_MODIFICACAO","OC_DATA_REMESSA","SAC_DOC_PAGTO"].forEach(function(fc,i){novoChamado(fc,AGORA-(4+i*3)*MIN,true);});
})();

/* ---------- estado da sessão da prévia ---------- */
var SESS="mock.perfil";
function perfilAtual(){var p=null;try{p=sessionStorage.getItem(SESS);}catch(e){}return p&&PERFIS[p]?p:null;}
function eu(){var p=perfilAtual();if(!p)throw erro("28000","Faça login.");return DB.atendentes.find(function(a){return a.id===PERFIS[p].id;});}
function atendeChamado(c,a){a=a||eu();return a.papel==="admin"||c.atendente_id===a.id||(a.papel==="supervisor"&&a.area_id===c.area_id)||
  DB.fila_atendentes.some(function(fa){return fa.fila_id===c.fila_id&&fa.atendente_id===a.id&&fa.ativo;});}
function exigeAdmin(){if(eu().papel!=="admin")throw erro("42501","Apenas a administração da Central pode fazer isso.");}
function nomeAt(id){var a=DB.atendentes.find(function(x){return x.id===id;});return a?a.nome:null;}
function evento(c,tipo,motivo,deF,paraF,deA,paraA,quando){DB.eventos.push({id:seq.eventos++,chamado_id:c.id,tipo:tipo,motivo:motivo||null,de_fila_id:deF||null,para_fila_id:paraF||null,de_atendente_id:deA||null,para_atendente_id:paraA||null,por_email:perfilAtual()?eu().email:null,criado_em:quando||iso(Date.now())});}
function msg(c,autor,texto,o){o=o||{};var m={id:seq.mensagens++,chamado_id:c.id,autor:autor,atendente_id:o.atendente_id||null,conteudo:texto,tipo:o.tipo||"texto",anexo_path:o.anexo_path||null,anexo_nome:o.anexo_nome||null,anexo_mime:o.anexo_mime||null,interna:!!o.interna,criada_em:o.em||iso(Date.now()),lida_em:o.lida?(o.em||iso(Date.now())):null};
  DB.mensagens.push(m);if(!m.interna){c.ultima_msg_em=m.criada_em;c.ultima_msg_autor=autor;if(autor==="atendente"&&!c.primeira_resposta_em)c.primeira_resposta_em=m.criada_em;}return m;}
function carga(aid){return DB.chamados.filter(function(c){return c.atendente_id===aid&&(c.status==="em_atendimento"||c.status==="aguardando_solicitante");}).length;}
function distribuir(filaId){
  var f=DB.filas.find(function(x){return x.id===filaId;});if(!f||!f.ativa||f.distribuicao!=="automatica")return 0;var n=0;
  DB.chamados.filter(function(c){return c.fila_id===filaId&&c.status==="na_fila"&&!c.atendente_id;}).sort(ordemFila).forEach(function(c){
    var cand=membros(filaId).filter(function(a){return a.presenca==="online"&&carga(a.id)<a.capacidade;}).sort(function(a,b){return carga(a.id)-carga(b.id);});
    if(!cand.length)return;var a=cand[0];c.atendente_id=a.id;c.status="em_atendimento";c.assumido_em=c.assumido_em||iso(Date.now());
    DB.eventos.push({id:seq.eventos++,chamado_id:c.id,tipo:"atribuido",motivo:null,de_fila_id:null,para_fila_id:null,de_atendente_id:null,para_atendente_id:a.id,por_email:null,criado_em:iso(Date.now())});n++;});
  return n;}
function ordemFila(a,b){return (b.prioridade-a.prioridade)||(Date.parse(a.entrou_fila_em)-Date.parse(b.entrou_fila_em));}
function novoChamado(fc,ms,semDistribuir){
  var f=filaCod(fc),s=DB.assuntos.find(function(x){return x.fila_id===f.id;}),sol=pick(DB.solicitantes),fila=ms+2*MIN;
  var c={id:uuid(),protocolo:novoProtocolo(ms),solicitante_id:sol.id,equipe_venda_id:sol.equipe_venda_id,area_id:s.area_id,assunto_id:s.id,fila_id:f.id,fluxo_id:null,status:"na_fila",atendente_id:null,
    respostas:{},resumo:null,resumo_itens:[],prioridade:0,fora_horario:!emExpediente(f.id,fila),criado_em:iso(ms),entrou_fila_em:iso(fila),assumido_em:null,primeira_resposta_em:null,encerrado_em:null,resultado:null,resultado_obs:null,
    documento_tipo:null,documento_numero:null,desistencia_em:null,desistencia_etapa:null,desistencia_motivo:null,qtd_transferencias:0,ultima_msg_em:iso(fila),ultima_msg_autor:"bot"};
  var ex=respostasExemplo(s);c.respostas=ex.respostas;c.resumo=ex.resumo;c.resumo_itens=ex.itens;
  DB.chamados.push(c);(porSol[sol.id]=porSol[sol.id]||[]).push(c);
  if(!semDistribuir)distribuir(f.id);return c;}
/* mensagens de chamados antigos: geradas na primeira abertura, coerentes com os marcos de tempo */
function garantirMensagens(c){
  if(c._msgs)return;c._msgs=true;
  if(DB.mensagens.some(function(m){return m.chamado_id===c.id;}))return;
  var s=DB.assuntos.find(function(x){return x.id===c.assunto_id;}),sol=DB.solicitantes.find(function(x){return x.id===c.solicitante_id;});
  var t0=Date.parse(c.entrou_fila_em);
  msg(c,"bot","Pronto! Seu pedido de "+s.nome+" entrou na fila. Protocolo "+c.protocolo+".",{em:iso(t0),lida:true});
  if(c.fora_horario)msg(c,"sistema","Recebemos seu pedido fora do horário de atendimento. Ele já está na fila e será atendido assim que a equipe voltar.",{em:iso(t0+1000),lida:true});
  if(c.assumido_em){var ta=Date.parse(c.assumido_em),tr=Date.parse(c.primeira_resposta_em||c.assumido_em),aid=c.atendente_id;
    DB.eventos.push({id:seq.eventos++,chamado_id:c.id,tipo:"assumido",motivo:null,de_fila_id:null,para_fila_id:null,de_atendente_id:null,para_atendente_id:aid,por_email:null,criado_em:c.assumido_em});
    msg(c,"atendente","Olá, "+sol.nome.split(" ")[0]+"! Já estou com o seu pedido.",{em:iso(tr),atendente_id:aid,lida:true});
    var fim=c.encerrado_em?Date.parse(c.encerrado_em):AGORA-MIN;
    if(fim-tr>4*MIN){msg(c,"atendente",pick(["Pode me confirmar o centro de destino?","Conferi aqui: o item 10 está com a quantidade antiga. Qual o valor correto?","Só um momento, estou verificando no SAP."]),{em:iso(tr+(fim-tr)*.3),atendente_id:aid,lida:true});
      msg(c,"solicitante",pick(["É o 1002.","Pode ser 45 t.","Ok, aguardo.","Isso mesmo, obrigado."]),{em:iso(tr+(fim-tr)*.5),lida:!!c.encerrado_em});}
    if(c.status==="em_atendimento"&&c.ultima_msg_autor==="solicitante")msg(c,"solicitante",pick(["Conseguiu ver?","Preciso disso até as 16h, pode ser?","Mandei o número certo agora: 4501239876"]),{em:c.ultima_msg_em,lida:false});
    if(c.encerrado_em){msg(c,"atendente",pick(["Pronto, está feito!","Ajustado no sistema. Qualquer coisa me chama.","Feito! A OV já está liberada."]),{em:iso(fim-30000),atendente_id:aid,lida:true});
      msg(c,"sistema","Atendimento encerrado. Como foi? Avalie de 1 a 5.",{em:c.encerrado_em,lida:true});
      DB.eventos.push({id:seq.eventos++,chamado_id:c.id,tipo:"encerrado",motivo:c.resultado,de_fila_id:null,para_fila_id:null,de_atendente_id:null,para_atendente_id:null,por_email:null,criado_em:c.encerrado_em});}}
  if(c.status==="desistiu")DB.eventos.push({id:seq.eventos++,chamado_id:c.id,tipo:"desistencia",motivo:c.desistencia_motivo||"saiu da fila",de_fila_id:null,para_fila_id:null,de_atendente_id:null,para_atendente_id:null,por_email:null,criado_em:c.desistencia_em});
  DB.eventos.unshift({id:0,chamado_id:c.id,tipo:"entrou_fila",motivo:null,de_fila_id:null,para_fila_id:c.fila_id,de_atendente_id:null,para_atendente_id:null,por_email:null,criado_em:c.entrou_fila_em});
}
/* ---------- JSON de saída (iguais ao chamado_json do banco) ---------- */
function chamadoJson(c){
  var ar=DB.areas.find(function(x){return x.id===c.area_id;}),s=DB.assuntos.find(function(x){return x.id===c.assunto_id;}),f=DB.filas.find(function(x){return x.id===c.fila_id;}),
      so=DB.solicitantes.find(function(x){return x.id===c.solicitante_id;}),e=DB.equipes_venda.find(function(x){return x.id===c.equipe_venda_id;}),
      av=DB.avaliacoes.find(function(x){return x.chamado_id===c.id;}),a=DB.atendentes.find(function(x){return x.id===c.atendente_id;});
  var pos=null,est=null;
  if(c.status==="na_fila"){pos=1+DB.chamados.filter(function(o){return o.fila_id===c.fila_id&&o.status==="na_fila"&&ordemFila(o,c)<0;}).length;
    var ult=DB.chamados.filter(function(o){return o.fila_id===c.fila_id&&o.assumido_em&&o.entrou_fila_em;}).slice(-50);
    est=ult.length?Math.ceil(ult.reduce(function(t,o){return t+(Date.parse(o.assumido_em)-Date.parse(o.entrou_fila_em));},0)/ult.length/MIN):null;}
  return {id:c.id,protocolo:c.protocolo,status:c.status,area:{id:ar.id,codigo:ar.codigo,nome:ar.nome},
    assunto:{id:s.id,codigo:s.codigo,nome:s.nome,documento_tipo:s.documento_tipo,documento_obrigatorio:s.documento_obrigatorio_no_encerramento},
    fila:{id:f.id,nome:f.nome},solicitante:{id:so.id,nome:so.nome,matricula:so.matricula,equipe:e?e.codigo+(e.descricao?" · "+e.descricao:""):null},
    atendente:a?{id:a.id,nome:a.nome}:null,respostas:c.respostas,resumo:c.resumo,resumo_itens:c.resumo_itens,prioridade:c.prioridade,fora_horario:c.fora_horario,
    posicao_fila:pos,espera_estimada_min:est,
    criado_em:c.criado_em,entrou_fila_em:c.entrou_fila_em,assumido_em:c.assumido_em,primeira_resposta_em:c.primeira_resposta_em,encerrado_em:c.encerrado_em,
    espera_seg:c.assumido_em?Math.round((Date.parse(c.assumido_em)-Date.parse(c.entrou_fila_em))/1000):null,
    atendimento_seg:c.encerrado_em&&c.assumido_em?Math.round((Date.parse(c.encerrado_em)-Date.parse(c.assumido_em))/1000):null,
    resultado:c.resultado,resultado_obs:c.resultado_obs,documento_tipo:c.documento_tipo,documento_numero:c.documento_numero,qtd_transferencias:c.qtd_transferencias,
    ultima_msg_em:c.ultima_msg_em,ultima_msg_autor:c.ultima_msg_autor,avaliacao:av?{nota:av.nota,comentario:av.comentario}:null,sou_dono:false,sou_atendente:atendeChamado(c)};
}
function naoLidas(c){garantirMensagensSeAberto(c);return DB.mensagens.filter(function(m){return m.chamado_id===c.id&&m.autor==="solicitante"&&!m.lida_em;}).length;}
function garantirMensagensSeAberto(c){if(c.status==="em_atendimento"||c.status==="aguardando_solicitante")garantirMensagens(c);}
function chamado(id){var c=DB.chamados.find(function(x){return x.id===id;});if(!c||!atendeChamado(c))throw erro("42501","Chamado não encontrado.");return c;}
function txt(v){return v==null?"":String(v).trim();}

/* ---------- funções ca_* ---------- */
var API={
  ca_sessao:function(){var a=eu();return {email:a.email,nome:a.nome,solicitante:null,
    atendente:{id:a.id,nome:a.nome,papel:a.papel,presenca:a.presenca,capacidade:a.capacidade,area_id:a.area_id,
      filas:DB.fila_atendentes.filter(function(x){return x.atendente_id===a.id&&x.ativo;}).map(function(x){var f=DB.filas.find(function(y){return y.id===x.fila_id;});return {id:f.id,codigo:f.codigo,nome:f.nome,area_id:f.area_id};})},
    admin:a.papel==="admin",precisa_identificar:false};},
  ca_presenca:function(p){var a=eu();if(["online","pausa","offline"].indexOf(p.p_presenca)<0)throw erro("23514","Status inválido.");
    a.presenca=p.p_presenca;a.presenca_desde=iso(Date.now());if(a.presenca==="online")DB.fila_atendentes.filter(function(x){return x.atendente_id===a.id&&x.ativo;}).forEach(function(x){distribuir(x.fila_id);});return API.ca_sessao();},
  ca_painel_atendente:function(){var a=eu();
    var fs=DB.filas.filter(function(f){return f.ativa&&(a.papel==="admin"||(a.papel==="supervisor"&&f.area_id===a.area_id)||DB.fila_atendentes.some(function(x){return x.fila_id===f.id&&x.atendente_id===a.id&&x.ativo;}));});
    return {eu:{id:a.id,nome:a.nome,papel:a.papel,presenca:a.presenca,capacidade:a.capacidade},
      filas:fs.sort(function(x,y){return x.nome<y.nome?-1:1;}).map(function(f){var q=DB.chamados.filter(function(c){return c.fila_id===f.id&&c.status==="na_fila";});
        return {id:f.id,nome:f.nome,area_id:f.area_id,em_expediente:emExpediente(f.id,Date.now()),na_fila:q.length,mais_antigo_em:q.length?q.map(function(c){return c.entrou_fila_em;}).sort()[0]:null,
          online:membros(f.id).filter(function(m){return m.presenca==="online";}).length};}),
      meus:DB.chamados.filter(function(c){return c.atendente_id===a.id&&(c.status==="em_atendimento"||c.status==="aguardando_solicitante");})
        .sort(function(x,y){return Date.parse(y.ultima_msg_em||0)-Date.parse(x.ultima_msg_em||0);}).map(function(c){var j=chamadoJson(c);j.nao_lidas=naoLidas(c);return j;}),
      fila:DB.chamados.filter(function(c){return c.status==="na_fila"&&atendeChamado(c,a);}).sort(ordemFila).slice(0,200).map(chamadoJson)};},
  ca_console_contexto:function(){eu();
    return {areas:DB.areas.map(function(a){return {id:a.id,codigo:a.codigo,nome:a.nome,ordem:a.ordem,ativa:a.ativa};}),
      filas:DB.filas.map(function(f){return {id:f.id,codigo:f.codigo,nome:f.nome,area_id:f.area_id,sla_espera_min:f.sla_espera_min,sla_atendimento_min:f.sla_atendimento_min,ativa:f.ativa};}),
      assuntos:DB.assuntos.map(function(s){return {id:s.id,codigo:s.codigo,nome:s.nome,area_id:s.area_id,fila_id:s.fila_id,documento_tipo:s.documento_tipo,documento_obrigatorio:s.documento_obrigatorio_no_encerramento,ativo:s.ativo};}),
      atendentes:DB.atendentes.filter(function(a){return a.ativo;}).sort(function(a,b){return a.nome<b.nome?-1:1;}).map(function(a){return {id:a.id,nome:a.nome,papel:a.papel,presenca:a.presenca,area_id:a.area_id,capacidade:a.capacidade,
        filas:DB.fila_atendentes.filter(function(x){return x.atendente_id===a.id&&x.ativo;}).map(function(x){return x.fila_id;}),em_atendimento:carga(a.id)};}),
      respostas_rapidas:API.ca_respostas_rapidas()};},
  ca_console_lista:function(p){var a=eu();
    if(p.p_visao==="equipe"){if(a.papel==="atendente")throw erro("42501","Acesso restrito a supervisores e administração.");
      return DB.chamados.filter(function(c){return (c.status==="em_atendimento"||c.status==="aguardando_solicitante")&&atendeChamado(c,a);}).sort(function(x,y){return Date.parse(y.ultima_msg_em||0)-Date.parse(x.ultima_msg_em||0);}).slice(0,500).map(chamadoJson);}
    if(p.p_visao==="encerrados_hoje"){var h=inicioDiaBR(Date.now());
      return DB.chamados.filter(function(c){var fim=c.encerrado_em||c.desistencia_em;return (c.status==="encerrado"||c.status==="desistiu")&&fim&&Date.parse(fim)>=h&&(c.atendente_id===a.id||(a.papel!=="atendente"&&atendeChamado(c,a)));})
        .sort(function(x,y){return Date.parse(y.encerrado_em||y.desistencia_em)-Date.parse(x.encerrado_em||x.desistencia_em);}).slice(0,500).map(function(c){var j=chamadoJson(c);j.desistencia_em=c.desistencia_em;return j;});}
    throw erro("23514","Visão desconhecida: "+p.p_visao);},
  ca_chamado:function(p){var c=chamado(p.p_chamado);garantirMensagens(c);
    var j=chamadoJson(c);
    j.mensagens=DB.mensagens.filter(function(m){return m.chamado_id===c.id;}).sort(function(a,b){return a.id-b.id;}).map(function(m){return {id:m.id,autor:m.autor,atendente:nomeAt(m.atendente_id),conteudo:m.conteudo,tipo:m.tipo,anexo_path:m.anexo_path,anexo_nome:m.anexo_nome,anexo_mime:m.anexo_mime,interna:m.interna,criada_em:m.criada_em,lida_em:m.lida_em};});
    j.eventos=DB.eventos.filter(function(e){return e.chamado_id===c.id;}).sort(function(a,b){return Date.parse(a.criado_em)-Date.parse(b.criado_em);}).map(function(e){
      var fn=function(id){var f=DB.filas.find(function(x){return x.id===id;});return f?f.nome:null;};
      return {tipo:e.tipo,motivo:e.motivo,criado_em:e.criado_em,por_email:e.por_email,de_fila:fn(e.de_fila_id),para_fila:fn(e.para_fila_id),de_atendente:nomeAt(e.de_atendente_id),para_atendente:nomeAt(e.para_atendente_id)};});
    j.historico_solicitante=(porSol[c.solicitante_id]||[]).filter(function(h){return h.id!==c.id;}).sort(function(a,b){return Date.parse(b.criado_em)-Date.parse(a.criado_em);}).slice(0,10).map(function(h){
      return {id:h.id,protocolo:h.protocolo,assunto:DB.assuntos.find(function(s){return s.id===h.assunto_id;}).nome,status:h.status,resultado:h.resultado,criado_em:h.criado_em,documento_numero:h.documento_numero};});
    return j;},
  ca_enviar_mensagem:function(p){var c=chamado(p.p_chamado),a=eu();
    if(c.status==="encerrado"||c.status==="desistiu")throw erro("23514","Este chamado está encerrado. Abra um novo pelo menu.");
    if(!txt(p.p_conteudo)&&!p.p_anexo)throw erro("23514","Mensagem vazia.");
    if(!p.p_interna){if(c.status==="na_fila"){c.atendente_id=a.id;c.status="em_atendimento";c.assumido_em=c.assumido_em||iso(Date.now());evento(c,"assumido",null,null,null,null,a.id);}
      else if(c.atendente_id!==a.id&&a.papel==="atendente")throw erro("42501","Este chamado está com outro atendente.");}
    var an=p.p_anexo||{};var m=msg(c,"atendente",txt(p.p_conteudo)||null,{atendente_id:a.id,interna:!!p.p_interna,anexo_path:an.path,anexo_nome:an.nome,anexo_mime:an.mime,tipo:an.path?(/^image\//.test(an.mime||"")?"imagem":"arquivo"):"texto"});
    if(!p.p_interna)simularResposta(c);
    return {id:m.id,autor:"atendente",criada_em:m.criada_em};},
  ca_marcar_lidas:function(p){var c=chamado(p.p_chamado),n=0;DB.mensagens.forEach(function(m){if(m.chamado_id===c.id&&!m.lida_em&&m.autor==="solicitante"){m.lida_em=iso(Date.now());n++;}});return n;},
  ca_assumir:function(p){var c=chamado(p.p_chamado),a=eu();if(c.status!=="na_fila")throw erro("23514","Este chamado já foi assumido ou encerrado.");
    c.atendente_id=a.id;c.status="em_atendimento";c.assumido_em=c.assumido_em||iso(Date.now());evento(c,"assumido",null,null,null,null,a.id);return chamadoJson(c);},
  ca_proximo:function(){var a=eu();var c=DB.chamados.filter(function(c){return c.status==="na_fila"&&DB.fila_atendentes.some(function(x){return x.fila_id===c.fila_id&&x.atendente_id===a.id&&x.ativo;});}).sort(ordemFila)[0];
    if(!c)return null;return API.ca_assumir({p_chamado:c.id});},
  ca_aguardar_solicitante:function(p){var c=chamado(p.p_chamado),a=eu();if(c.atendente_id!==a.id)throw erro("42501","Assuma o chamado antes.");
    if(!txt(p.p_mensagem))throw erro("23514","Escreva o que falta para o consultor.");
    msg(c,"atendente",txt(p.p_mensagem),{atendente_id:a.id});c.status="aguardando_solicitante";evento(c,"aguardando_solicitante",txt(p.p_mensagem));simularResposta(c);return chamadoJson(c);},
  ca_transferir:function(p){var c=chamado(p.p_chamado);
    if(["na_fila","em_atendimento","aguardando_solicitante"].indexOf(c.status)<0)throw erro("23514","Este chamado não pode ser transferido.");
    if(!txt(p.p_motivo))throw erro("23514","Informe o motivo da transferência.");
    var antes=c.atendente_id,deF=c.fila_id;
    if(p.p_fila&&p.p_fila!==c.fila_id){var f=DB.filas.find(function(x){return x.id===p.p_fila&&x.ativa;});if(!f)throw erro("23503","Fila de destino inválida.");
      if(p.p_atendente&&!DB.fila_atendentes.some(function(x){return x.fila_id===f.id&&x.atendente_id===p.p_atendente&&x.ativo;}))throw erro("23514","O atendente escolhido não atende a fila de destino.");
      c.fila_id=f.id;c.area_id=f.area_id;c.atendente_id=p.p_atendente||null;c.status=p.p_atendente?"em_atendimento":"na_fila";c.qtd_transferencias++;
      if(!p.p_atendente)c.entrou_fila_em=c.entrou_fila_em; evento(c,"transferencia",p.p_motivo,deF,f.id,antes,p.p_atendente);
      msg(c,"sistema","Seu pedido foi transferido para "+f.nome+".");if(!p.p_atendente)distribuir(f.id);}
    else if(p.p_atendente){var para=DB.atendentes.find(function(x){return x.id===p.p_atendente&&x.ativo;});
      if(!para||!DB.fila_atendentes.some(function(x){return x.fila_id===c.fila_id&&x.atendente_id===para.id&&x.ativo;}))throw erro("23514","O atendente escolhido não atende esta fila.");
      c.atendente_id=para.id;c.status="em_atendimento";c.assumido_em=c.assumido_em||iso(Date.now());c.qtd_transferencias++;evento(c,"repasse",p.p_motivo,c.fila_id,c.fila_id,antes,para.id);}
    else throw erro("23514","Escolha a fila ou o atendente de destino.");
    if(antes)distribuir(deF);return chamadoJson(c);},
  ca_devolver_fila:function(p){var c=chamado(p.p_chamado);if(["em_atendimento","aguardando_solicitante"].indexOf(c.status)<0)throw erro("23514","Este chamado não está em atendimento.");
    if(!txt(p.p_motivo))throw erro("23514","Informe o motivo.");var antes=c.atendente_id;c.atendente_id=null;c.status="na_fila";evento(c,"devolvido_fila",p.p_motivo,c.fila_id,c.fila_id,antes,null);distribuir(c.fila_id);return chamadoJson(c);},
  ca_encerrar:function(p){var c=chamado(p.p_chamado);
    if(["na_fila","em_atendimento","aguardando_solicitante"].indexOf(c.status)<0)throw erro("23514","Este chamado já foi encerrado.");
    if(Object.keys(RESULT).indexOf(p.p_resultado)<0)throw erro("23514","Escolha o resultado do atendimento.");
    var s=DB.assuntos.find(function(x){return x.id===c.assunto_id;});
    if(s.documento_obrigatorio_no_encerramento&&(p.p_resultado==="resolvido"||p.p_resultado==="resolvido_parcial")&&!txt(p.p_documento_numero))throw erro("23514","Informe o nº do documento ("+(s.documento_tipo||"documento")+").");
    c.status="encerrado";c.resultado=p.p_resultado;c.resultado_obs=txt(p.p_obs)||null;c.documento_numero=txt(p.p_documento_numero)||null;
    c.documento_tipo=p.p_documento_tipo||(c.documento_numero?s.documento_tipo:null);c.atendente_id=c.atendente_id||eu().id;c.assumido_em=c.assumido_em||iso(Date.now());c.encerrado_em=iso(Date.now());
    evento(c,"encerrado",p.p_resultado);msg(c,"sistema","Atendimento encerrado. Como foi? Avalie de 1 a 5.");distribuir(c.fila_id);
    var cc=c;setTimeout(function(){if(rnd()<.7&&!DB.avaliacoes.some(function(x){return x.chamado_id===cc.id;}))DB.avaliacoes.push({chamado_id:cc.id,nota:+pesos({5:70,4:20,3:10}),comentario:null,criada_em:iso(Date.now())});},8000);
    return chamadoJson(c);},
  ca_prioridade:function(p){var a=eu(),c=chamado(p.p_chamado);if(a.papel==="atendente")throw erro("42501","Só supervisores mudam a prioridade.");
    c.prioridade=Math.max(0,Math.min(9,+p.p_prioridade||0));evento(c,"prioridade",p.p_motivo||String(c.prioridade));return chamadoJson(c);},
  ca_respostas_rapidas:function(){var a=eu();return DB.respostas_rapidas.filter(function(r){return r.ativo&&(r.area_id==null||r.area_id===a.area_id||a.papel==="admin");}).sort(function(x,y){return x.atalho<y.atalho?-1:1;})
    .map(function(r){return {id:r.id,atalho:r.atalho,titulo:r.titulo,texto:r.texto,area_id:r.area_id};});},
  ca_admin_listar:function(p){exigeAdmin();if(!DB[p.p_entidade]||["chamados","mensagens","eventos","avaliacoes","fluxos"].indexOf(p.p_entidade)>=0)throw erro("23514","Cadastro desconhecido: "+p.p_entidade);
    return JSON.parse(JSON.stringify(DB[p.p_entidade]));},
  ca_admin_salvar:function(p){exigeAdmin();var t=p.p_entidade,d=p.p_dados,L=DB[t];
    if(!L||["chamados","mensagens","eventos","avaliacoes","fluxos"].indexOf(t)>=0)throw erro("23514","Cadastro desconhecido: "+t);
    var pk=t==="fila_atendentes"?["fila_id","atendente_id"]:t==="config"?["chave"]:["id"];
    var ex=pk.every(function(k){return d[k]!=null;})?L.find(function(r){return pk.every(function(k){return r[k]===d[k];});}):null;
    validarRegistro(t,d,ex);
    if(ex){Object.keys(d).forEach(function(k){if(pk.indexOf(k)<0)ex[k]=d[k];});return JSON.parse(JSON.stringify(ex));}
    var novo=Object.assign(padrao(t),d);if(pk[0]==="id"&&novo.id==null)novo.id=t==="atendentes"||t==="solicitantes"?uuid():seq[t]++;
    L.push(novo);return JSON.parse(JSON.stringify(novo));},
  ca_admin_remover:function(p){exigeAdmin();var t=p.p_entidade,k=p.p_chave,L=DB[t],n=L?L.length:0;
    if(t==="fila_atendentes")DB[t]=L.filter(function(r){return !(r.fila_id===k.fila_id&&r.atendente_id===k.atendente_id);});
    else if(["horarios","feriados","respostas_rapidas"].indexOf(t)>=0)DB[t]=L.filter(function(r){return r.id!==k.id;});
    else throw erro("23514","Este cadastro não se apaga; marque como inativo.");return n-DB[t].length;},
  ca_admin_fluxos:function(p){exigeAdmin();return DB.fluxos.filter(function(f){return f.assunto_id===p.p_assunto;}).sort(function(a,b){return b.versao-a.versao;}).map(function(f){return JSON.parse(JSON.stringify(f));});},
  ca_admin_fluxo_salvar:function(p){exigeAdmin();F.validarDefinicao(p.p_definicao);
    var r=DB.fluxos.filter(function(f){return f.assunto_id===p.p_assunto&&f.status==="rascunho";}).sort(function(a,b){return b.versao-a.versao;})[0];
    if(!r){var mx=Math.max.apply(null,[0].concat(DB.fluxos.filter(function(f){return f.assunto_id===p.p_assunto;}).map(function(f){return f.versao;})));
      r={id:seq.fluxos++,assunto_id:p.p_assunto,versao:mx+1,status:"rascunho",definicao:null,criado_por:eu().email,criado_em:iso(Date.now()),publicado_por:null,publicado_em:null};DB.fluxos.push(r);}
    r.definicao=JSON.parse(JSON.stringify(p.p_definicao));r.criado_por=eu().email;return JSON.parse(JSON.stringify(r));},
  ca_admin_fluxo_publicar:function(p){exigeAdmin();var f=DB.fluxos.find(function(x){return x.id===p.p_fluxo;});if(!f)throw erro("23503","Fluxo não encontrado.");
    F.validarDefinicao(f.definicao);DB.fluxos.forEach(function(x){if(x.assunto_id===f.assunto_id&&x.status==="publicado"&&x.id!==f.id)x.status="arquivado";});
    f.status="publicado";f.publicado_por=eu().email;f.publicado_em=iso(Date.now());return JSON.parse(JSON.stringify(f));},
  ca_fluxo_simular:function(p){eu();F.validarDefinicao(p.p_definicao);return F.validarRespostas(p.p_definicao,p.p_respostas);},
  ca_admin_chamados:function(p){var a=eu();if(a.papel==="atendente")throw erro("42501","Acesso restrito a supervisores e administração.");
    var de=Date.parse(p.p_de+"T00:00:00-03:00"),ate=Date.parse(p.p_ate+"T00:00:00-03:00")+86400000,H=72*3600000;
    var l=DB.chamados.filter(function(c){var t=Date.parse(c.criado_em);return t>=de&&t<ate&&c.status!=="bot"&&(!p.p_area||c.area_id===p.p_area)&&(a.papel==="admin"||c.area_id===a.area_id);})
      .sort(function(x,y){return (Date.parse(x.criado_em)-Date.parse(y.criado_em))||(x.id<y.id?-1:1);});
    var lim=Math.min(Math.max(p.p_limite||1000,1),1000),off=Math.max(p.p_offset||0,0);
    return l.slice(off,off+lim).map(function(c){var j=chamadoJson(c),av=j.avaliacao,so=DB.solicitantes.find(function(x){return x.id===c.solicitante_id;}),e=DB.equipes_venda.find(function(x){return x.id===c.equipe_venda_id;});
      var r1=c.status==="encerrado"&&c.resultado==="resolvido"&&!(porSol[c.solicitante_id]||[]).some(function(d){return d.id!==c.id&&d.assunto_id===c.assunto_id&&Date.parse(d.criado_em)>Date.parse(c.criado_em)&&Date.parse(d.criado_em)<=Date.parse(c.encerrado_em)+H;});
      return {id:c.id,protocolo:c.protocolo,status:c.status,area_id:c.area_id,fila_id:c.fila_id,assunto_id:c.assunto_id,atendente_id:c.atendente_id,solicitante_id:c.solicitante_id,
        area:j.area.nome,assunto:j.assunto.nome,fila:j.fila.nome,matricula:so.matricula,solicitante:so.nome,equipe:e?e.codigo:null,atendente:nomeAt(c.atendente_id),
        criado_em:c.criado_em,entrou_fila_em:c.entrou_fila_em,assumido_em:c.assumido_em,primeira_resposta_em:c.primeira_resposta_em,encerrado_em:c.encerrado_em,desistencia_em:c.desistencia_em,
        espera_seg:j.espera_seg,atendimento_seg:j.atendimento_seg,total_seg:c.encerrado_em?Math.round((Date.parse(c.encerrado_em)-Date.parse(c.entrou_fila_em))/1000):null,
        fora_horario:c.fora_horario,resultado:c.resultado,documento_tipo:c.documento_tipo,documento_numero:c.documento_numero,qtd_transferencias:c.qtd_transferencias,
        desistencia_etapa:c.desistencia_etapa,nota:av?av.nota:null,comentario:av?av.comentario:null,resolvido_1o_contato:r1};});}
};
function padrao(t){return {areas:{ativa:true,ordem:0},filas:{ativa:true,distribuicao:"automatica"},assuntos:{ativo:true,ordem:0,documento_obrigatorio_no_encerramento:false},atendentes:{ativo:true,papel:"atendente",presenca:"offline",capacidade:5},
  solicitantes:{ativo:true},respostas_rapidas:{ativo:true},fila_atendentes:{ativo:true,prioridade:1},equipes_venda:{ativa:true}}[t]||{};}
/* restrições das tabelas (checks e unique das migrações) */
function validarRegistro(t,d,ex){
  function un(campo){if(d[campo]==null)return;if(DB[t].some(function(r){return r!==ex&&r[campo]===d[campo];}))throw erro("23505","Já existe um registro com esses dados.");}
  if(t==="areas"){if(d.codigo!=null&&!/^[A-Z0-9_]{2,20}$/.test(d.codigo))throw erro("23514","Valor fora do permitido. Confira os campos.");un("codigo");}
  if(t==="filas"||t==="assuntos"){if(d.codigo!=null&&!/^[A-Z0-9_]{2,30}$/.test(d.codigo))throw erro("23514","Valor fora do permitido. Confira os campos.");un("codigo");}
  if(t==="atendentes"){if(d.email!=null&&d.email!==String(d.email).toLowerCase())throw erro("23514","Valor fora do permitido. Confira os campos.");un("email");
    if(d.capacidade!=null&&(d.capacidade<1||d.capacidade>50))throw erro("23514","Valor fora do permitido. Confira os campos.");}
  if(t==="solicitantes"){if(d.matricula!=null&&!/^[0-9A-Za-z]{3,20}$/.test(d.matricula))throw erro("23514","Valor fora do permitido. Confira os campos.");un("matricula");}
  if(t==="respostas_rapidas"&&d.atalho!=null&&!/^\/[a-z0-9_-]{2,30}$/.test(d.atalho))throw erro("23514","Valor fora do permitido. Confira os campos.");
  if(t==="horarios"&&d.inicio&&d.fim&&d.fim<=d.inicio)throw erro("23514","Valor fora do permitido. Confira os campos.");
}
/* consultor "responde" alguns segundos depois */
function simularResposta(c){
  var dono=c.atendente_id;
  setTimeout(function(){if(c.status!=="em_atendimento"&&c.status!=="aguardando_solicitante")return;
    msg(c,"solicitante",pick(["Ok, obrigado!","É o 1002.","Pode ser amanhã cedo?","Mandei a foto agora.","Perfeito.","O número certo é 4501239876."]));
    if(c.status==="aguardando_solicitante"){c.status="em_atendimento";evento(c,"retomado");}},6000+rnd()*6000);
}
/* movimento da prévia: chega chamado novo e colegas assumem */
setInterval(function(){if(!perfilAtual())return;
  if(rnd()<.6)novoChamado(pick(["PI_RC","PI_OV","PI_RC","OC_MOTORISTA","OC_MODIFICACAO","OC_ENTREGAS","SAC_PRODUTO_PRECO"]),Date.now()-2*MIN);
  if(rnd()<.4){var q=DB.chamados.filter(function(c){return c.status==="na_fila";}).sort(ordemFila)[0];
    if(q){var ms=membros(q.fila_id).filter(function(m){return m.presenca==="online"&&!Object.keys(PERFIS).some(function(k){return PERFIS[k].id===m.id;});});
      if(ms.length){var m=pick(ms);q.atendente_id=m.id;q.status="em_atendimento";q.assumido_em=iso(Date.now());}}}
},20000);

window.MOCK={
  rpc:function(nome,args){return new Promise(function(ok,falha){setTimeout(function(){
    try{var f=API[nome];if(!f)throw erro("PGRST202","Função "+nome+" não existe.");var r=f(args||{});ok(r==null?null:JSON.parse(JSON.stringify(r)));}catch(e){falha(e);}},60);});},
  entrarMicrosoft:function(){var p=(new URLSearchParams(location.search)).get("perfil")||"admin";try{sessionStorage.setItem(SESS,PERFIS[p]?p:"admin");}catch(e){}return Promise.resolve();},
  logado:function(){return !!perfilAtual();},
  sair:function(){try{sessionStorage.removeItem(SESS);}catch(e){}},
  perfis:PERFIS,DB:DB
};
})();
