-- =====================================================================
-- Central de Atendimento Interno · 6 · Funções extras do painel (console + indicadores)
-- Data: 27/11/2026 · Pedido: Fabrizzio · Proposto pelo thread do painel web
-- Por quê: o console precisa dos cadastros em modo leitura para qualquer atendente
-- (repasse, transferência, nome das filas), da visão "em atendimento" do supervisor e
-- dos encerrados do dia; os indicadores precisam das chaves (ids) e do 1º contato por linha
-- para filtrar por clique no navegador sem nova consulta.
-- Idempotente (create or replace). Não altera tabela.
-- =====================================================================

-- 1) Cadastros em modo leitura para o console (qualquer atendente ativo).
create or replace function public.ca_console_contexto() returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := exige_login(); a atendentes;
begin
  a := meu_atendente();
  if a.id is null then raise exception 'Você não está cadastrado como atendente.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'areas', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'codigo', codigo, 'nome', nome, 'ordem', ordem, 'ativa', ativa) order by ordem, nome), '[]') from areas),
    'filas', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'codigo', codigo, 'nome', nome, 'area_id', area_id,
                'sla_espera_min', sla_espera_min, 'sla_atendimento_min', sla_atendimento_min, 'ativa', ativa) order by nome), '[]') from filas),
    'assuntos', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'codigo', codigo, 'nome', nome, 'area_id', area_id, 'fila_id', fila_id,
                'documento_tipo', documento_tipo, 'documento_obrigatorio', documento_obrigatorio_no_encerramento, 'ativo', ativo) order by ordem, nome), '[]') from assuntos),
    'atendentes', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'papel', x.papel, 'presenca', x.presenca,
                'area_id', x.area_id, 'capacidade', x.capacidade,
                'filas', (select coalesce(jsonb_agg(fa.fila_id), '[]') from fila_atendentes fa where fa.atendente_id = x.id and fa.ativo),
                'em_atendimento', (select count(*) from chamados c where c.atendente_id = x.id and c.status in ('em_atendimento','aguardando_solicitante')))
                order by x.nome), '[]') from atendentes x where x.ativo),
    'respostas_rapidas', public.ca_respostas_rapidas());
end $$;

-- 2) Listas extras do console: 'equipe' (em atendimento com qualquer um, para supervisor/admin no seu escopo)
--    e 'encerrados_hoje' (os meus; supervisor/admin: do seu escopo). Dia no fuso de Brasília.
create or replace function public.ca_console_lista(p_visao text) returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := exige_login(); a atendentes;
        hoje timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
begin
  a := meu_atendente();
  if a.id is null then raise exception 'Você não está cadastrado como atendente.' using errcode = '42501'; end if;
  if p_visao = 'equipe' then
    if a.papel not in ('supervisor','admin') then raise exception 'Acesso restrito a supervisores e administração.' using errcode = '42501'; end if;
    return (select coalesce(jsonb_agg(chamado_json(c.id) order by c.ultima_msg_em desc nulls last), '[]')
            from (select c.id, c.ultima_msg_em from chamados c
                  where c.status in ('em_atendimento','aguardando_solicitante') and atende_chamado(c.id)
                  order by c.ultima_msg_em desc nulls last limit 500) c);
  elsif p_visao = 'encerrados_hoje' then
    return (select coalesce(jsonb_agg(chamado_json(c.id) || jsonb_build_object('desistencia_em', c.desistencia_em) order by c.fim desc), '[]')
            from (select c.id, c.desistencia_em, coalesce(c.encerrado_em, c.desistencia_em) as fim from chamados c
                  where c.status in ('encerrado','desistiu') and c.entrou_fila_em is not null
                    and coalesce(c.encerrado_em, c.desistencia_em) >= hoje
                    and (c.atendente_id = a.id or (a.papel in ('supervisor','admin') and atende_chamado(c.id)))
                  order by fim desc limit 500) c);
  else
    raise exception 'Visão desconhecida: %', p_visao using errcode = '23514';
  end if;
end $$;

-- 3) Base de chamados com as chaves e o 1º contato por linha (mesma regra de ca_indicadores).
create or replace function public.ca_admin_chamados(p_de date, p_ate date, p_area smallint default null,
  p_limite integer default 1000, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := exige_login(); a atendentes;
begin
  a := meu_atendente();
  if a.papel is null or a.papel not in ('supervisor','admin') then raise exception 'Acesso restrito a supervisores e administração.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'protocolo', c.protocolo, 'status', c.status,
      'area_id', c.area_id, 'fila_id', c.fila_id, 'assunto_id', c.assunto_id, 'atendente_id', c.atendente_id, 'solicitante_id', c.solicitante_id,
      'area', ar.nome, 'assunto', s.nome, 'fila', f.nome,
      'matricula', so.matricula, 'solicitante', so.nome, 'equipe', e.codigo, 'atendente', at.nome,
      'criado_em', c.criado_em, 'entrou_fila_em', c.entrou_fila_em, 'assumido_em', c.assumido_em,
      'primeira_resposta_em', c.primeira_resposta_em, 'encerrado_em', c.encerrado_em, 'desistencia_em', c.desistencia_em,
      'espera_seg', c.espera_seg, 'atendimento_seg', c.atendimento_seg, 'total_seg', c.total_seg,
      'fora_horario', c.fora_horario, 'resultado', c.resultado, 'documento_tipo', c.documento_tipo,
      'documento_numero', c.documento_numero, 'qtd_transferencias', c.qtd_transferencias,
      'desistencia_etapa', c.desistencia_etapa, 'nota', av.nota, 'comentario', av.comentario,
      'resolvido_1o_contato', (c.status = 'encerrado' and c.resultado = 'resolvido' and not exists (
          select 1 from chamados d where d.solicitante_id = c.solicitante_id and d.assunto_id = c.assunto_id
            and d.id <> c.id and d.status <> 'bot' and d.criado_em > c.criado_em
            and d.criado_em <= c.encerrado_em + interval '72 hours'))
    ) order by c.criado_em, c.id)
    from (select * from chamados c
          where (c.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
            and c.status <> 'bot'
            and (p_area is null or c.area_id = p_area)
            and (a.papel = 'admin' or c.area_id = a.area_id)
          order by c.criado_em, c.id
          limit least(greatest(p_limite, 1), 1000) offset greatest(p_offset, 0)) c
    join areas ar on ar.id = c.area_id join assuntos s on s.id = c.assunto_id join filas f on f.id = c.fila_id
    join solicitantes so on so.id = c.solicitante_id
    left join equipes_venda e on e.id = c.equipe_venda_id
    left join atendentes at on at.id = c.atendente_id
    left join avaliacoes av on av.chamado_id = c.id), '[]');
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('ca_console_contexto','ca_console_lista','ca_admin_chamados') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
