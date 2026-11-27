/* node --test tests/  · motor de indicadores (mesmas definições de ca_indicadores) */
const test=require("node:test"),assert=require("node:assert");
const M=require("../site/motor.js");
const base=(o)=>Object.assign({solicitante_id:1,criado_em:"2026-11-23T13:00:00Z",entrou_fila_em:"2026-11-23T13:00:00Z",status:"encerrado",
  espera_seg:300,atendimento_seg:600,total_seg:900,nota:null,resolvido_1o_contato:false,documento_numero:null,qtd_transferencias:0,fora_horario:false},o);

test("espera e atendimento são medidos separados",()=>{
  const r=M.resumo(M.preparar([base({}),base({espera_seg:900,atendimento_seg:300,total_seg:1200})]));
  assert.equal(r.esperaMed,10);assert.equal(r.atendMed,7.5);
});
test("concluídos em até 30 min e 1º contato contam sobre encerrados",()=>{
  const r=M.resumo(M.preparar([base({total_seg:1800,resolvido_1o_contato:true}),base({total_seg:1801}),base({status:"desistiu",total_seg:null})]));
  assert.equal(r.encerrados,2);assert.equal(r.ate30,0.5);assert.equal(r.fcr,0.5);
  assert.equal(r.desistencias,1);assert.ok(Math.abs(r.desist-1/3)<1e-9);
});
test("avaliação: média e taxa de resposta",()=>{
  const r=M.resumo(M.preparar([base({nota:5}),base({nota:3}),base({})]));
  assert.equal(r.avalMedia,4);assert.ok(Math.abs(r.avalResp-2/3)<1e-9);
});
test("hora e dia da semana no fuso de Brasília",()=>{
  const [o]=M.preparar([base({criado_em:"2026-11-24T02:30:00Z"})]); /* segunda 23:30 em SP */
  assert.equal(o.h,23);assert.equal(o.dow,1);assert.equal(o.dia,"2026-11-23");
  const g=M.mapaHora([o]);assert.equal(g[1][23],1);
});
test("série diária preenche dias sem chamado com zero",()=>{
  const s=M.serieDia(M.preparar([base({})]),"2026-11-22","2026-11-24");
  assert.deepEqual(s.map(x=>x.n),[0,1,0]);
});
