-- =====================================================================
-- Central de Atendimento Interno · 2/6 · Funções internas (identidade, regras, motor do fluxo)
-- Data: 27/11/2026 · Pedido: Fabrizzio
-- Nenhuma destas funções é exposta ao front; ficam só no schema central_atendimento.
-- =====================================================================

-- Identidade: só login Microsoft (OAuth) com e-mail @araguaia.com.br, mesmo padrão
-- de claude_licencas.meu_email().
create or replace function central_atendimento.meu_email() returns text
language sql stable security definer set search_path = central_atendimento as $$
  select case
    when auth.uid() is not null
     and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "oauth"}]'::jsonb
     and lower(coalesce(auth.jwt() ->> 'email', '')) ~ '@araguaia\.com\.br$'
    then lower(auth.jwt() ->> 'email') end;
$$;

create or replace function central_atendimento.exige_login() returns text
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := meu_email();
begin
  if em is null then
    raise exception 'Entre com a sua conta Microsoft da Araguaia (@araguaia.com.br).' using errcode = '28000';
  end if;
  return em;
end $$;

create or replace function central_atendimento.nome_de_email(p_email text) returns text
language sql immutable set search_path = central_atendimento as $$
  select initcap(replace(split_part(p_email, '@', 1), '.', ' '));
$$;

create or replace function central_atendimento.meu_solicitante() returns central_atendimento.solicitantes
language sql stable security definer set search_path = central_atendimento as $$
  select s.* from central_atendimento.solicitantes s where s.email = meu_email() and s.ativo;
$$;

create or replace function central_atendimento.meu_atendente() returns central_atendimento.atendentes
language sql stable security definer set search_path = central_atendimento as $$
  select a.* from central_atendimento.atendentes a where a.email = meu_email() and a.ativo;
$$;

create or replace function central_atendimento.eh_admin() returns boolean
language sql stable security definer set search_path = central_atendimento as $$
  select coalesce((select papel = 'admin' from central_atendimento.atendentes where email = meu_email() and ativo), false);
$$;

-- Atendente pode trabalhar o chamado: está na fila, é o responsável, é supervisor da área ou admin.
create or replace function central_atendimento.atende_chamado(p_chamado uuid) returns boolean
language sql stable security definer set search_path = central_atendimento as $$
  select exists (
    select 1
    from central_atendimento.chamados c
    join central_atendimento.atendentes a on a.email = meu_email() and a.ativo
    where c.id = p_chamado
      and ( a.papel = 'admin'
         or c.atendente_id = a.id
         or (a.papel = 'supervisor' and a.area_id = c.area_id)
         or exists (select 1 from central_atendimento.fila_atendentes fa
                    where fa.fila_id = c.fila_id and fa.atendente_id = a.id and fa.ativo)));
$$;

create or replace function central_atendimento.dono_chamado(p_chamado uuid) returns boolean
language sql stable security definer set search_path = central_atendimento as $$
  select exists (select 1 from central_atendimento.chamados c
                 join central_atendimento.solicitantes s on s.id = c.solicitante_id
                 where c.id = p_chamado and s.email = meu_email());
$$;

create or replace function central_atendimento.pode_ver_chamado(p_chamado uuid) returns boolean
language sql stable security definer set search_path = central_atendimento as $$
  select central_atendimento.dono_chamado(p_chamado) or central_atendimento.atende_chamado(p_chamado);
$$;

-- Expediente da fila (horário de Brasília)
create or replace function central_atendimento.em_expediente(p_fila smallint, p_quando timestamptz default now()) returns boolean
language sql stable security definer set search_path = central_atendimento as $$
  with t as (select (p_quando at time zone 'America/Sao_Paulo') as l)
  select not exists (select 1 from central_atendimento.feriados f, t
                     where f.data = t.l::date and (f.fila_id is null or f.fila_id = p_fila))
     and exists (select 1 from central_atendimento.horarios h, t
                 where h.fila_id = p_fila
                   and h.dia_semana = extract(dow from t.l)::int
                   and t.l::time >= h.inicio and t.l::time < h.fim);
$$;

