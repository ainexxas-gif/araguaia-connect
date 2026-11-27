/* Painel de indicadores: espera separada do atendimento, 1º contato, picos por hora, desistência, avaliações. */
(function(){
"use strict";
var A=window.A,$=A.$,$$=A.$$,esc=A.esc,M=window.MOTOR;
var S={per:"30",de:null,ate:null,f:{area_id:[],fila_id:[],assunto_id:[],atendente_id:[]},rows:null,chave:null,agora:null,montado:false,timer:null};
var DOW=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
var COR={a:"#1A5A9E",b:"#5DB200",n:"#9FB0C4",at:"#FFA500",rd:"#B3261E"};
function hojeISO(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());}
function menosDias(iso,n){var d=new Date(iso+"T12:00:00");d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);}
function periodo(){var h=hojeISO();if(S.per==="custom")return [S.de||menosDias(h,29),S.ate||h];return [menosDias(h,(+S.per)-1),h];}
var NOMECOL={area_id:"area",fila_id:"fila",assunto_id:"assunto",atendente_id:"atendente"};
function nomeDe(campo,id){
  if(id==null||id==="—")return campo==="atendente_id"?"Sem atendente":"—";
  var l={area_id:A.cad.areas,fila_id:A.cad.filas,atendente_id:A.cad.atendentes,assunto_id:A.cad.assuntos}[campo]||[];
  var o=l.find(function(x){return String(x.id)===String(id);});if(o)return o.nome;
  var r=(S.rows||[]).find(function(x){return String(x[campo])===String(id);});return r?r[NOMECOL[campo]]:String(id);}
function recorteTxt(){var p=periodo(),t=A.data(p[0]+"T12:00:00")+" a "+A.data(p[1]+"T12:00:00");
  Object.keys(S.f).forEach(function(k){if(S.f[k].length)t+=" · "+S.f[k].map(function(v){return nomeDe(k,v);}).join(", ");});return t;}

