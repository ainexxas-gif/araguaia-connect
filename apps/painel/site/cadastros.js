/* Cadastros (só administração): áreas, filas e horários, assuntos, atendentes e filas que atendem,
   respostas rápidas, feriados, consultores e parâmetros. Grava por ca_admin_salvar / ca_admin_remover. */
(function(){
"use strict";
var A=window.A,$=A.$,$$=A.$$,esc=A.esc;
var S={sub:"filas",busca:"",d:{},montado:false};
var ENTS=["areas","filas","horarios","feriados","assuntos","atendentes","fila_atendentes","respostas_rapidas","solicitantes","equipes_venda","config"];
var DIAS=[[1,"Seg"],[2,"Ter"],[3,"Qua"],[4,"Qui"],[5,"Sex"],[6,"Sáb"],[0,"Dom"]];
var PAPEIS=[["atendente","Atendente"],["supervisor","Supervisor"],["admin","Administrador"]];
var DOCS=[["","Nenhum"],["RC","RC"],["OV","OV"],["PEDIDO","Pedido"],["NF","NF"],["REMESSA","Remessa"],["OUTRO","Outro"]];
var ICONES=[["documento","Documento"],["calendario","Calendário"],["caminhao","Caminhão"],["setas","Setas"],["lapis","Lápis"],["pin","Local"],["recibo","Recibo"],["etiqueta","Etiqueta"],["balao","Balão"]];
var FUNCOES=[["CTC","CTC"],["GERENTE","Gerente"],["FATURISTA","Faturista"],["OUTRO","Outro"]];
function L(t){return S.d[t]||[];}
function porId(t,id){return L(t).find(function(x){return x.id===id;});}
function nomeDe(t,id){var x=porId(t,id);return x?x.nome:"—";}
function ativoTag(v){return v===false?'<span class="tag">Inativo</span>':'<span class="tag ok">Ativo</span>';}
function codigoDe(nome){return A.norm(nome).toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,30);}
function horarioResumo(fid){
  var g={};DIAS.forEach(function(d){var hs=L("horarios").filter(function(h){return h.fila_id===fid&&h.dia_semana===d[0];}).sort(function(a,b){return a.inicio<b.inicio?-1:1;});
    var k=hs.length?hs.map(function(h){return h.inicio.slice(0,5)+"–"+h.fim.slice(0,5);}).join(", "):"fechado";(g[k]=g[k]||[]).push(d[1]);});
  return Object.keys(g).map(function(k){return g[k].join(", ")+": "+k;}).join(" · ");
}
function filasDe(aid){return L("fila_atendentes").filter(function(x){return x.atendente_id===aid&&x.ativo!==false;}).map(function(x){return x.fila_id;});}

/* ---------- definição de cada cadastro ---------- */
var ENT={
  filas:{nome:"Filas e horários",ent:"filas",
    cols:[["Fila",function(r){return '<b>'+esc(r.nome)+'</b><div class="sub">'+esc(nomeDe("areas",r.area_id))+' · '+(r.distribuicao==="automatica"?"distribuição automática":"atendente escolhe")+'</div>';}],
      ["Horário",function(r){return '<span class="sub">'+esc(horarioResumo(r.id))+'</span>';}],
      ["Metas",function(r){return 'Espera '+A.dur(r.sla_espera_min)+'<br>Atend. '+A.dur(r.sla_atendimento_min);},"num"],
      ["Atendentes",function(r){return L("fila_atendentes").filter(function(x){return x.fila_id===r.id&&x.ativo!==false;}).length;},"num"],
      ["Situação",function(r){return ativoTag(r.ativa);}]],
    form:function(r){var novo=!r.id;
      return '<div class="grid2">'+campo("nome","Nome da fila",r.nome,{obr:1,ph:"Ex.: OC · Modificação de pedidos"})+sel("area_id","Área",r.area_id,L("areas").map(function(a){return [a.id,a.nome];}),1)+'</div>'+
        (novo?campo("codigo","Código interno",r.codigo,{obr:1,ph:"Gerado a partir do nome",ajuda:"Letras maiúsculas, números e _. Não muda depois."}):"")+
        escolha("distribuicao","Como os chamados chegam ao atendente",r.distribuicao||"automatica",[["automatica","Automático: para quem está disponível e com menos chamados"],["manual","Manual: o atendente pega na fila"]])+
        '<div class="grid2">'+campo("sla_espera_min","Meta de espera na fila (min)",r.sla_espera_min,{tipo:"number"})+campo("sla_atendimento_min","Meta de atendimento (min)",r.sla_atendimento_min,{tipo:"number"})+'</div>'+
        '<div class="fg"><label>Horário de atendimento (Brasília)</label><div class="gradeHor">'+DIAS.map(function(d){
          var h=L("horarios").filter(function(x){return x.fila_id===r.id&&x.dia_semana===d[0];})[0];
          return '<span class="dia">'+d[1]+'</span><input type="time" data-h="'+d[0]+'-i" value="'+(h?h.inicio.slice(0,5):"")+'"'+(h||novo&&d[0]>0?"":" disabled")+' aria-label="'+d[1]+' início"><input type="time" data-h="'+d[0]+'-f" value="'+(h?h.fim.slice(0,5):"")+'"'+(h||novo&&d[0]>0?"":" disabled")+' aria-label="'+d[1]+' fim">'+
            '<label class="ajuda"><input type="checkbox" data-fechado="'+d[0]+'"'+(h||novo&&d[0]>0?"":" checked")+'> fechado</label>';}).join("")+'</div>'+
          '<span class="ajuda">Fora do horário o pedido entra na fila marcado como "fora do horário" e o consultor recebe a mensagem abaixo.</span></div>'+
        campo("msg_fora_horario","Mensagem fora do horário",r.msg_fora_horario,{area:1,ph:"Recebemos seu pedido fora do horário. Ele já está na fila e será atendido assim que a equipe voltar."})+
        simNao("ativa","Fila ativa",r.ativa!==false);},
    depois:function(m,r){
      if(!r.id){var n=$('[data-campo=nome]',m),c=$('[data-campo=codigo]',m);n.addEventListener("input",function(){if(!c.dataset.mexeu)c.value=codigoDe(n.value);});c.addEventListener("input",function(){c.dataset.mexeu=1;});
        DIAS.forEach(function(d){if(d[0]>0){$('[data-h="'+d[0]+'-i"]',m).value=d[0]===6?"08:00":"07:30";$('[data-h="'+d[0]+'-f"]',m).value=d[0]===6?"12:00":"18:00";}});}
      $$("[data-fechado]",m).forEach(function(c){c.addEventListener("change",function(){var d=c.getAttribute("data-fechado");
        $$('[data-h^="'+d+'-"]',m).forEach(function(i){i.disabled=c.checked;if(c.checked)i.value="";else if(!i.value)i.value=i.getAttribute("data-h").slice(-1)==="i"?"07:30":"18:00";});});});},
    ler:function(m,r){var o={nome:val(m,"nome"),area_id:+val(m,"area_id"),distribuicao:esc1(m,"distribuicao"),sla_espera_min:num(m,"sla_espera_min"),sla_atendimento_min:num(m,"sla_atendimento_min"),
      msg_fora_horario:val(m,"msg_fora_horario")||null,ativa:sn(m,"ativa")};if(!r.id)o.codigo=val(m,"codigo");return o;},
    validar:function(m){var erro=null;DIAS.forEach(function(d){if($('[data-fechado="'+d[0]+'"]',m).checked)return;var i=$('[data-h="'+d[0]+'-i"]',m).value,f=$('[data-h="'+d[0]+'-f"]',m).value;
      if(!i||!f||f<=i)erro="No "+d[1]+", o fim precisa ser depois do início.";});return erro;},
    /* horários: troca só o que mudou */
    salvarExtra:async function(m,fid){
      var atuais=L("horarios").filter(function(h){return h.fila_id===fid;});
      for(var k=0;k<DIAS.length;k++){var d=DIAS[k][0],fe=$('[data-fechado="'+d+'"]',m).checked,i=$('[data-h="'+d+'-i"]',m).value,f=$('[data-h="'+d+'-f"]',m).value;
        var doDia=atuais.filter(function(h){return h.dia_semana===d;}),igual=!fe&&doDia.length===1&&doDia[0].inicio.slice(0,5)===i&&doDia[0].fim.slice(0,5)===f;
        if(igual||(fe&&!doDia.length))continue;
        for(var j=0;j<doDia.length;j++)await A.rpc("ca_admin_remover",{p_entidade:"horarios",p_chave:{id:doDia[j].id}});
        if(!fe)await A.rpc("ca_admin_salvar",{p_entidade:"horarios",p_dados:{fila_id:fid,dia_semana:d,inicio:i,fim:f}});}}},
  assuntos:{nome:"Assuntos do menu",ent:"assuntos",
    cols:[["Assunto",function(r){return '<b>'+esc(r.nome)+'</b><div class="sub">'+esc(r.descricao||"")+'</div>';}],
      ["Área · fila",function(r){return esc(nomeDe("areas",r.area_id))+'<div class="sub">'+esc(nomeDe("filas",r.fila_id))+'</div>';}],
      ["Documento",function(r){return r.documento_tipo?esc(r.documento_tipo)+(r.documento_obrigatorio_no_encerramento?' <span class="tag at">obrigatório ao resolver</span>':""):'<span class="sub">—</span>';}],
      ["Ordem",function(r){return r.ordem;},"num"],["Situação",function(r){return ativoTag(r.ativo);}]],
    form:function(r){var novo=!r.id;
      return '<div class="grid2">'+campo("nome","Nome no menu do app",r.nome,{obr:1,ph:"Ex.: Modificação de pedidos"})+campo("descricao","Descrição curta",r.descricao,{ph:"Ex.: alterar quantidade, produto ou condição"})+'</div>'+
        (novo?campo("codigo","Código interno",r.codigo,{obr:1,ajuda:"Letras maiúsculas, números e _. Não muda depois."}):"")+
        '<div class="grid2">'+sel("area_id","Área",r.area_id,L("areas").map(function(a){return [a.id,a.nome];}),1)+sel("fila_id","Fila que recebe",r.fila_id,L("filas").filter(function(f){return f.ativa!==false;}).map(function(f){return [f.id,f.nome];}),1)+'</div>'+
        '<div class="grid2">'+sel("documento_tipo","Documento que o assunto trata",r.documento_tipo||"",DOCS)+simNao("documento_obrigatorio_no_encerramento","Exigir o nº ao encerrar como resolvido",!!r.documento_obrigatorio_no_encerramento)+'</div>'+
        '<div class="grid3">'+sel("icone","Ícone no app",r.icone||"documento",ICONES)+campo("ordem","Ordem no menu",r.ordem==null?0:r.ordem,{tipo:"number"})+simNao("ativo","Aparece no menu",r.ativo!==false)+'</div>'+
        (novo?'<p class="ajuda">Depois de salvar, monte as perguntas em Fluxos. Sem fluxo publicado, o assunto não aparece no app.</p>':'<p><button class="bt" type="button" data-ir-fluxo="'+r.id+'">Editar as perguntas deste assunto</button></p>');},
    depois:function(m,r){
      if(!r.id){var n=$('[data-campo=nome]',m),c=$('[data-campo=codigo]',m);n.addEventListener("input",function(){if(!c.dataset.mexeu)c.value=codigoDe(n.value);});c.addEventListener("input",function(){c.dataset.mexeu=1;});}
      var a=$('[data-campo=area_id]',m),f=$('[data-campo=fila_id]',m);a.addEventListener("change",function(){var fs=L("filas").filter(function(x){return x.area_id===+a.value;});if(fs.length&&!fs.some(function(x){return x.id===+f.value;}))f.value=fs[0].id;});
      var ir=$("[data-ir-fluxo]",m);if(ir)ir.addEventListener("click",function(){m.closest(".modalFundo").remove();A.irPara("fluxos",ir.getAttribute("data-ir-fluxo"));});},
    ler:function(m,r){var o={nome:val(m,"nome"),descricao:val(m,"descricao")||null,area_id:+val(m,"area_id"),fila_id:+val(m,"fila_id"),documento_tipo:val(m,"documento_tipo")||null,
      documento_obrigatorio_no_encerramento:sn(m,"documento_obrigatorio_no_encerramento"),icone:val(m,"icone"),ordem:num(m,"ordem")||0,ativo:sn(m,"ativo")};if(!r.id)o.codigo=val(m,"codigo");return o;}},
  atendentes:{nome:"Atendentes",ent:"atendentes",
    cols:[["Nome",function(r){return '<span class="dot '+(r.ativo===false?"offline":r.presenca)+'"></span> <b>'+esc(r.nome)+'</b><div class="sub">'+esc(r.email)+'</div>';}],
      ["Papel",function(r){return (PAPEIS.find(function(p){return p[0]===r.papel;})||["",""])[1]+'<div class="sub">'+esc(nomeDe("areas",r.area_id))+'</div>';}],
      ["Filas que atende",function(r){return '<span class="sub">'+filasDe(r.id).map(function(f){return esc(nomeDe("filas",f));}).join(", ")+'</span>';}],
      ["Simultâneos",function(r){return r.capacidade;},"num"],["Situação",function(r){return ativoTag(r.ativo);}]],
    form:function(r){var fs=filasDe(r.id);
      return '<div class="grid2">'+campo("nome","Nome",r.nome,{obr:1})+campo("email","E-mail da conta Microsoft",r.email,{obr:1,tipo:"email",ph:"nome.sobrenome@araguaia.com.br"})+'</div>'+
        '<div class="grid2">'+sel("area_id","Área principal",r.area_id,L("areas").map(function(a){return [a.id,a.nome];}),1)+campo("matricula","Matrícula",r.matricula)+'</div>'+
        escolha("papel","Papel",r.papel||"atendente",PAPEIS)+
        '<p class="ajuda">Atendente: atende as filas marcadas. Supervisor: vê e redistribui a área principal e acompanha os indicadores dela. Administrador: tudo, inclusive cadastros e fluxos.</p>'+
        '<div class="fg"><label>Filas que atende</label>'+L("areas").map(function(a){var fl=L("filas").filter(function(f){return f.area_id===a.id&&f.ativa!==false;});if(!fl.length)return "";
          return '<div class="sub" style="margin:6px 0 4px;font-weight:700">'+esc(a.nome)+'</div><div class="checks">'+fl.map(function(f){var on=fs.indexOf(f.id)>=0;
            return '<label class="'+(on?"sel":"")+'"><input type="checkbox" name="fl" value="'+f.id+'"'+(on?" checked":"")+'> '+esc(f.nome)+'</label>';}).join("")+'</div>';}).join("")+'</div>'+
        '<div class="grid2">'+campo("capacidade","Chamados ao mesmo tempo",r.capacidade||5,{tipo:"number",obr:1,ajuda:"Na distribuição automática, ninguém recebe acima disso."})+simNao("ativo","Acesso ativo",r.ativo!==false)+'</div>'+
        (r.id?"":'<p class="ajuda">O acesso usa a conta Microsoft: no primeiro login com este e-mail, a pessoa já entra como atendente.</p>');},
    depois:function(m){checksVisuais(m);A.escolhas($('[data-campo="papel"]',m));},
    ler:function(m){return {nome:val(m,"nome"),email:val(m,"email").toLowerCase(),area_id:+val(m,"area_id")||null,matricula:val(m,"matricula")||null,papel:esc1(m,"papel"),capacidade:num(m,"capacidade"),ativo:sn(m,"ativo")};},
    validar:function(m){if(!/@araguaia\.com\.br$/.test(val(m,"email").toLowerCase()))return "Use o e-mail corporativo @araguaia.com.br.";var c=num(m,"capacidade");if(!(c>=1&&c<=50))return "Chamados ao mesmo tempo: de 1 a 50.";return null;},
    salvarExtra:async function(m,aid){
      var quero=$$('input[name=fl]:checked',m).map(function(x){return +x.value;}),tem=L("fila_atendentes").filter(function(x){return x.atendente_id===aid;});
      for(var i=0;i<tem.length;i++)if(quero.indexOf(tem[i].fila_id)<0)await A.rpc("ca_admin_remover",{p_entidade:"fila_atendentes",p_chave:{fila_id:tem[i].fila_id,atendente_id:aid}});
      for(var j=0;j<quero.length;j++){var x=tem.find(function(t){return t.fila_id===quero[j];});
        if(!x||x.ativo===false)await A.rpc("ca_admin_salvar",{p_entidade:"fila_atendentes",p_dados:{fila_id:quero[j],atendente_id:aid,prioridade:1,ativo:true}});}}},
  areas:{nome:"Áreas",ent:"areas",
    cols:[["Área",function(r){return '<b>'+esc(r.nome)+'</b><div class="sub">'+esc(r.descricao||"")+'</div>';}],["Código",function(r){return '<span class="id">'+esc(r.codigo)+'</span>';}],
      ["Filas",function(r){return L("filas").filter(function(f){return f.area_id===r.id&&f.ativa!==false;}).length;},"num"],
      ["Assuntos",function(r){return L("assuntos").filter(function(s){return s.area_id===r.id&&s.ativo!==false;}).length;},"num"],
      ["Ordem no menu",function(r){return r.ordem;},"num"],["Situação",function(r){return ativoTag(r.ativa);}]],
    form:function(r){var novo=!r.id;return '<div class="grid2">'+campo("nome","Nome da área",r.nome,{obr:1,ph:"Ex.: Crédito e Cobrança"})+(novo?campo("codigo","Código (sigla)",r.codigo,{obr:1,ph:"Ex.: CRED",ajuda:"2 a 20 letras maiúsculas. Não muda depois."}):"")+'</div>'+
      campo("descricao","Texto que o consultor vê no menu",r.descricao,{ph:"Ex.: liberação de crédito, prorrogações e cobrança"})+
      '<div class="grid3">'+sel("icone","Ícone no app",r.icone||"balao",ICONES)+campo("ordem","Ordem no menu",r.ordem==null?0:r.ordem,{tipo:"number"})+simNao("ativa","Aparece no menu",r.ativa!==false)+'</div>';},
    ler:function(m,r){var o={nome:val(m,"nome"),descricao:val(m,"descricao")||null,icone:val(m,"icone"),ordem:num(m,"ordem")||0,ativa:sn(m,"ativa")};if(!r.id)o.codigo=val(m,"codigo").toUpperCase();return o;}},
  respostas_rapidas:{nome:"Respostas rápidas",ent:"respostas_rapidas",apaga:true,
    cols:[["Atalho",function(r){return '<span class="id">'+esc(r.atalho)+'</span><div><b>'+esc(r.titulo)+'</b></div>';}],["Texto",function(r){return esc(r.texto);}],["Área",function(r){return r.area_id?esc(nomeDe("areas",r.area_id)):'<span class="sub">Todas</span>';}],["Situação",function(r){return ativoTag(r.ativo);}]],
    form:function(r){return '<div class="grid2">'+campo("atalho","Atalho",r.atalho||"/",{obr:1,ph:"/centro",ajuda:"Começa com / e usa letras minúsculas. O atendente digita o atalho e aperta Tab."})+campo("titulo","Nome do botão",r.titulo,{obr:1,ph:"Ex.: Pedir o centro"})+'</div>'+
      sel("area_id","Área",r.area_id==null?"":r.area_id,[["","Todas as áreas"]].concat(L("areas").map(function(a){return [a.id,a.nome];})))+
      campo("texto","Texto da resposta",r.texto,{obr:1,area:1})+simNao("ativo","Ativa",r.ativo!==false);},
    ler:function(m){return {atalho:val(m,"atalho").toLowerCase(),titulo:val(m,"titulo"),texto:val(m,"texto"),area_id:val(m,"area_id")?+val(m,"area_id"):null,ativo:sn(m,"ativo")};},
    validar:function(m){return /^\/[a-z0-9_-]{2,30}$/.test(val(m,"atalho").toLowerCase())?null:"O atalho começa com / e tem de 2 a 30 letras minúsculas, números, - ou _.";}},
  feriados:{nome:"Feriados",ent:"feriados",apaga:true,ordem:function(a,b){return a.data<b.data?-1:1;},
    cols:[["Data",function(r){return A.data(r.data+"T12:00:00");}],["Feriado",function(r){return esc(r.descricao);}],["Vale para",function(r){return r.fila_id?esc(nomeDe("filas",r.fila_id)):"Todas as filas";}]],
    form:function(r){return '<div class="grid2">'+campo("data","Data",r.data,{tipo:"date",obr:1})+campo("descricao","Nome",r.descricao,{obr:1,ph:"Ex.: Natal"})+'</div>'+
      sel("fila_id","Vale para",r.fila_id==null?"":r.fila_id,[["","Todas as filas"]].concat(L("filas").map(function(f){return [f.id,f.nome];})))+'<p class="ajuda">No feriado a fila segue a regra de fora do horário.</p>';},
    ler:function(m){return {data:val(m,"data"),descricao:val(m,"descricao"),fila_id:val(m,"fila_id")?+val(m,"fila_id"):null};}},
  solicitantes:{nome:"Consultores",ent:"solicitantes",limite:300,
    cols:[["Matrícula",function(r){return '<span class="id">'+esc(r.matricula)+'</span>';}],["Nome",function(r){return '<b>'+esc(r.nome)+'</b><div class="sub">'+esc(r.email||"ainda não entrou no app")+'</div>';}],
      ["Função",function(r){return esc((FUNCOES.find(function(f){return f[0]===r.funcao;})||["",r.funcao||"—"])[1]);}],
      ["Equipe de venda",function(r){var e=porId("equipes_venda",r.equipe_venda_id);return e?esc(e.codigo)+'<div class="sub">'+esc(e.descricao||"")+'</div>':'<span class="tag at">Sem equipe</span>';}],
      ["Situação",function(r){return ativoTag(r.ativo);}]],
    form:function(r){return '<div class="grid2">'+campo("matricula","Matrícula",r.matricula,{obr:1,ajuda:r.id?"":"Pré-cadastro: quando o consultor entrar com a conta Microsoft e informar esta matrícula, os dois são ligados."})+campo("nome","Nome",r.nome,{obr:1})+'</div>'+
      '<div class="grid2">'+sel("funcao","Função",r.funcao||"",[["","Não informada"]].concat(FUNCOES))+
      '<div class="fg"><label for="c_equipe">Equipe de venda</label><input id="c_equipe" data-campo="equipe" list="dlEquipes" value="'+esc((porId("equipes_venda",r.equipe_venda_id)||{}).codigo||"")+'" placeholder="Digite o código ou o nome"><datalist id="dlEquipes">'+
        L("equipes_venda").filter(function(e){return e.ativa!==false;}).map(function(e){return '<option value="'+esc(e.codigo)+'">'+esc(e.descricao||"")+'</option>';}).join("")+'</datalist></div></div>'+
      (r.email?'<p class="ajuda">Conta ligada: '+esc(r.email)+'</p>':"")+simNao("ativo","Pode usar o app",r.ativo!==false);},
    ler:function(m){var cod=val(m,"equipe"),e=L("equipes_venda").find(function(x){return A.norm(x.codigo)===A.norm(cod);});
      return {matricula:val(m,"matricula"),nome:val(m,"nome"),funcao:val(m,"funcao")||null,equipe_venda_id:e?e.id:null,ativo:sn(m,"ativo")};},
    validar:function(m){var cod=val(m,"equipe");if(cod&&!L("equipes_venda").some(function(x){return A.norm(x.codigo)===A.norm(cod);}))return "Equipe de venda não encontrada. Escolha uma da lista.";
      return /^[0-9A-Za-z]{3,20}$/.test(val(m,"matricula"))?null:"A matrícula tem de 3 a 20 letras ou números.";}},
  config:{nome:"Parâmetros",ent:"config",chave:"chave",
    cols:[["Parâmetro",function(r){return '<b>'+esc(r.descricao||r.chave)+'</b><div class="sub id">'+esc(r.chave)+'</div>';}],["Valor",function(r){return esc(typeof r.valor==="string"?r.valor:JSON.stringify(r.valor));},"num"]],
    form:function(r){var n=typeof r.valor==="number";return '<p>'+esc(r.descricao||"")+'</p>'+campo("valor","Valor",typeof r.valor==="string"?r.valor:JSON.stringify(r.valor),{obr:1,tipo:n?"number":"text"});},
    ler:function(m,r){var v=val(m,"valor");return {chave:r.chave,valor:typeof r.valor==="number"?+v:typeof r.valor==="string"?v:JSON.parse(v)};},
    validar:function(m,r){if(typeof r.valor==="number"&&isNaN(+val(m,"valor")))return "Informe um número.";return null;}}
};
var ORDEM=["filas","assuntos","atendentes","areas","respostas_rapidas","feriados","solicitantes","config"];

/* ---------- campos ---------- */
function campo(n,rot,v,o){o=o||{};var id="c_"+n;
  var el=o.area?'<textarea id="'+id+'" data-campo="'+n+'"'+(o.obr?" data-obr":"")+' placeholder="'+esc(o.ph||"")+'">'+esc(v||"")+'</textarea>'
    :'<input id="'+id+'" data-campo="'+n+'" type="'+(o.tipo||"text")+'"'+(o.tipo==="number"?' inputmode="numeric" min="0"':"")+(o.tipo==="email"?' inputmode="email" autocomplete="off"':"")+(o.obr?" data-obr":"")+' value="'+esc(v==null?"":v)+'" placeholder="'+esc(o.ph||"")+'">';
  return '<div class="fg"><label for="'+id+'">'+esc(rot)+'</label>'+el+(o.obr?'<span class="obr">Obrigatório</span>':"")+(o.ajuda?'<span class="ajuda">'+esc(o.ajuda)+'</span>':"")+'</div>';}
function sel(n,rot,v,ops,obr){var id="c_"+n;
  return '<div class="fg"><label for="'+id+'">'+esc(rot)+'</label><select id="'+id+'" data-campo="'+n+'"'+(obr?" data-obr":"")+'>'+(obr?'<option value="">Escolha…</option>':"")+ops.map(function(o){return '<option value="'+esc(o[0])+'"'+(String(o[0])===String(v)?" selected":"")+'>'+esc(o[1])+'</option>';}).join("")+'</select>'+(obr?'<span class="obr">Obrigatório</span>':"")+'</div>';}
function simNao(n,rot,v){return '<div class="fg"><label>'+esc(rot)+'</label><div class="escolhas" data-campo="'+n+'" data-sn data-valor="'+(v?"1":"0")+'"><button type="button" data-v="1" class="'+(v?"sel":"")+'">Sim</button><button type="button" data-v="0" class="'+(v?"":"sel")+'">Não</button></div></div>';}
function escolha(n,rot,v,ops){return '<div class="fg"><label>'+esc(rot)+'</label><div class="escolhas" data-campo="'+n+'" data-obr="escolha" data-valor="'+esc(v||"")+'">'+ops.map(function(o){return '<button type="button" data-v="'+o[0]+'" class="'+(o[0]===v?"sel":"")+'">'+esc(o[1])+'</button>';}).join("")+'</div></div>';}
function val(m,n){var e=$('[data-campo="'+n+'"]',m);return e?String(e.value||"").trim():"";}
function num(m,n){var v=val(m,n);return v===""?null:+v;}
function sn(m,n){var e=$('[data-campo="'+n+'"]',m);return !!e&&e.getAttribute("data-valor")==="1";}
function esc1(m,n){var e=$('[data-campo="'+n+'"]',m);return e?e.getAttribute("data-valor"):null;}
function checksVisuais(m){$$(".checks input",m).forEach(function(c){c.addEventListener("change",function(){c.parentNode.classList.toggle("sel",c.checked);});});}
function ligaEscolhas(m){$$("[data-sn]",m).forEach(function(g){g.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;
  $$("button",g).forEach(function(x){x.classList.toggle("sel",x===b);});g.setAttribute("data-valor",b.getAttribute("data-v"));});});
  $$('.escolhas[data-campo]:not([data-sn])',m).forEach(function(g){if(g.getAttribute("data-campo")!=="papel")g.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;
    $$("button",g).forEach(function(x){x.classList.toggle("sel",x===b);});g.setAttribute("data-valor",b.getAttribute("data-v"));});});}