create or replace function central_atendimento.novo_protocolo() returns text
language sql volatile security definer set search_path = central_atendimento as $$
  select to_char(now() at time zone 'America/Sao_Paulo', 'YYMM') || '-' ||
         lpad(nextval('central_atendimento.protocolo_seq')::text, 5, '0');
$$;

create or replace function central_atendimento.evento(p_chamado uuid, p_tipo text, p_motivo text default null,
  p_de_fila smallint default null, p_para_fila smallint default null,
  p_de_atendente uuid default null, p_para_atendente uuid default null) returns void
language sql volatile security definer set search_path = central_atendimento as $$
  insert into central_atendimento.chamado_eventos(chamado_id, tipo, motivo, de_fila_id, para_fila_id,
                                                  de_atendente_id, para_atendente_id, por_email)
  values (p_chamado, p_tipo, p_motivo, p_de_fila, p_para_fila, p_de_atendente, p_para_atendente, central_atendimento.meu_email());
$$;

create or replace function central_atendimento.msg_sistema(p_chamado uuid, p_texto text, p_autor central_atendimento.autor_mensagem default 'sistema') returns void
language sql volatile security definer set search_path = central_atendimento as $$
  insert into central_atendimento.mensagens(chamado_id, autor, conteudo, tipo) values (p_chamado, p_autor, p_texto, 'texto');
$$;

-- ---------------------------------------------------------------------
-- Motor do fluxo: valida a definição e as respostas (fonte única de regra).
-- ---------------------------------------------------------------------
create or replace function central_atendimento.validar_definicao(p_def jsonb) returns void
language plpgsql immutable set search_path = central_atendimento as $$
declare n jsonb; ids text[] := '{}'; chaves text[] := '{}'; a jsonb;
begin
  if jsonb_typeof(p_def -> 'nos') is distinct from 'array' or jsonb_array_length(p_def -> 'nos') = 0 then
    raise exception 'O fluxo precisa ter ao menos um passo.' using errcode = '23514';
  end if;
  for n in select * from jsonb_array_elements(p_def -> 'nos') loop
    if coalesce(n->>'id','') = '' then raise exception 'Todo passo do fluxo precisa de id.' using errcode='23514'; end if;
    if n->>'id' = any(ids) then raise exception 'Passo repetido no fluxo: %', n->>'id' using errcode='23514'; end if;
    ids := ids || (n->>'id');
    if coalesce(n->>'tipo','') not in ('pergunta','mensagem','fim') then
      raise exception 'Tipo de passo inválido em %: %', n->>'id', n->>'tipo' using errcode='23514';
    end if;
    if n->>'tipo' = 'pergunta' then
      if coalesce(n->>'chave','') !~ '^[a-z][a-z0-9_]{0,40}$' then
        raise exception 'Pergunta % precisa de uma chave em minúsculas (ex.: numero_ov).', n->>'id' using errcode='23514';
      end if;
      if n->>'chave' = any(chaves) then raise exception 'Chave repetida no fluxo: %', n->>'chave' using errcode='23514'; end if;
      chaves := chaves || (n->>'chave');
      if coalesce(n->>'rotulo','') = '' then raise exception 'Pergunta % sem texto.', n->>'id' using errcode='23514'; end if;
      if coalesce(n->>'campo','') not in ('texto','numero','data','opcoes','multipla','sim_nao','documento','arquivo') then
        raise exception 'Campo inválido na pergunta %: %', n->>'id', n->>'campo' using errcode='23514';
      end if;
      if n->>'campo' in ('opcoes','multipla') and coalesce(jsonb_array_length(n->'opcoes'),0) = 0 then
        raise exception 'Pergunta % precisa de opções.', n->>'id' using errcode='23514';
      end if;
      if n ? 'regex' then perform '' ~ (n->>'regex'); end if;  -- regex inválida falha aqui
      if n ? 'validador' and n->>'validador' not in ('cpf','placa') then
        raise exception 'Validador desconhecido na pergunta %: %', n->>'id', n->>'validador' using errcode='23514';
      end if;
    end if;
  end loop;
  if coalesce(p_def->>'inicio', '') <> '' and not (p_def->>'inicio' = any(ids)) then
    raise exception 'O passo inicial % não existe.', p_def->>'inicio' using errcode='23514';
  end if;
  for a in select * from jsonb_array_elements(coalesce(p_def->'arestas','[]'::jsonb)) loop
    if not (a->>'de' = any(ids)) or not (a->>'para' = any(ids)) then
      raise exception 'Ligação inválida no fluxo: % → %', a->>'de', a->>'para' using errcode='23514';
    end if;
  end loop;
