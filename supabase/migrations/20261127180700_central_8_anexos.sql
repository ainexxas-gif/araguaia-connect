-- =====================================================================
-- Central de Atendimento Interno · 8 · Anexos (fotos, CNH, PDFs) no chat
-- Data: 27/11/2026 · Pedido: Fabrizzio ("tanto o vendedor quanto o atendente têm que poder mandar anexos")
-- Bucket privado "central-atendimento". Caminho: <id do chamado>/<arquivo>.
-- Quem pode ver o chamado pode ler os arquivos dele; quem pode ver e o chamado está aberto pode enviar.
-- Link de download é assinado (expira), nunca público. Sem DROP (ver armadilha no README).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('central-atendimento', 'central-atendimento', false, 20971520,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif','application/pdf',
              'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'text/plain','text/csv'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Confere o caminho "<uuid do chamado>/..." e o acesso ao chamado.
create or replace function central_atendimento.anexo_ok(p_nome text, p_escrever boolean) returns boolean
language plpgsql stable security definer set search_path = central_atendimento as $$
declare cid uuid; st status_chamado;
begin
  if p_nome !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$' then return false; end if;
  cid := split_part(p_nome, '/', 1)::uuid;
  if not pode_ver_chamado(cid) then return false; end if;
  if p_escrever then
    select status into st from chamados where id = cid;
    return st in ('bot','na_fila','em_atendimento','aguardando_solicitante');
  end if;
  return true;
end $$;
revoke all on function central_atendimento.anexo_ok(text, boolean) from public, anon;
grant execute on function central_atendimento.anexo_ok(text, boolean) to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'central_atendimento_anexos_ler') then
    create policy central_atendimento_anexos_ler on storage.objects for select to authenticated
      using (bucket_id = 'central-atendimento' and central_atendimento.anexo_ok(name, false));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'central_atendimento_anexos_enviar') then
    create policy central_atendimento_anexos_enviar on storage.objects for insert to authenticated
      with check (bucket_id = 'central-atendimento' and central_atendimento.anexo_ok(name, true));
  end if;
end $$;

-- Mensagem com anexo: o arquivo precisa estar na pasta do próprio chamado.
create or replace function public.ca_enviar_mensagem(p_chamado uuid, p_conteudo text, p_tipo text default 'texto',
  p_anexo jsonb default null, p_interna boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); c chamados; a atendentes; autor autor_mensagem; mid bigint; tipo text := coalesce(p_tipo, 'texto');
begin
  select * into c from chamados where id = p_chamado for update;
  if c.id is null then raise exception 'Chamado não encontrado.' using errcode = '42501'; end if;
  a := meu_atendente();
  if a.id is not null and atende_chamado(c.id) and (not dono_chamado(c.id) or c.atendente_id = a.id) then
    autor := 'atendente';
  elsif dono_chamado(c.id) then
    autor := 'solicitante';
    if p_interna then raise exception 'Notas internas são só para atendentes.' using errcode = '42501'; end if;
  else
    raise exception 'Chamado não encontrado.' using errcode = '42501';
  end if;
  if c.status in ('encerrado','desistiu') then
    raise exception 'Este chamado está encerrado. Abra um novo pelo menu.' using errcode = '23514';
  end if;
  if c.status = 'bot' then raise exception 'Termine de responder as perguntas antes de conversar.' using errcode = '23514'; end if;
  if p_anexo is not null then
    if coalesce(p_anexo->>'path', '') not like c.id::text || '/%' then
      raise exception 'Anexo inválido para este chamado.' using errcode = '23514';
    end if;
    tipo := case when coalesce(p_anexo->>'mime', '') like 'image/%' then 'imagem' else 'arquivo' end;
  end if;
  if coalesce(btrim(p_conteudo), '') = '' and p_anexo is null then raise exception 'Mensagem vazia.' using errcode = '23514'; end if;
  if autor = 'atendente' and not p_interna then
    if c.status = 'na_fila' then
      update chamados set atendente_id = a.id, status = 'em_atendimento', assumido_em = coalesce(assumido_em, now()) where id = c.id;
      perform evento(c.id, 'assumido', null, null, null, null, a.id);
    elsif c.atendente_id is distinct from a.id and a.papel = 'atendente' then
      raise exception 'Este chamado está com outro atendente.' using errcode = '42501';
    end if;
  end if;
  if autor = 'solicitante' and c.status = 'aguardando_solicitante' then
    update chamados set status = 'em_atendimento' where id = c.id;
    perform evento(c.id, 'retomado');
  end if;
  insert into mensagens(chamado_id, autor, atendente_id, conteudo, tipo, anexo_path, anexo_nome, anexo_mime, interna)
  values (c.id, autor, case when autor = 'atendente' then a.id end, nullif(btrim(p_conteudo), ''),
          tipo, p_anexo->>'path', left(p_anexo->>'nome', 200), left(p_anexo->>'mime', 100), coalesce(p_interna, false))
  returning id into mid;
  return jsonb_build_object('id', mid, 'autor', autor, 'criada_em', now());
end $$;
revoke all on function public.ca_enviar_mensagem(uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.ca_enviar_mensagem(uuid, text, text, jsonb, boolean) to authenticated;
