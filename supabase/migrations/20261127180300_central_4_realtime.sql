-- =====================================================================
-- Central de Atendimento Interno · 4/6 · Realtime
-- Data: 27/11/2026 · Pedido: Fabrizzio
-- O app e o console escutam INSERT/UPDATE em mensagens e chamados pelo Realtime
-- (postgres_changes). O Realtime respeita RLS, então liberamos SELECT só nessas
-- duas tabelas e só nas linhas que a pessoa pode ver. Notas internas ficam
-- invisíveis para o consultor. Gravação continua só pelas funções public.ca_*.
-- O schema não precisa estar exposto na API REST para isso funcionar.
-- =====================================================================
grant usage on schema central_atendimento to authenticated;
grant select on central_atendimento.chamados, central_atendimento.mensagens to authenticated;
grant execute on function central_atendimento.meu_email(), central_atendimento.dono_chamado(uuid),
  central_atendimento.atende_chamado(uuid), central_atendimento.pode_ver_chamado(uuid) to authenticated;

drop policy if exists chamados_ver on central_atendimento.chamados;
create policy chamados_ver on central_atendimento.chamados for select to authenticated
  using (central_atendimento.pode_ver_chamado(id));

drop policy if exists mensagens_ver on central_atendimento.mensagens;
create policy mensagens_ver on central_atendimento.mensagens for select to authenticated
  using (case when interna then central_atendimento.atende_chamado(chamado_id)
              else central_atendimento.pode_ver_chamado(chamado_id) end);

do $$ begin
  begin alter publication supabase_realtime add table central_atendimento.mensagens; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table central_atendimento.chamados;  exception when duplicate_object then null; end;
end $$;
