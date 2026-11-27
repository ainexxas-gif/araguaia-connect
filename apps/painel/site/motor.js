/* Motor de indicadores: única definição de cada número do painel.
   Usado pela tela e pelos testes (tests/motor.test.js lê este mesmo arquivo).
   Entrada: linhas compactas devolvidas por indicadores(de, ate). */
(function(raiz){
"use strict";
var LIMITE_30=30;
function mins(a,b){if(!a||!b)return null;return (new Date(b)-new Date(a))/60000;}
function mediana(v){v=v.filter(function(x){return x!=null&&!isNaN(x);}).sort(function(a,b){return a-b;});
  if(!v.length)return null;var m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;}
function pctl(v,p){v=v.filter(function(x){return x!=null;}).sort(function(a,b){return a-b;});if(!v.length)return null;
  return v[Math.min(v.length-1,Math.floor(p*(v.length-1)+0.5))];}
function media(v){v=v.filter(function(x){return x!=null;});if(!v.length)return null;return v.reduce(function(a,b){return a+b;},0)/v.length;}
var TZ="America/Sao_Paulo";
var fmtHora=new Intl.DateTimeFormat("pt-BR",{timeZone:TZ,hour:"2-digit",hourCycle:"h23",weekday:"short",year:"numeric",month:"2-digit",day:"2-digit"});
var DIAS={"dom.":0,"seg.":1,"ter.":2,"qua.":3,"qui.":4,"sex.":5,"sáb.":6};
function partes(iso){var o={};fmtHora.formatToParts(new Date(iso)).forEach(function(p){o[p.type]=p.value;});
  return {h:+o.hour,dow:DIAS[o.weekday]!=null?DIAS[o.weekday]:new Date(iso).getDay(),dia:o.year+"-"+o.month+"-"+o.day};}

/* linhas de ca_admin_chamados → tempos em minutos e marcadores.
   As definições seguem ca_indicadores (banco): os números do painel batem com os do servidor. */
function preparar(linhas){
  return (linhas||[]).map(function(c){
    var o=Object.assign({},c);
    o.espera=c.espera_seg==null?null:c.espera_seg/60;          /* entrou na fila → assumido */
    o.atend=c.atendimento_seg==null?null:c.atendimento_seg/60; /* assumido → encerrado */
    o.aberto=c.total_seg==null?null:c.total_seg/60;            /* entrou na fila → encerrado */
    o.resp1=mins(c.entrou_fila_em,c.primeira_resposta_em);     /* fila → 1ª resposta de atendente */
    o.encerrado=c.status==="encerrado";
    o.desist=c.status==="desistiu";
    o.avaliacao=c.nota;
    var p=partes(c.criado_em);o.h=p.h;o.dow=p.dow;o.dia=p.dia;
    return o;
  });
}
function filtrar(rows,f){
  return rows.filter(function(r){
    for(var k in f){if(!Object.prototype.hasOwnProperty.call(f,k))continue;var v=f[k];if(!v||!v.length)continue;
      if(v.indexOf(r[k])<0)return false;}
    return true;
  });
}
/* resumo de um conjunto (mesmas regras de ca_indicadores) */
function resumo(rows){
  var enc=rows.filter(function(r){return r.encerrado;}),aval=rows.filter(function(r){return r.avaliacao!=null;});
  function frac(n,d){return d?n/d:null;}
  return {
    total:rows.length,encerrados:enc.length,
    desistencias:rows.filter(function(r){return r.desist;}).length,
    solicitantes:Object.keys(rows.reduce(function(m,r){m[r.solicitante_id]=1;return m;},{})).length,
    esperaMed:mediana(rows.map(function(r){return r.espera;})),
    esperaP90:pctl(rows.map(function(r){return r.espera;}),0.9),
    atendMed:mediana(rows.map(function(r){return r.atend;})),
    resp1Med:mediana(rows.map(function(r){return r.resp1;})),
    abertoMed:mediana(enc.map(function(r){return r.aberto;})),
    abertoSoma:rows.reduce(function(a,r){return a+(r.aberto||0);},0),
    ate30:frac(enc.filter(function(r){return r.aberto!=null&&r.aberto<=LIMITE_30;}).length,enc.length),
    fcr:frac(rows.filter(function(r){return r.resolvido_1o_contato;}).length,enc.length),
    desist:frac(rows.filter(function(r){return r.desist;}).length,rows.length),
    avalMedia:media(aval.map(function(r){return r.avaliacao;})),
    avalResp:frac(aval.length,enc.length),avalN:aval.length,
    comDoc:frac(enc.filter(function(r){return r.documento_numero;}).length,enc.length),
    transf:frac(rows.filter(function(r){return r.qtd_transferencias>0;}).length,rows.length),
    foraHorario:frac(rows.filter(function(r){return r.fora_horario;}).length,rows.length)
  };
}
function agrupar(rows,chave){
  var m={};rows.forEach(function(r){var k=r[chave];if(k==null)k="—";(m[k]=m[k]||[]).push(r);});
  return Object.keys(m).map(function(k){var s=resumo(m[k]);s.chave=k;return s;}).sort(function(a,b){return b.total-a.total;});
}
function mapaHora(rows){
  var g=[];for(var d=0;d<7;d++){g.push(new Array(24).fill(0));}
  rows.forEach(function(r){g[r.dow][r.h]++;});return g;
}
function serieDia(rows,de,ate){
  var m={};rows.forEach(function(r){m[r.dia]=(m[r.dia]||0)+1;});
  var out=[],d=new Date(de+"T12:00:00"),fim=new Date(ate+"T12:00:00");
  while(d<=fim){var k=d.toISOString().slice(0,10);out.push({dia:k,n:m[k]||0});d.setDate(d.getDate()+1);}
  return out;
}
function distrib(rows,campo){var m={};rows.forEach(function(r){var k=r[campo];if(k==null)return;m[k]=(m[k]||0)+1;});return m;}

var M={LIMITE_30:LIMITE_30,preparar:preparar,filtrar:filtrar,resumo:resumo,agrupar:agrupar,
  mapaHora:mapaHora,serieDia:serieDia,distrib:distrib,mediana:mediana,mins:mins,partes:partes};
if(typeof module!=="undefined"&&module.exports)module.exports=M;else raiz.MOTOR=M;
})(typeof window!=="undefined"?window:globalThis);