end $$;

create or replace function central_atendimento.cpf_valido(p text) returns boolean
language plpgsql immutable set search_path = central_atendimento as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; i int; dv1 int; dv2 int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  dv1 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  dv2 := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return dv1 = substr(d, 10, 1)::int and dv2 = substr(d, 11, 1)::int;
end $$;

create or replace function central_atendimento.cond_ok(p_se jsonb, p_resp jsonb) returns boolean
language plpgsql immutable set search_path = central_atendimento as $$
declare v jsonb;
begin
  if p_se is null or p_se = 'null'::jsonb then return true; end if;
  v := p_resp -> (p_se->>'chave');
  if p_se ? 'igual' then return v = p_se->'igual'; end if;
  if p_se ? 'diferente' then return v is distinct from p_se->'diferente'; end if;
  if p_se ? 'em' then return exists (select 1 from jsonb_array_elements(p_se->'em') e where e = v); end if;
  if p_se ? 'preenchido' then return (v is not null and v <> '""'::jsonb and v <> 'null'::jsonb) = (p_se->>'preenchido')::boolean; end if;
  return true;
end $$;

-- Percorre o fluxo a partir do início, valida cada pergunta visitada e devolve
-- {"respostas": {...só as visitadas, normalizadas...}, "resumo": "Rótulo: valor\n..."}.
create or replace function central_atendimento.validar_respostas(p_def jsonb, p_resp jsonb) returns jsonb
language plpgsql immutable set search_path = central_atendimento as $$
declare
  atual text := coalesce(p_def->>'inicio', p_def->'nos'->0->>'id');
  n jsonb; v jsonb; txt text; saida jsonb := '{}'; resumo text := ''; itens jsonb := '[]'; passos int := 0; prox text;
  campo text; nome text; num numeric;
