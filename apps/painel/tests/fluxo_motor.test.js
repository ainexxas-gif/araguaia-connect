/* node --test tests/  · motor de fluxos (mesmas regras de validar_definicao/validar_respostas do banco) */
const test=require("node:test"),assert=require("node:assert");
const fs=require("fs"),path=require("path");
const F=require("../site/fluxo_motor.js");

const def={inicio:"p1",nos:[
  {id:"p1",tipo:"pergunta",chave:"acao",rotulo:"O que você precisa?",campo:"opcoes",opcoes:["Criar","Alterar"],obrigatorio:true},
  {id:"p2",tipo:"pergunta",chave:"numero_ov",rotulo:"Nº da OV",campo:"documento",regex:"^45\\d{8}$",msg_erro:"A OV tem 10 dígitos e começa com 45.",obrigatorio:true},
  {id:"p3",tipo:"pergunta",chave:"cpf",rotulo:"CPF do motorista",campo:"texto",validador:"cpf",obrigatorio:false},
  {id:"fim",tipo:"fim"}],
  arestas:[{de:"p1",para:"p3",se:{chave:"acao",igual:"Criar"}},{de:"p1",para:"p2"},{de:"p2",para:"fim"},{de:"p3",para:"fim"}]};

test("desvio condicional vem antes da ligação padrão",()=>{
  assert.equal(F.proximo(def,"p1",{acao:"Criar"}),"p3");
  assert.equal(F.proximo(def,"p1",{acao:"Alterar"}),"p2");
});
test("sem ligações segue a ordem da lista; só condicionais sem acerto encerra",()=>{
  const d={nos:[{id:"a",tipo:"mensagem"},{id:"b",tipo:"mensagem"}],arestas:[]};
  assert.equal(F.proximo(d,"a",{}),"b");
  const d2={nos:d.nos,arestas:[{de:"a",para:"b",se:{chave:"x",igual:1}}]};
  assert.equal(F.proximo(d2,"a",{}),null);
});
test("regex, CPF e opções inválidas são recusados com a mensagem certa",()=>{
  assert.throws(()=>F.validarResposta(def.nos[1],"123"),/10 dígitos/);
  assert.equal(F.validarResposta(def.nos[1],"4500123456").txt,"4500123456");
  assert.throws(()=>F.validarResposta(def.nos[2],"111.111.111-11"),/CPF inválido/);
  assert.equal(F.validarResposta(def.nos[2],"529.982.247-25").v,"52998224725");
  assert.throws(()=>F.validarResposta(def.nos[0],"Cancelar"),/opção válida/);
});
test("resumo só com as perguntas do caminho percorrido",()=>{
  const r=F.validarRespostas(def,{acao:"Alterar",numero_ov:"4500123456",cpf:"52998224725"});
  assert.deepEqual(r.itens.map(i=>i.chave),["acao","numero_ov"]);
  assert.equal(r.resumo,"O que você precisa?: Alterar\nNº da OV: 4500123456");
});
test("data no passado recusada quando min_hoje; sim/não normalizado",()=>{
  assert.throws(()=>F.validarResposta({rotulo:"Data",campo:"data",min_hoje:true},"2000-01-01"),/passada/);
  assert.equal(F.validarResposta({rotulo:"Data",campo:"data"},"2026-12-01").txt,"01/12/2026");
  assert.equal(F.validarResposta({rotulo:"Ok?",campo:"sim_nao"},"não").v,false);
});
test("todos os fluxos da carga inicial são válidos e chegam ao fim",()=>{
  const dir=process.env.MIGRACOES||path.join(__dirname,"..","..","..","supabase","migrations");
  const arq=fs.readdirSync(dir).filter(f=>f.includes("carga_inicial")).sort().pop();
  const sql=fs.readFileSync(path.join(dir,arq),"utf8");
  const fluxos=[...sql.matchAll(/\('([A-Z_]+)', \$j\$([\s\S]*?)\$j\$\)/g)];
  assert.ok(fluxos.length>=9,"esperava ao menos 9 fluxos, li "+fluxos.length);
  for(const [,cod,j] of fluxos){const d=JSON.parse(j);F.validarDefinicao(d);
    assert.ok(d.nos.some(n=>n.tipo==="fim"),cod+" sem passo de fim");}
});