function montar(){
  var opts=function(l){return '<option value="">Todas</option>'+(l||[]).map(function(x){return '<option value="'+x.id+'">'+esc(x.nome)+'</option>';}).join("");};
  $("#pane-indicadores").innerHTML=
  '<div class="filtros" id="inFil">'+
    '<div class="fl"><label>Período</label><div class="per" id="inPer">'+[["1","Hoje"],["7","7 dias"],["30","30 dias"],["60","60 dias"],["custom","Escolher datas"]].map(function(p){return '<button data-p="'+p[0]+'">'+p[1]+'</button>';}).join("")+'</div></div>'+
    '<div class="fl"><label for="inArea">Área</label><select id="inArea" data-f="area_id">'+opts(A.cad.areas)+'</select></div>'+
    '<div class="fl"><label for="inFila">Fila</label><select id="inFila" data-f="fila_id">'+opts(A.cad.filas)+'</select></div>'+
    '<div class="fl"><label for="inAt">Atendente</label><select id="inAt" data-f="atendente_id">'+opts(A.cad.atendentes)+'</select></div>'+
    '<div class="fl"><button class="bt" id="inLimpa">Limpar filtros</button></div>'+
    '<div class="fl" id="inDatas" hidden style="grid-column:1/-1"><div class="grid2" style="max-width:420px"><input type="date" id="inDe" aria-label="De"><input type="date" id="inAte" aria-label="Até"></div></div>'+
    '<div id="inTags" class="per" style="grid-column:1/-1"></div>'+
  '</div><div id="inCorpo"><div class="vazio">Carregando indicadores…</div></div>';
  $("#inPer").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;S.per=b.getAttribute("data-p");carregar();});
  $$("#inFil select").forEach(function(s){s.addEventListener("change",function(){S.f[s.getAttribute("data-f")]=s.value?[s.value]:[];desenha();});});
  $("#inDe").addEventListener("change",function(e){S.de=e.target.value;carregar();});
  $("#inAte").addEventListener("change",function(e){S.ate=e.target.value;carregar();});
  $("#inLimpa").addEventListener("click",function(){Object.keys(S.f).forEach(function(k){S.f[k]=[];});desenha();});
  $("#inTags").addEventListener("click",function(e){var b=e.target.closest("[data-tf]");if(!b)return;var k=b.getAttribute("data-tf"),v=b.getAttribute("data-tv");S.f[k]=S.f[k].filter(function(x){return x!==v;});desenha();});
  $("#inCorpo").addEventListener("click",cliqueCorpo);
  S.montado=true;
}
/* clique em gráfico filtra; clicar de novo solta. Filtrar não rola a página. */
function cliqueCorpo(e){
  var b=e.target.closest("[data-ff]");
  if(b){var y=window.pageYOffset,k=b.getAttribute("data-ff"),v=b.getAttribute("data-fv");
    var i=S.f[k].indexOf(v);if(i>=0)S.f[k].splice(i,1);else S.f[k].push(v);desenha();window.scrollTo(0,y);return;}
  var x=e.target.closest("[data-x]");if(!x)return;var q=x.getAttribute("data-x");
  if(q==="csvAt")csvAtendentes();if(q==="csvAv")csvAvaliacoes();if(q==="csvAs")csvAssuntos();if(q==="csvBase")csvBase();
  if(q==="print")A.imprimir(x.closest(".card"));
}
async function carregar(){
  var p=periodo(),ch=p.join("|");
  $$("#inPer button").forEach(function(b){b.classList.toggle("ativa",b.getAttribute("data-p")===S.per);});
  $("#inDatas").hidden=S.per!=="custom";if(S.per==="custom"){$("#inDe").value=p[0];$("#inAte").value=p[1];}
  if(ch!==S.chave){$("#inCorpo").innerHTML='<div class="vazio">Carregando indicadores…</div>';
    try{var tudo=[],off=0,pg;
      /* a API devolve no máximo 1.000 linhas por chamada: pagina com ordem estável (criado_em, id) */
      do{pg=await A.rpc("ca_admin_chamados",{p_de:p[0],p_ate:p[1],p_area:null,p_limite:1000,p_offset:off});tudo=tudo.concat(pg);off+=1000;}while(pg.length===1000&&off<50000);
      S.rows=M.preparar(tudo);S.chave=ch;}catch(e){$("#inCorpo").innerHTML='<div class="vazio">'+esc(A.traduz(e))+'</div>';return;}}
  desenha();
  carregarAgora();
}
async function carregarAgora(){
  try{var r=await Promise.all([A.rpc("ca_painel_atendente",{}),A.rpc("ca_console_lista",{p_visao:"equipe"}),A.rpc("ca_console_lista",{p_visao:"encerrados_hoje"}),A.rpc("ca_console_contexto",{})]);
    var p=r[0],eq=r[1],enc=r[2],ctx=r[3],mais=p.filas.map(function(f){return f.mais_antigo_em;}).filter(Boolean).sort()[0];
    var meusAt=ctx.atendentes.filter(function(a){return a.papel!=="admin"||(a.filas||[]).length;});
    S.agora={na_fila:p.filas.reduce(function(t,f){return t+f.na_fila;},0),maior_espera_min:mais?A.minEntre(mais):null,em_atendimento:eq.length,
      aguardando_resposta:eq.filter(function(c){return c.status==="em_atendimento"&&c.ultima_msg_autor==="solicitante";}).length,
      disponiveis:meusAt.filter(function(a){return a.presenca==="online";}).length,em_pausa:meusAt.filter(function(a){return a.presenca==="pausa";}).length,
      encerrados_hoje:enc.filter(function(c){return c.status==="encerrado";}).length,desistencias_hoje:enc.filter(function(c){return c.status==="desistiu";}).length};
    var el=$("#inAgora");if(el)el.outerHTML=htmlAgora();}catch(e){}}