/* ---------- tela ---------- */
async function carregar(){
  var r=await Promise.all(ENTS.map(function(t){return A.rpc("ca_admin_listar",{p_entidade:t});}));
  ENTS.forEach(function(t,i){S.d[t]=r[i];});
  ["areas","filas"].forEach(function(t){S.d[t].sort(function(a,b){return (a.ordem||0)-(b.ordem||0)||(a.nome<b.nome?-1:1);});});
  S.d.assuntos.sort(function(a,b){return (a.area_id-b.area_id)||((a.ordem||0)-(b.ordem||0));});
  S.d.atendentes.sort(function(a,b){return a.nome<b.nome?-1:1;});S.d.solicitantes.sort(function(a,b){return a.nome<b.nome?-1:1;});
  A.cadAdmin=S.d;
}
function montar(){
  $("#pane-cadastros").innerHTML='<h2>Cadastros</h2><div class="subabas" id="cdSub"></div><div class="barra"><input class="busca" id="cdBusca" type="search" placeholder="Buscar" aria-label="Buscar"><span style="flex:1"></span><button class="bt" id="cdCsv">Baixar Excel</button><button class="bt pri" id="cdNovo">+ Novo</button></div><div id="cdCorpo"><div class="vazio">Carregando…</div></div>';
  $("#cdSub").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;S.sub=b.getAttribute("data-s");S.busca="";$("#cdBusca").value="";A.subHash(S.sub);desenha();b.scrollIntoView({block:"nearest",inline:"nearest"});});
  $("#cdBusca").addEventListener("input",function(e){S.busca=e.target.value;desenhaCorpo();});
  $("#cdNovo").addEventListener("click",function(){editar(null);});
  $("#cdCsv").addEventListener("click",exportar);
  $("#cdCorpo").addEventListener("click",function(e){var x=e.target.closest("[data-apagar]");if(x)return;var tr=e.target.closest("tr[data-id]");if(tr)editar(tr.getAttribute("data-id"));});
  $("#cdCorpo").addEventListener("keydown",function(e){if(e.key==="Enter"){var tr=e.target.closest("tr[data-id]");if(tr)editar(tr.getAttribute("data-id"));}});
  S.montado=true;
}
function chaveDe(E,r){return String(r[E.chave||"id"]);}
function desenha(){
  if(ORDEM.indexOf(S.sub)<0)S.sub="filas";
  $("#cdSub").innerHTML=ORDEM.map(function(k){var E=ENT[k],n=L(E.ent).filter(function(x){return x.ativo!==false&&x.ativa!==false;}).length;
    return '<button data-s="'+k+'" class="'+(S.sub===k?"ativa":"")+'">'+E.nome+' <span class="n">'+n+'</span></button>';}).join("");
  $("#cdNovo").hidden=S.sub==="config";
  desenhaCorpo();
}
function linhas(){var E=ENT[S.sub],l=L(E.ent).slice();if(E.ordem)l.sort(E.ordem);var b=A.norm(S.busca);
  if(!b)return l;var tmp=document.createElement("div");
  return l.filter(function(r){return A.norm(E.cols.map(function(c){tmp.innerHTML=String(c[1](r));return tmp.textContent;}).join(" ")).indexOf(b)>=0;});}
