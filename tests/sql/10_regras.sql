-- Bateria de regras. Roda tudo dentro de um bloco que termina em erro: nada fica gravado.
-- Uso local: psql -f tests/sql/00_stub_supabase.sql; migrações; psql -f tests/sql/10_regras.sql
-- No Supabase: colar no SQL Editor (o erro final "RESULTADO" traz o relatório e desfaz tudo).
create or replace function pg_temp.como(p_email text, p_oauth boolean default true) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub', md5(p_email)::uuid, 'email', p_email,
    'amr', case when p_oauth then json_build_array(json_build_object('method','oauth')) else json_build_array(json_build_object('method','password')) end)::text, true);
end $$;
create or replace function pg_temp.root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;

do $$
declare r text := ''; j jsonb; cid uuid; cid2 uuid; ok boolean; n int; ass_ov smallint; ass_rc smallint; fila_ov smallint; fila_mod smallint;
  at1 uuid; at2 uuid; adm uuid; e text;
  procedure_ok text;
begin
  perform pg_temp.root();
  select id, fila_id into ass_ov, fila_ov from central_atendimento.assuntos where codigo = 'OV';
  select id into ass_rc from central_atendimento.assuntos where codigo = 'RC';
  select id into fila_mod from central_atendimento.filas where codigo = 'OC_MODIFICACAO';
  insert into central_atendimento.atendentes(email, nome, area_id, papel, presenca) values
    ('ana.atendente@araguaia.com.br', 'Ana Atendente', (select id from central_atendimento.areas where codigo='PI'), 'atendente', 'offline') returning id into at1;
  insert into central_atendimento.atendentes(email, nome, area_id, papel, presenca) values
    ('beto.oc@araguaia.com.br', 'Beto OC', (select id from central_atendimento.areas where codigo='OC'), 'atendente', 'online') returning id into at2;
  insert into central_atendimento.atendentes(email, nome, papel) values ('admin.central@araguaia.com.br', 'Admin', 'admin') returning id into adm;
  insert into central_atendimento.fila_atendentes values (fila_ov, at1, 1, true), (fila_mod, at2, 1, true);

  -- 1. Anônimo e login sem OAuth são recusados
  perform set_config('role', 'anon', true);
  begin perform public.ca_sessao(); r := r || '1 FALHOU; '; exception when insufficient_privilege then r := r || '1 ok; '; end;
  perform pg_temp.como('fulano.teste@araguaia.com.br', false);
  begin perform public.ca_sessao(); r := r || '1b FALHOU; '; exception when sqlstate '28000' then r := r || '1b ok; '; end;
  perform pg_temp.como('alguem@gmail.com');
  begin perform public.ca_sessao(); r := r || '1c FALHOU; '; exception when sqlstate '28000' then r := r || '1c ok; '; end;

  -- 2. Leitura direta das tabelas é recusada (exceto chamados/mensagens filtrados por RLS)
  perform pg_temp.como('fulano.teste@araguaia.com.br');
  begin perform count(*) from central_atendimento.solicitantes; r := r || '2 FALHOU; '; exception when insufficient_privilege then r := r || '2 ok; '; end;
  begin delete from central_atendimento.chamados; r := r || '2b FALHOU; '; exception when insufficient_privilege then r := r || '2b ok; '; end;
  begin truncate central_atendimento.mensagens; r := r || '2c FALHOU; '; exception when insufficient_privilege then r := r || '2c ok; '; end;

  -- 3. Identificação por matrícula
  j := public.ca_sessao();
  r := r || '3 ' || case when (j->>'precisa_identificar')::boolean then 'ok' else 'FALHOU' end || '; ';
  begin perform public.ca_identificar('10002'); r := r || '3b FALHOU; '; exception when insufficient_privilege then r := r || '3b ok; '; end;
  begin perform public.ca_identificar('99999'); r := r || '3c FALHOU; '; exception when foreign_key_violation then r := r || '3c ok; '; end;
  j := public.ca_identificar('10001');
  r := r || '3d ' || case when j->'solicitante'->>'matricula' = '10001' and j->'solicitante'->>'nome' = 'Fulano Teste' then 'ok' else 'FALHOU '||j::text end || '; ';

  -- 4. Menu traz 3 áreas com assuntos
  j := public.ca_menu();
  r := r || '4 ' || case when jsonb_array_length(j) = 3 and jsonb_array_length(j->0->'assuntos') = 3 then 'ok' else 'FALHOU' end || '; ';

  -- 5. Fluxo: validação no servidor
  j := public.ca_iniciar(ass_ov); cid := (j->'chamado'->>'id')::uuid;
  r := r || '5 ' || case when j->'chamado'->>'status' = 'bot' and j->'fluxo'->'definicao' ? 'nos' then 'ok' else 'FALHOU' end || '; ';
  j := public.ca_iniciar(ass_ov);
  r := r || '5b ' || case when (j->'chamado'->>'id')::uuid = cid then 'ok' else 'FALHOU' end || '; ';
  begin perform public.ca_enviar_respostas(cid, '{"acao":"Alterar OV","numero_ov":"12AB"}'); r := r || '5c FALHOU; ';
  exception when check_violation then get stacked diagnostics e = message_text; r := r || '5c ok(' || e || '); '; end;
  begin perform public.ca_enviar_respostas(cid, '{"acao":"Alterar OV","numero_ov":"1234567","material":"55","centro":"1001"}'); r := r || '5d FALHOU; ';
  exception when check_violation then get stacked diagnostics e = message_text; r := r || '5d ok(' || e || '); '; end;
  -- Liberar OV pula material/centro/quantidade
  j := public.ca_enviar_respostas(cid, '{"acao":"Liberar OV","numero_ov":"1234567","material":"ignorado"}');
  r := r || '5e ' || case when j->>'status' = 'na_fila' and not (j->'respostas' ? 'material') and j->>'resumo' like '%Nº da OV: 1234567%' then 'ok' else 'FALHOU '||j::text end || '; ';
  begin perform public.ca_enviar_respostas(cid, '{}'); r := r || '5f FALHOU; '; exception when check_violation then r := r || '5f ok; '; end;

  -- 6. Isolamento: outro consultor não vê
  perform pg_temp.root();
  insert into central_atendimento.solicitantes(matricula, nome, email) values ('10002', 'Ciclana Silva', 'ciclana.silva@araguaia.com.br');
  perform pg_temp.como('ciclana.silva@araguaia.com.br');
  begin perform public.ca_chamado(cid); r := r || '6 FALHOU; '; exception when insufficient_privilege then r := r || '6 ok; '; end;
  select count(*) into n from central_atendimento.chamados;  -- RLS
  r := r || '6b ' || case when n = 0 then 'ok' else 'FALHOU' end || '; ';
  begin perform public.ca_enviar_mensagem(cid, 'oi'); r := r || '6c FALHOU; '; exception when insufficient_privilege then r := r || '6c ok; '; end;

  -- 7. Atendente: ficou na fila (Ana offline); ao ficar online recebe automaticamente
  perform pg_temp.como('ana.atendente@araguaia.com.br');
  j := public.ca_painel_atendente();
  r := r || '7 ' || case when jsonb_array_length(j->'fila') = 1 and jsonb_array_length(j->'meus') = 0 then 'ok' else 'FALHOU '||j::text end || '; ';
  perform public.ca_presenca('online');
  j := public.ca_painel_atendente();
  r := r || '7b ' || case when jsonb_array_length(j->'meus') = 1 and j->'meus'->0->>'status' = 'em_atendimento' then 'ok' else 'FALHOU' end || '; ';
  -- Beto (outra fila) não vê
  perform pg_temp.como('beto.oc@araguaia.com.br');
  begin perform public.ca_chamado(cid); r := r || '7c FALHOU; '; exception when insufficient_privilege then r := r || '7c ok; '; end;

  -- 8. Conversa, nota interna, leitura
  perform pg_temp.como('ana.atendente@araguaia.com.br');
  perform public.ca_enviar_mensagem(cid, 'Olá, vou liberar.');
  perform public.ca_enviar_mensagem(cid, 'cliente com crédito ok', 'texto', null, true);
  perform pg_temp.como('fulano.teste@araguaia.com.br');
  j := public.ca_chamado(cid);
  r := r || '8 ' || case when not exists (select 1 from jsonb_array_elements(j->'mensagens') m where (m->>'interna')::boolean)
                          and j->>'primeira_resposta_em' is not null and j->'eventos' = 'null'::jsonb then 'ok' else 'FALHOU' end || '; ';
  select count(*) into n from central_atendimento.mensagens where interna;  -- RLS esconde nota interna
  r := r || '8b ' || case when n = 0 then 'ok' else 'FALHOU' end || '; ';
  select count(*) into n from central_atendimento.mensagens;
  r := r || '8c ' || case when n >= 3 then 'ok' else 'FALHOU '||n end || '; ';
  n := public.ca_marcar_lidas(cid);
  r := r || '8d ' || case when n >= 3 then 'ok' else 'FALHOU '||n end || '; ';
  begin perform public.ca_enviar_mensagem(cid, 'x', 'texto', null, true); r := r || '8e FALHOU; '; exception when insufficient_privilege then r := r || '8e ok; '; end;
  perform public.ca_enviar_mensagem(cid, 'Obrigado');
  begin perform public.ca_avaliar(cid, 5::smallint); r := r || '8f FALHOU; '; exception when check_violation then r := r || '8f ok; '; end;

  -- 9. Transferência para outra fila (motivo obrigatório); Beto online recebe
  perform pg_temp.como('ana.atendente@araguaia.com.br');
  begin perform public.ca_transferir(cid, fila_mod, null, ''); r := r || '9 FALHOU; '; exception when check_violation then r := r || '9 ok; '; end;
  j := public.ca_transferir(cid, fila_mod, null, 'É modificação de pedido');
  r := r || '9b ' || case when j->'atendente'->>'nome' = 'Beto OC' and (j->>'qtd_transferencias')::int = 1 and j->'area'->>'codigo' = 'OC' then 'ok' else 'FALHOU '||j::text end || '; ';

  -- 10. Encerrar exige nº do documento quando o assunto exige
  perform pg_temp.como('beto.oc@araguaia.com.br');
  begin perform public.ca_encerrar(cid, 'resolvido'); r := r || '10 FALHOU; '; exception when check_violation then r := r || '10 ok; '; end;
  begin perform public.ca_encerrar(cid, 'qualquer'); r := r || '10b FALHOU; '; exception when check_violation then r := r || '10b ok; '; end;
  j := public.ca_encerrar(cid, 'resolvido', null, '1234567', 'liberada');
  r := r || '10c ' || case when j->>'status' = 'encerrado' and j->>'documento_tipo' = 'OV' and (j->>'espera_seg') is not null then 'ok' else 'FALHOU '||j::text end || '; ';
  begin perform public.ca_enviar_mensagem(cid, 'mais uma'); r := r || '10d FALHOU; '; exception when check_violation then r := r || '10d ok; '; end;

  -- 11. Avaliação 1–5, uma vez, só o dono
  begin perform public.ca_avaliar(cid, 5::smallint); r := r || '11 FALHOU; '; exception when insufficient_privilege then r := r || '11 ok; '; end;
  perform pg_temp.como('fulano.teste@araguaia.com.br');
  begin perform public.ca_avaliar(cid, 6::smallint); r := r || '11b FALHOU; '; exception when check_violation then r := r || '11b ok; '; end;
  j := public.ca_avaliar(cid, 4::smallint, 'rápido');
  r := r || '11c ' || case when (j->'avaliacao'->>'nota')::int = 4 then 'ok' else 'FALHOU' end || '; ';
  begin perform public.ca_avaliar(cid, 5::smallint); r := r || '11d FALHOU; '; exception when unique_violation then r := r || '11d ok; '; end;

  -- 12. Desistência na fila
  j := public.ca_iniciar(ass_rc); cid2 := (j->'chamado'->>'id')::uuid;
  perform public.ca_enviar_respostas(cid2, '{"acao":"Status da RC","numero_rc":"7654321"}');
  j := public.ca_desistir(cid2, 'resolvi por telefone');
  r := r || '12 ' || case when j->>'status' = 'desistiu' then 'ok' else 'FALHOU' end || '; ';
  j := public.ca_meus_chamados();
  r := r || '12b ' || case when jsonb_array_length(j) = 2 then 'ok' else 'FALHOU' end || '; ';

  -- 13. Administração
  begin perform public.ca_admin_listar('areas'); r := r || '13 FALHOU; '; exception when insufficient_privilege then r := r || '13 ok; '; end;
  begin perform public.ca_indicadores(current_date, current_date); r := r || '13b FALHOU; '; exception when insufficient_privilege then r := r || '13b ok; '; end;
  perform pg_temp.como('admin.central@araguaia.com.br');
  begin perform public.ca_admin_listar('auditoria'); r := r || '13c FALHOU; '; exception when check_violation then r := r || '13c ok; '; end;
  j := public.ca_admin_salvar('areas', '{"codigo":"CRED","nome":"Crédito e Cobrança","ordem":4}');
  j := public.ca_admin_salvar('areas', jsonb_build_object('id', (j->>'id')::int, 'nome', 'Crédito e Cobrança (piloto)'));
  r := r || '13d ' || case when j->>'nome' = 'Crédito e Cobrança (piloto)' and j->>'codigo' = 'CRED' then 'ok' else 'FALHOU '||j::text end || '; ';
  j := public.ca_admin_salvar('fila_atendentes', jsonb_build_object('fila_id', fila_mod, 'atendente_id', at1, 'prioridade', 2));
  j := public.ca_admin_salvar('fila_atendentes', jsonb_build_object('fila_id', fila_mod, 'atendente_id', at1, 'prioridade', 3));
  r := r || '13e ' || case when (j->>'prioridade')::int = 3 then 'ok' else 'FALHOU' end || '; ';
  begin perform public.ca_admin_remover('areas', '{"id":1}'); r := r || '13f FALHOU; '; exception when check_violation then r := r || '13f ok; '; end;
  begin perform public.ca_admin_fluxo_salvar(ass_ov, '{"nos":[{"id":"a","tipo":"pergunta","chave":"X","rotulo":"r","campo":"texto"}]}'); r := r || '13g FALHOU; ';
  exception when check_violation then r := r || '13g ok; '; end;
  j := public.ca_admin_fluxo_salvar(ass_ov, '{"nos":[{"id":"a","tipo":"pergunta","chave":"numero_ov","rotulo":"Nº da OV","campo":"documento","obrigatorio":true},{"id":"f","tipo":"fim"}]}');
  j := public.ca_admin_fluxo_publicar((j->>'id')::int);
  perform pg_temp.root();
  select count(*) into n from central_atendimento.fluxos where assunto_id = ass_ov and status = 'publicado';
  perform pg_temp.como('admin.central@araguaia.com.br');
  r := r || '13h ' || case when j->>'status' = 'publicado' and (j->>'versao')::int = 2 and n = 1 then 'ok' else 'FALHOU' end || '; ';
  j := public.ca_indicadores(current_date - 1, current_date + 1);
  r := r || '13i ' || case when (j->'resumo'->>'chamados')::int = 2 and (j->'resumo'->>'desistencias')::int = 1
                             and (j->'resumo'->>'nota_media')::numeric = 4 and (j->'resumo'->>'pct_resolvido_1o_contato')::numeric = 100 then 'ok' else 'FALHOU '||(j->'resumo')::text end || '; ';
  j := public.ca_admin_chamados(current_date - 1, current_date + 1);
  r := r || '13j ' || case when jsonb_array_length(j) = 2 then 'ok' else 'FALHOU' end || '; ';

  -- 14. Abandono no fluxo vira desistência
  perform pg_temp.root();
  insert into central_atendimento.chamados(protocolo, solicitante_id, area_id, assunto_id, fila_id, status, criado_em)
  select central_atendimento.novo_protocolo(), s.id, a.area_id, a.id, a.fila_id, 'bot', now() - interval '2 hours'
  from central_atendimento.solicitantes s, central_atendimento.assuntos a where s.matricula = '10001' and a.codigo = 'RC';
  n := central_atendimento.fechar_abandonados();
  r := r || '14 ' || case when n = 1 then 'ok' else 'FALHOU '||n end || '; ';
  select count(*) into n from central_atendimento.auditoria where tabela = 'areas' and por_email = 'admin.central@araguaia.com.br';
  r := r || '15 ' || case when n >= 2 then 'ok' else 'FALHOU '||n end || '; ';

  raise exception 'RESULTADO: %', r;
end $$;