begin
  p_resp := coalesce(p_resp, '{}');
  loop
    passos := passos + 1;
    exit when atual is null or passos > 200;
    select e into n from jsonb_array_elements(p_def->'nos') e where e->>'id' = atual;
    exit when n is null or n->>'tipo' = 'fim';
    if n->>'tipo' = 'pergunta' then
      campo := n->>'campo'; nome := n->>'rotulo';
      v := p_resp -> (n->>'chave');
      if v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb then
        if coalesce((n->>'obrigatorio')::boolean, false) then
          raise exception 'Responda: %', nome using errcode = '23514';
        end if;
      else
        txt := case jsonb_typeof(v) when 'string' then v #>> '{}' else v::text end;
        if campo = 'numero' then
          begin num := replace(txt, ',', '.')::numeric;
          exception when others then raise exception '% precisa ser um número.', nome using errcode='23514'; end;
          if n ? 'min' and num < (n->>'min')::numeric then raise exception '% precisa ser no mínimo %.', nome, n->>'min' using errcode='23514'; end if;
          if n ? 'max' and num > (n->>'max')::numeric then raise exception '% precisa ser no máximo %.', nome, n->>'max' using errcode='23514'; end if;
          v := to_jsonb(num);
        elsif campo = 'data' then
          begin perform txt::date;
          exception when others then raise exception '% precisa ser uma data válida.', nome using errcode='23514'; end;
          if coalesce((n->>'min_hoje')::boolean, false) and txt::date < (now() at time zone 'America/Sao_Paulo')::date then
            raise exception '% não pode ser uma data passada.', nome using errcode='23514';
          end if;
          v := to_jsonb(txt::date::text); txt := to_char(txt::date, 'DD/MM/YYYY');
        elsif campo = 'opcoes' then
          if not exists (select 1 from jsonb_array_elements_text(n->'opcoes') o where o = txt) then
            raise exception 'Escolha uma opção válida em: %', nome using errcode='23514';
          end if;
        elsif campo = 'multipla' then
          if jsonb_typeof(v) <> 'array' or exists (select 1 from jsonb_array_elements_text(v) x
              where x not in (select jsonb_array_elements_text(n->'opcoes'))) then
            raise exception 'Escolha opções válidas em: %', nome using errcode='23514';
          end if;
          txt := (select string_agg(x, ', ') from jsonb_array_elements_text(v) x);
        elsif campo = 'sim_nao' then
          if lower(txt) in ('true','sim','s') then v := 'true'; txt := 'Sim';
          elsif lower(txt) in ('false','nao','não','n') then v := 'false'; txt := 'Não';
          else raise exception 'Responda Sim ou Não em: %', nome using errcode='23514'; end if;
        else
          v := to_jsonb(btrim(txt)); txt := btrim(txt);
          if char_length(txt) > coalesce((n->>'max_caracteres')::int, 2000) then
            raise exception '% passou do limite de caracteres.', nome using errcode='23514';
          end if;
        end if;
        if n ? 'regex' and campo in ('texto','documento','numero') and txt !~ (n->>'regex') then
          raise exception '%', coalesce(n->>'msg_erro', 'Formato inválido em: ' || nome) using errcode='23514';
        end if;
        if n->>'validador' = 'cpf' and not cpf_valido(txt) then
          raise exception '%', coalesce(n->>'msg_erro', 'CPF inválido em: ' || nome) using errcode='23514';
        elsif n->>'validador' = 'placa' and upper(regexp_replace(txt, '[^A-Za-z0-9]', '', 'g')) !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
          raise exception '%', coalesce(n->>'msg_erro', 'Placa inválida em: ' || nome) using errcode='23514';
        end if;
        if n->>'validador' = 'placa' then txt := upper(regexp_replace(txt, '[^A-Za-z0-9]', '', 'g')); v := to_jsonb(txt); end if;
        if n->>'validador' = 'cpf' then txt := regexp_replace(txt, '\D', '', 'g'); v := to_jsonb(txt); end if;
        saida := saida || jsonb_build_object(n->>'chave', v);
        itens := itens || jsonb_build_array(jsonb_build_object('chave', n->>'chave', 'rotulo', coalesce(n->>'rotulo_resumo', nome), 'valor', txt));
        resumo := resumo || coalesce(n->>'rotulo_resumo', nome) || ': ' || txt || E'\n';
      end if;
    end if;
    -- próximo passo: primeira ligação cuja condição é atendida
    prox := null;
    select a->>'para' into prox
    from jsonb_array_elements(coalesce(p_def->'arestas','[]'::jsonb)) with ordinality as x(a, ord)
    where a->>'de' = atual and central_atendimento.cond_ok(a->'se', saida)
    order by (a->'se' is null), ord limit 1;
    -- sem ligações: segue a ordem da lista de passos
    if prox is null and not exists (select 1 from jsonb_array_elements(coalesce(p_def->'arestas','[]'::jsonb)) a where a->>'de' = atual) then
      select e2->>'id' into prox
      from jsonb_array_elements(p_def->'nos') with ordinality x1(e1, o1)
      join jsonb_array_elements(p_def->'nos') with ordinality x2(e2, o2) on o2 = o1 + 1
      where e1->>'id' = atual;
    end if;
    atual := prox;
  end loop;
  return jsonb_build_object('respostas', saida, 'resumo', rtrim(resumo, E'\n'), 'itens', itens);
end $$;