function desenhaCorpo(){
  var E=ENT[S.sub],l=linhas(),el=$("#cdCorpo");
  if(!l.length){el.innerHTML='<div class="vazio">'+(S.busca?"Nada encontrado para a busca.":"Nenhum cadastro ainda. Use + Novo.")+'</div>';return;}
  var lim=E.limite||1e9;
  el.innerHTML='<div class="tabWrap"><table class="tb"><thead><tr>'+E.cols.map(function(c){return '<th class="'+(c[2]||"")+'">'+c[0]+'</th>';}).join("")+(E.apaga?'<th></th>':"")+'</tr></thead><tbody>'+
    l.slice(0,lim).map(function(r){return '<tr data-id="'+esc(chaveDe(E,r))+'" class="clic'+(r.ativo===false||r.ativa===false?" inativo":"")+'" tabindex="0">'+E.cols.map(function(c){return '<td class="'+(c[2]||"")+'">'+c[1](r)+'</td>';}).join("")+
      (E.apaga?'<td class="num"><button class="bt sm perigo" data-apagar="'+esc(chaveDe(E,r))+'">Apagar</button></td>':"")+'</tr>';}).join("")+'</tbody></table></div>'+
    (l.length>lim?'<p class="sub">Mostrando '+lim+' de '+A.num(l.length)+'. Use a busca para achar um consultor.</p>':"")+
    '<p class="ajuda">Clique numa linha para editar. '+(E.apaga?"":"Cadastros não são apagados: desative para tirar do app e manter o histórico.")+'</p>';
  $$("[data-apagar]",el).forEach(function(b){A.doisCliques(b,"Confirmar",async function(){
    try{await A.acao("ca_admin_remover",{p_entidade:E.ent,p_chave:{id:+b.getAttribute("data-apagar")}},"Apagado.");}catch(e){return;}await recarregar();});});
}
async function recarregar(){await carregar();await A.recarregarContexto();if(S.montado&&A.abaAtual==="cadastros")desenha();}
/* abre o formulário de um cadastro a partir de outra tela (ex.: Fluxos) */
A.editarCadastro=async function(sub,id,depois){if(!S.d.assuntos)await carregar();var ant=S.sub;S.sub=sub;editar(id,function(){S.sub=ant;if(depois)depois();});S.sub=ant;};
function editar(id,depois){
  var E=ENT[S.sub],r=id?L(E.ent).find(function(x){return chaveDe(E,x)===id;}):{};if(!r)return;
  var m=A.modal({titulo:(id?"Editar · ":"Novo · ")+E.nome.toLowerCase(),larga:["filas","atendentes","assuntos"].indexOf(S.sub)>=0,corpo:E.form(r),
    rodape:'<button class="bt" data-x>Fechar</button><button class="bt pri" id="cdSalvar">Salvar e fechar</button>'});
  ligaEscolhas(m.el);if(E.depois)E.depois(m.el,r);
  $("#cdSalvar",m.el).addEventListener("click",async function(){
    if(!A.validar(m.el))return;
    var msg=E.validar&&E.validar(m.el,r);if(msg){A.toast(msg,"erro");return;}
    var dados=E.ler(m.el,r);if(r.id!=null)dados.id=r.id;
    document.body.classList.add("ocupado");
    try{var salvo=await A.rpc("ca_admin_salvar",{p_entidade:E.ent,p_dados:dados});if(E.salvarExtra)await E.salvarExtra(m.el,salvo.id);A.toast("Salvo.","ok");}
    catch(e){A.toast(A.traduz(e),"erro");return;}finally{document.body.classList.remove("ocupado");}
    m.fechar();await recarregar();if(depois)depois();
  });
}
function exportar(){var E=ENT[S.sub],tmp=document.createElement("div");
  A.baixarCsv("cadastro_"+S.sub,E.nome,S.busca||"todos",E.cols.map(function(c){return c[0];}),linhas().map(function(r){return E.cols.map(function(c){tmp.innerHTML=String(c[1](r)).replace(/<div/g," <div").replace(/<br>/g," ");return tmp.textContent.replace(/\s+/g," ").trim();});}));}

A.modulos.cadastros={mostrar:async function(sub){if(!S.montado)montar();if(sub&&ENT[sub])S.sub=sub;
  try{await carregar();}catch(e){$("#cdCorpo").innerHTML='<div class="vazio">'+esc(A.traduz(e))+'</div>';return;}desenha();}};
A.carregarCadastrosAdmin=carregar;
A.ENT_CAD=ENT;
})();