function htmlAgora(){var g=S.agora;if(!g)return '<div id="inAgora"></div>';
  return '<div id="inAgora" class="kpis">'+
    '<div class="kpi agora"><span class="r">Fila agora</span><span class="v">'+A.num(g.na_fila)+'</span><span class="c">'+(g.na_fila?"maior espera "+A.dur(g.maior_espera_min):"ninguém esperando")+'</span></div>'+
    '<div class="kpi agora"><span class="r">Em atendimento agora</span><span class="v">'+A.num(g.em_atendimento)+'</span><span class="c">'+A.num(g.aguardando_resposta)+' aguardando resposta do atendente</span></div>'+
    '<div class="kpi agora"><span class="r">Atendentes disponíveis</span><span class="v">'+A.num(g.disponiveis)+'</span><span class="c">'+A.num(g.em_pausa)+' em pausa</span></div>'+
    '<div class="kpi agora"><span class="r">Encerrados hoje</span><span class="v">'+A.num(g.encerrados_hoje)+'</span><span class="c">'+A.num(g.desistencias_hoje)+' desistências</span></div></div>';}

function cls(v,bom,ok){return v==null?"":v>=bom?"t-ok":v>=ok?"t-at":"t-rd";}
function desenha(){
  /* selects refletem o filtro (um valor) */
  $$("#inFil select").forEach(function(s){var v=S.f[s.getAttribute("data-f")];s.value=v.length===1?v[0]:"";});
  var tags=[];Object.keys(S.f).forEach(function(k){S.f[k].forEach(function(v){tags.push('<button class="tag az" data-tf="'+k+'" data-tv="'+esc(v)+'" style="min-height:32px">'+esc(nomeDe(k,v))+' ✕</button>');});});
  $("#inTags").innerHTML=tags.join("");$("#inTags").hidden=!tags.length;
  A.setTop();
  var rows=M.filtrar(S.rows||[],S.f),r=M.resumo(rows),p=periodo();
  if(!rows.length){$("#inCorpo").innerHTML=htmlAgora()+'<div class="vazio card">Nenhum chamado neste recorte. Amplie o período ou limpe os filtros.</div>';return;}
  var poucos=rows.length<30?'<div class="aviso" style="margin-bottom:12px">Só '+rows.length+' chamados neste recorte: percentuais e medianas oscilam muito. Amplie o período para comparar.</div>':"";
  var h=htmlAgora()+poucos+
  '<div class="kpis">'+
    kpi("Chamados",A.num(r.total),A.num(r.solicitantes)+" consultores · "+A.pct(r.foraHorario)+" fora do horário")+
    kpi("Espera na fila",A.dur(r.esperaMed),"mediana · 9 em 10 até "+A.dur(r.esperaP90))+
    kpi("Tempo de atendimento",A.dur(r.atendMed),"mediana, de assumido a encerrado")+
    kpi("Concluídos em até 30 min",'<span class="'+cls(r.ate30,.9,.7)+'">'+A.pct(r.ate30)+'</span>',"da abertura ao encerramento")+
    kpi("Resolvidos no 1º contato",'<span class="'+cls(r.fcr,.8,.6)+'">'+A.pct(r.fcr)+'</span>',"resolvido e sem novo chamado do assunto em 72 h")+
    kpi("Desistência",'<span class="'+(r.desist==null?"":r.desist<=.05?"t-ok":r.desist<=.1?"t-at":"t-rd")+'">'+A.pct(r.desist,1)+'</span>',A.num(r.desistencias)+" saíram antes de serem atendidos")+
    kpi("Avaliação média",r.avalMedia==null?"—":'<span class="'+cls(r.avalMedia,4.5,4)+'">'+A.num(r.avalMedia,1)+'</span>',A.num(r.avalN)+" notas · "+A.pct(r.avalResp)+" responderam")+
    kpi("Com nº do documento",A.pct(r.comDoc),A.pct(r.transf)+" tiveram repasse ou transferência")+
  '</div>'+
  '<div class="g2">'+
    card("Chamados por dia (data de abertura)",serie(M.serieDia(rows,p[0],p[1])))+
    card("Picos por hora e dia da semana",heat(M.mapaHora(rows))+'<div class="legenda"><span>Mais escuro = mais chamados. Use para montar escala e cobrir os picos.</span></div>')+
  '</div>'+
  '<div class="g1">'+card("Assuntos: volume × tempo em aberto",assuntos(rows),'<span class="acoesTab"><button class="bt sm" data-x="csvAs">Baixar Excel</button></span>')+'</div>'+
  '<div class="g2">'+
    card("Por área",barras(M.agrupar(rows,"area_id"),"area_id"))+
    card("Por fila",barras(M.agrupar(rows,"fila_id").slice(0,12),"fila_id"))+
  '</div>'+
  '<div class="g2">'+
    card("Espera × atendimento por fila (mediana)",esperaAtend(rows))+
    card("Resultado do encerramento",resultados(rows))+
  '</div>'+
  '<div class="g1">'+card("Por atendente",tabAtend(rows),'<span class="acoesTab"><button class="bt sm" data-x="csvAt">Baixar Excel</button><button class="bt sm" data-x="print">Imprimir</button></span>')+'</div>'+
  '<div class="g1">'+card("Avaliações (1 a 5)",tabAval(rows),'<span class="acoesTab"><button class="bt sm" data-x="csvAv">Baixar Excel</button><button class="bt sm" data-x="print">Imprimir</button></span>')+'</div>'+
  '<div class="g1">'+card("Base de chamados do recorte",'<p class="sub" style="margin:0">Uma linha por chamado ('+A.num(rows.length)+' no recorte), com espera e atendimento separados, resultado, nº do documento, 1º contato e avaliação. Dado pessoal: só matrícula e nome do consultor.</p>','<span class="acoesTab"><button class="bt sm" data-x="csvBase">Baixar Excel</button></span>')+'</div>'+
  '<div class="g1">'+card("Como cada número é calculado",metodologia())+'</div>';
  $("#inCorpo").innerHTML=h;
}
function kpi(r,v,c){return '<div class="kpi"><span class="r">'+r+'</span><span class="v">'+v+'</span><span class="c">'+c+'</span></div>';}
function card(t,corpo,extra){return '<div class="card"><div class="ch"><span>'+t+'</span>'+(extra||"")+'</div><div class="cb">'+corpo+'</div></div>';}
function serie(s){
  var W=600,H=180,pl=30,pb=22,max=Math.max.apply(null,s.map(function(x){return x.n;}).concat([1]));
  var bw=(W-pl)/s.length,o='<div class="serie"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Chamados por dia">';
  [0,.5,1].forEach(function(f){var y=H-pb-(H-pb-8)*f;o+='<line x1="'+pl+'" x2="'+W+'" y1="'+y+'" y2="'+y+'" stroke="currentColor" stroke-opacity=".12"/><text x="'+(pl-4)+'" y="'+(y+4)+'" text-anchor="end">'+A.num(max*f)+'</text>';});
  var passo=Math.ceil(s.length/10);
  s.forEach(function(d,i){var h=(H-pb-8)*d.n/max,x=pl+i*bw,dt=new Date(d.dia+"T12:00:00"),sab=dt.getDay()===6||dt.getDay()===0;
    o+='<rect x="'+(x+bw*.15)+'" y="'+(H-pb-h)+'" width="'+Math.max(1,bw*.7)+'" height="'+h+'" fill="'+(sab?COR.n:COR.a)+'" rx="2"><title>'+A.data(d.dia+"T12:00:00")+": "+d.n+' chamados</title></rect>';
    if(i%passo===0)o+='<text x="'+(x+bw/2)+'" y="'+(H-6)+'" text-anchor="middle">'+d.dia.slice(8,10)+'/'+d.dia.slice(5,7)+'</text>';});
  return o+'</svg></div><div class="legenda"><span><i style="background:'+COR.a+'"></i>Dia útil</span><span><i style="background:'+COR.n+'"></i>Sábado e domingo</span></div>';
}
function heat(g){
  var max=1;g.forEach(function(l){l.forEach(function(v){if(v>max)max=v;});});
  var o='<div class="heat"><span></span>';for(var h=0;h<24;h++)o+='<span class="hh">'+h+'</span>';
  [1,2,3,4,5,6,0].forEach(function(d){o+='<span class="hl">'+DOW[d]+'</span>';
    for(var h=0;h<24;h++){var v=g[d][h],a=v?0.12+0.88*v/max:0;o+='<span class="hc" style="background:'+(v?"rgba(26,90,158,"+a.toFixed(2)+")":"var(--card)")+'" title="'+DOW[d]+" "+h+'h: '+v+' chamados"></span>';}});
  return o+'</div>';
}
function barras(gr,campo){
  var max=Math.max.apply(null,gr.map(function(g){return g.total;}).concat([1]));
  return '<div class="barras">'+gr.map(function(g){var on=S.f[campo].indexOf(g.chave)>=0;
    return '<button class="bar'+(on?" filtrado":"")+'" data-ff="'+campo+'" data-fv="'+esc(g.chave)+'" title="Clique para filtrar"><span class="nm">'+esc(nomeDe(campo,g.chave))+'</span><span class="trilho"><i style="width:'+(100*g.total/max)+'%;background:'+COR.a+'"></i></span><span class="vl">'+A.num(g.total)+'</span></button>';}).join("")+'</div>';
}
function assuntos(rows){
  var gr=M.agrupar(rows,"assunto_id"),tot=rows.length,totT=gr.reduce(function(a,g){return a+g.abertoSoma;},0)||1;
  var maxP=Math.max.apply(null,gr.map(function(g){return Math.max(g.total/tot,g.abertoSoma/totT);}).concat([.01]));
  var top2=gr.slice().sort(function(a,b){return b.abertoSoma-a.abertoSoma;}).slice(0,2);
  var frase=top2.length===2?'<p style="margin:0 0 10px"><b>'+esc(nomeDe("assunto_id",top2[0].chave))+'</b> e <b>'+esc(nomeDe("assunto_id",top2[1].chave))+'</b> somam '+A.pct((top2[0].total+top2[1].total)/tot)+' dos chamados e '+A.pct((top2[0].abertoSoma+top2[1].abertoSoma)/totT)+' do tempo em aberto. São os primeiros alvos de coleta estruturada e automação.</p>':"";
  return frase+'<div class="dup" style="margin-bottom:6px"><span></span><span class="cab">% dos chamados</span><span class="cab">% do tempo em aberto</span></div><div class="barras">'+gr.map(function(g){
    var on=S.f.assunto_id.indexOf(g.chave)>=0,a=g.total/tot,b=g.abertoSoma/totT;
    return '<button class="bar dup'+(on?" filtrado":"")+'" data-ff="assunto_id" data-fv="'+esc(g.chave)+'" title="'+esc(nomeDe("assunto_id",g.chave))+': '+g.total+' chamados, mediana em aberto '+A.dur(g.abertoMed)+'">'+
      '<span class="nm">'+esc(nomeDe("assunto_id",g.chave))+'</span>'+
      '<span style="display:flex;gap:6px;align-items:center"><span class="trilho" style="flex:1"><i style="width:'+(100*a/maxP)+'%;background:'+COR.a+'"></i></span><span class="vl">'+A.pct(a)+'</span></span>'+
      '<span style="display:flex;gap:6px;align-items:center"><span class="trilho" style="flex:1"><i style="width:'+(100*b/maxP)+'%;background:'+(b>a*1.5?COR.at:COR.n)+'"></i></span><span class="vl">'+A.pct(b)+'</span></span></button>';}).join("")+
    '</div><div class="legenda"><span><i style="background:'+COR.at+'"></i>Consome bem mais tempo do que o volume sugere</span><span>Clique num assunto para filtrar o painel.</span></div>';
}
function esperaAtend(rows){
  var gr=M.agrupar(rows,"fila_id").slice(0,10),max=Math.max.apply(null,gr.map(function(g){return (g.esperaMed||0)+(g.atendMed||0);}).concat([1]));
  return '<div class="barras">'+gr.map(function(g){var e=g.esperaMed||0,t=g.atendMed||0;
    return '<button class="bar" data-ff="fila_id" data-fv="'+esc(g.chave)+'" title="Espera '+A.dur(e)+' · atendimento '+A.dur(t)+'"><span class="nm">'+esc(nomeDe("fila_id",g.chave))+'</span><span class="trilho"><i style="width:'+(100*e/max)+'%;background:'+COR.at+'"></i><i style="width:'+(100*t/max)+'%;background:'+COR.a+'"></i></span><span class="vl">'+A.dur(e)+' + '+A.dur(t)+'</span></button>';}).join("")+
    '</div><div class="legenda"><span><i style="background:'+COR.at+'"></i>Espera na fila</span><span><i style="background:'+COR.a+'"></i>Atendimento</span></div>';
}
function resultados(rows){
  var d=M.distrib(rows.filter(function(r){return r.encerrado;}),"resultado"),tot=0;
  var nd=rows.filter(function(r){return r.desist;}).length;if(nd)d.desistiu=nd;
  Object.keys(d).forEach(function(k){tot+=d[k];});
  var l=Object.keys(d).sort(function(a,b){return d[b]-d[a];});
  return '<div class="barras">'+l.map(function(k){var res=A.RESULTADOS.find(function(x){return x[0]===k;});
    var c=k==="desistiu"?COR.rd:res&&res[2]?COR.b:COR.n;
    return '<div class="bar" style="cursor:default"><span class="nm">'+esc(A.nomeResultado(k))+'</span><span class="trilho"><i style="width:'+(100*d[k]/tot)+'%;background:'+c+'"></i></span><span class="vl">'+A.pct(d[k]/tot)+' · '+A.num(d[k])+'</span></div>';}).join("")+'</div><div class="legenda"><span><i style="background:'+COR.b+'"></i>Conta como resolvido</span><span><i style="background:'+COR.rd+'"></i>Desistência antes do atendimento</span></div>';
}
function linhasAtend(rows){return M.agrupar(rows.filter(function(r){return r.atendente_id;}),"atendente_id");}
function tabAtend(rows){
  var g=linhasAtend(rows);
  return '<div class="tabWrap"><table class="tb"><thead><tr><th>Atendente</th><th class="num">Chamados</th><th class="num">Espera (med.)</th><th class="num">Atendimento (med.)</th><th class="num">Até 30 min</th><th class="num">1º contato</th><th class="num">Repasse/transf.</th><th class="num">Avaliação</th></tr></thead><tbody>'+
    g.map(function(x){return '<tr class="clic" data-ff="atendente_id" data-fv="'+esc(x.chave)+'"><td><b>'+esc(nomeDe("atendente_id",x.chave))+'</b></td><td class="num">'+A.num(x.total)+'</td><td class="num">'+A.dur(x.esperaMed)+'</td><td class="num">'+A.dur(x.atendMed)+'</td><td class="num">'+A.pct(x.ate30)+'</td><td class="num">'+A.pct(x.fcr)+'</td><td class="num">'+A.pct(x.transf)+'</td><td class="num">'+(x.avalMedia==null?"—":A.num(x.avalMedia,1)+' <span class="sub">('+x.avalN+')</span>')+'</td></tr>';}).join("")+'</tbody></table></div>';
}
function linhasAval(rows){return rows.filter(function(r){return r.avaliacao!=null;}).sort(function(a,b){return new Date(b.encerrado_em)-new Date(a.encerrado_em);});}
function tabAval(rows){
  var l=linhasAval(rows),dist=[0,0,0,0,0];l.forEach(function(r){dist[r.avaliacao-1]++;});
  var max=Math.max.apply(null,dist.concat([1]));
  var cores=[COR.rd,COR.rd,COR.at,COR.b,COR.b];
  return '<div class="barras" style="max-width:520px;margin-bottom:12px">'+[5,4,3,2,1].map(function(n){return '<div class="bar" style="cursor:default"><span class="nm estrelas">'+"★".repeat(n)+'</span><span class="trilho"><i style="width:'+(100*dist[n-1]/max)+'%;background:'+cores[n-1]+'"></i></span><span class="vl">'+A.num(dist[n-1])+'</span></div>';}).join("")+'</div>'+
    '<div class="tabWrap" style="max-height:420px"><table class="tb"><thead><tr><th>Data</th><th>Protocolo</th><th>Solicitante</th><th>Assunto</th><th>Atendente</th><th class="num">Nota</th><th>Comentário</th></tr></thead><tbody>'+
    l.slice(0,200).map(function(r){return '<tr><td>'+A.data(r.encerrado_em)+'</td><td class="id">'+esc(r.protocolo)+'</td><td>'+esc(r.solicitante)+'<div class="sub">'+esc(r.equipe||"")+'</div></td><td>'+esc(nomeDe("assunto_id",r.assunto_id))+'</td><td>'+esc(nomeDe("atendente_id",r.atendente_id))+'</td><td class="num estrelas">'+"★".repeat(r.avaliacao)+'</td><td>'+esc(r.comentario||"")+'</td></tr>';}).join("")+'</tbody></table></div>'+
    (l.length>200?'<p class="sub">Mostrando as 200 mais recentes de '+A.num(l.length)+'. O Excel traz todas.</p>':"");
}
function metodologia(){return '<ul class="metod">'+
  '<li><b>Espera na fila:</b> do envio das respostas do fluxo até o 1º atendente assumir (ou receber pela distribuição automática). O tempo que o consultor leva respondendo o fluxo não conta.</li>'+
  '<li><b>Tempo de atendimento:</b> de assumido até encerrado. Espera + atendimento é o tempo que o BLiP mostra hoje como um número só.</li>'+
  '<li><b>Concluídos em até 30 min:</b> encerrados com até 30 min entre a entrada na fila e o encerramento, sobre o total de encerrados.</li>'+
  '<li><b>Resolvido no 1º contato:</b> encerrado como "Resolvido" e sem novo chamado do mesmo consultor no mesmo assunto nas 72 h seguintes, sobre o total de encerrados. <i>Janela de 72 h a validar com as áreas (parâmetro em Cadastros).</i></li>'+
  '<li><b>Desistência:</b> chamados em que o consultor saiu antes de ser atendido (cancelou na fila ou abandonou o fluxo por mais de 30 min), sobre o total.</li>'+
  '<li><b>Avaliação:</b> nota de 1 a 5 enviada no app após o encerramento; média só de quem respondeu. % responderam = avaliações ÷ encerrados.</li>'+
  '<li><b>Supervisor</b> vê só a própria área; administração vê todas. As mesmas regras estão na função ca_indicadores do banco.</li>'+
  '<li><b>Medianas</b> em vez de médias: um chamado esquecido no fim de semana não distorce o número do mês.</li>'+
  '<li>Horários no fuso de Brasília. Recorte abaixo de 30 chamados mostra aviso de amostra pequena.</li></ul>';}