-- ---------------------------------------------------------------------
-- Distribuição automática: entrega os chamados da fila ao atendente online
-- com menor carga (respeitando capacidade e prioridade na fila).
-- ---------------------------------------------------------------------
create or replace function central_atendimento.distribuir(p_fila smallint) returns integer
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare cid uuid; at uuid; n int := 0;
begin
  if not exists (select 1 from filas where id = p_fila and ativa and distribuicao = 'automatica') then return 0; end if;
  loop
    cid := null; at := null;
    select ch.id into cid from chamados ch
    where ch.fila_id = p_fila and ch.status = 'na_fila' and ch.atendente_id is null
    order by ch.prioridade desc, ch.entrou_fila_em, ch.protocolo
    for update skip locked limit 1;
    exit when cid is null;
    select a.id into at
    from fila_atendentes fa join atendentes a on a.id = fa.atendente_id
    where fa.fila_id = p_fila and fa.ativo and a.ativo and a.presenca = 'online'
      and (select count(*) from chamados x where x.atendente_id = a.id and x.status in ('em_atendimento','aguardando_solicitante')) < a.capacidade
    order by fa.prioridade,
             (select count(*) from chamados x where x.atendente_id = a.id and x.status in ('em_atendimento','aguardando_solicitante')),
             (select max(x.assumido_em) from chamados x where x.atendente_id = a.id) nulls first
    limit 1;
    exit when at is null;
    update chamados set atendente_id = at, status = 'em_atendimento', assumido_em = coalesce(assumido_em, now())
    where id = cid;
    perform evento(cid, 'atribuido', null, null, null, null, at);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Objeto do chamado devolvido ao front, com o que a pessoa pode fazer.
create or replace function central_atendimento.chamado_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = central_atendimento as $$
  select jsonb_build_object(
    'id', c.id, 'protocolo', c.protocolo, 'status', c.status,
    'area', jsonb_build_object('id', ar.id, 'codigo', ar.codigo, 'nome', ar.nome),
    'assunto', jsonb_build_object('id', s.id, 'codigo', s.codigo, 'nome', s.nome, 'documento_tipo', s.documento_tipo,
                                  'documento_obrigatorio', s.documento_obrigatorio_no_encerramento),
    'fila', jsonb_build_object('id', f.id, 'nome', f.nome),
    'solicitante', jsonb_build_object('id', so.id, 'nome', so.nome, 'matricula', so.matricula,
                                      'equipe', (select e.codigo || coalesce(' · ' || e.descricao, '') from equipes_venda e where e.id = c.equipe_venda_id)),
    'atendente', (select jsonb_build_object('id', a.id, 'nome', a.nome) from atendentes a where a.id = c.atendente_id),
    'respostas', c.respostas, 'resumo', c.resumo, 'resumo_itens', c.resumo_itens,
    'posicao_fila', case when c.status = 'na_fila' then 1 + (select count(*) from chamados o
        where o.fila_id = c.fila_id and o.status = 'na_fila' and o.id <> c.id
          and (o.prioridade > c.prioridade or (o.prioridade = c.prioridade and (o.entrou_fila_em, o.protocolo) < (c.entrou_fila_em, c.protocolo)))) end,
    'espera_estimada_min', case when c.status = 'na_fila' then (select ceil(avg(r.espera_seg) / 60.0)::int from (
        select o.espera_seg from chamados o where o.fila_id = c.fila_id and o.espera_seg is not null
          and o.assumido_em > now() - interval '7 days' and not o.fora_horario
        order by o.assumido_em desc limit 20) r) end, 'prioridade', c.prioridade, 'fora_horario', c.fora_horario,
    'criado_em', c.criado_em, 'entrou_fila_em', c.entrou_fila_em, 'assumido_em', c.assumido_em,
    'primeira_resposta_em', c.primeira_resposta_em, 'encerrado_em', c.encerrado_em,
    'espera_seg', c.espera_seg, 'atendimento_seg', c.atendimento_seg,
    'resultado', c.resultado, 'resultado_obs', c.resultado_obs,
    'documento_tipo', c.documento_tipo, 'documento_numero', c.documento_numero,
    'qtd_transferencias', c.qtd_transferencias, 'ultima_msg_em', c.ultima_msg_em, 'ultima_msg_autor', c.ultima_msg_autor,
    'avaliacao', (select jsonb_build_object('nota', av.nota, 'comentario', av.comentario) from avaliacoes av where av.chamado_id = c.id),
    'sou_dono', dono_chamado(c.id),
    'sou_atendente', atende_chamado(c.id))
  from chamados c
  join areas ar on ar.id = c.area_id
  join assuntos s on s.id = c.assunto_id
  join filas f on f.id = c.fila_id
  join solicitantes so on so.id = c.solicitante_id
  where c.id = p_id;
$$;

revoke all on all functions in schema central_atendimento from anon, authenticated, public;
