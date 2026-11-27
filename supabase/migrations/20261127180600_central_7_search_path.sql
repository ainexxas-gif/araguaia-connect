-- Central de Atendimento Interno · 7 · search_path fixo em entidade_ok (alerta dos advisors do Supabase)
-- Data: 27/11/2026
create or replace function central_atendimento.entidade_ok(p text) returns boolean
language sql immutable set search_path = central_atendimento as $$
  select p in ('areas','equipes_venda','solicitantes','atendentes','filas','fila_atendentes','horarios','feriados','assuntos','respostas_rapidas','config');
$$;
revoke all on function central_atendimento.entidade_ok(text) from public, anon, authenticated;