/* ---------- exportações ---------- */
function csvAtendentes(){var rows=M.filtrar(S.rows,S.f);A.baixarCsv("indicadores_atendentes","Indicadores por atendente",recorteTxt(),
  ["Atendente","Chamados","Espera mediana (min)","Atendimento mediano (min)","Até 30 min (%)","1º contato (%)","Repasse/transf. (%)","Avaliação média","Nº de avaliações"],
  linhasAtend(rows).map(function(x){return [nomeDe("atendente_id",x.chave),x.total,fmt(x.esperaMed),fmt(x.atendMed),fmtP(x.ate30),fmtP(x.fcr),fmtP(x.transf),x.avalMedia==null?"":A.num(x.avalMedia,2),x.avalN];}));}
function csvAvaliacoes(){var rows=M.filtrar(S.rows,S.f);A.baixarCsv("avaliacoes","Avaliações (1 a 5)",recorteTxt(),
  ["Data","Protocolo","Matrícula","Solicitante","Equipe","Área","Fila","Assunto","Atendente","Nota","Comentário"],
  linhasAval(rows).map(function(r){return [A.dataHora(r.encerrado_em),r.protocolo,r.matricula,r.solicitante,r.equipe||"",r.area,r.fila,r.assunto,r.atendente||"",r.avaliacao,r.comentario||""];}));}
