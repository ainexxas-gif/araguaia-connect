-- =====================================================================
-- Central de Atendimento Interno · 9 · Avaliação de 1 a 10 (era 1 a 5)
-- Data: 27/11/2026 · Pedido: Fabrizzio
-- Parte A (funções, sem DROP): aplicada pelo Claude.
-- Parte B (troca da regra da coluna): tem DROP CONSTRAINT, então roda no SQL Editor da branch log-inov.
-- =====================================================================

-- Parte A
create or replace function public.ca_avaliar(p_chamado uuid, p_nota smallint, p_comentario text default null) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); c chamados;
begin
  select * into c from chamados where id = p_chamado;
  if c.id is null or not dono_chamado(c.id) then raise exception 'Chamado não encontrado.' using errcode = '42501'; end if;
  if c.status <> 'encerrado' then raise exception 'A avaliação abre quando o chamado for encerrado.' using errcode = '23514'; end if;
  if p_nota is null or p_nota not between 1 and 10 then raise exception 'Escolha uma nota de 1 a 10.' using errcode = '23514'; end if;
  if exists (select 1 from avaliacoes where chamado_id = c.id) then raise exception 'Este chamado já foi avaliado.' using errcode = '23505'; end if;
  insert into avaliacoes(chamado_id, nota, comentario) values (c.id, p_nota, nullif(btrim(p_comentario), ''));
  perform evento(c.id, 'avaliado', p_nota::text);
  return chamado_json(c.id);
end $$;

create or replace function public.ca_encerrar(p_chamado uuid, p_resultado text, p_documento_tipo text default null,
  p_documento_numero text default null, p_obs text default null) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); c chamados; s assuntos;
begin
  select * into c from chamados where id = p_chamado for update;
  if c.id is null or not atende_chamado(c.id) then raise exception 'Chamado não encontrado.' using errcode = '42501'; end if;
  if c.status not in ('na_fila','em_atendimento','aguardando_solicitante') then raise exception 'Este chamado já foi encerrado.' using errcode = '23514'; end if;
  if p_resultado is null or p_resultado not in (select unnest(enum_range(null::resultado_chamado))::text) then
    raise exception 'Escolha o resultado do atendimento.' using errcode = '23514';
  end if;
  select * into s from assuntos where id = c.assunto_id;
  if s.documento_obrigatorio_no_encerramento and p_resultado in ('resolvido','resolvido_parcial')
     and coalesce(btrim(p_documento_numero), '') = '' then
    raise exception 'Informe o nº do documento (%).', coalesce(s.documento_tipo, 'documento') using errcode = '23514';
  end if;
  update chamados set status = 'encerrado', resultado = p_resultado::resultado_chamado,
         resultado_obs = nullif(btrim(p_obs), ''),
         documento_tipo = coalesce(nullif(p_documento_tipo, ''), case when nullif(btrim(p_documento_numero), '') is not null then s.documento_tipo end),
         documento_numero = nullif(btrim(p_documento_numero), ''),
         atendente_id = coalesce(atendente_id, (meu_atendente()).id),
         assumido_em = coalesce(assumido_em, now()),
         encerrado_em = now()
  where id = c.id;
  perform evento(c.id, 'encerrado', p_resultado);
  perform msg_sistema(c.id, 'Atendimento encerrado. Como foi? Dê uma nota de 1 a 10.');
  perform distribuir(c.fila_id);
  return chamado_json(c.id);
end $$;

-- Parte B (rodar no SQL Editor da log-inov)
-- alter table central_atendimento.avaliacoes drop constraint if exists avaliacoes_nota_check;
-- alter table central_atendimento.avaliacoes add constraint avaliacoes_nota_check check (nota between 1 and 10);