function csvAssuntos(){var rows=M.filtrar(S.rows,S.f),gr=M.agrupar(rows,"assunto_id"),tot=rows.length,totT=gr.reduce(function(a,g){return a+g.abertoSoma;},0)||1;
  A.baixarCsv("assuntos","Assuntos: volume × tempo",recorteTxt(),["Assunto","Chamados","% dos chamados","% do tempo em aberto","Espera mediana (min)","Atendimento mediano (min)","1º contato (%)"],
  gr.map(function(g){return [nomeDe("assunto_id",g.chave),g.total,fmtP(g.total/tot),fmtP(g.abertoSoma/totT),fmt(g.esperaMed),fmt(g.atendMed),fmtP(g.fcr)];}));}
function csvBase(){var rows=M.filtrar(S.rows,S.f);A.baixarCsv("chamados","Base de chamados",recorteTxt(),
  ["Protocolo","Situação","Aberto em","Área","Fila","Assunto","Matrícula","Consultor","Equipe","Atendente","Entrou na fila","Assumido","1ª resposta","Encerrado","Espera (min)","Atendimento (min)","Fila → encerramento (min)","Resultado","Tipo do documento","Nº do documento","Transferências","Fora do horário","Resolvido no 1º contato","Etapa da desistência","Avaliação","Comentário"],
  rows.map(function(r){return [r.protocolo,A.STATUS[r.status]||r.status,A.dataHora(r.criado_em),r.area,r.fila,r.assunto,r.matricula,r.solicitante,r.equipe||"",r.atendente||"",
    A.dataHora(r.entrou_fila_em),r.assumido_em?A.dataHora(r.assumido_em):"",r.primeira_resposta_em?A.dataHora(r.primeira_resposta_em):"",r.encerrado_em?A.dataHora(r.encerrado_em):"",fmt(r.espera),fmt(r.atend),fmt(r.aberto),
    r.resultado?A.nomeResultado(r.resultado):"",r.documento_tipo||"",r.documento_numero||"",r.qtd_transferencias,r.fora_horario?"Sim":"Não",r.resolvido_1o_contato?"Sim":"Não",r.desistencia_etapa||"",r.avaliacao==null?"":r.avaliacao,r.comentario||""];}));}
function fmt(v){return v==null?"":A.num(v,1);}
function fmtP(v){return v==null?"":A.num(v*100,1);}

A.modulos.indicadores={mostrar:function(){if(!S.montado)montar();carregar();
  clearInterval(S.timer);S.timer=setInterval(function(){if(A.abaAtual==="indicadores"&&!document.hidden)carregarAgora();},20000);}};
})();
