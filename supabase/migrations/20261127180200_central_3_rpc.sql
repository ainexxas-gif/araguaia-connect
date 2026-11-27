-- =====================================================================
-- Central de Atendimento Interno · 3/6 · Funções públicas (API do app e do painel)
-- Data: 27/11/2026 · Pedido: Fabrizzio
-- Todas em public.ca_*, security definer, search_path fixo, só para authenticated.
-- Contrato documentado em docs/api.md.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sessão e identificação
-- ---------------------------------------------------------------------
create or replace function public.ca_sessao() returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := exige_login(); s solicitantes; a atendentes;
begin
  s := meu_solicitante(); a := meu_atendente();
  return jsonb_build_object(
    'email', em,
    'nome', coalesce(a.nome, s.nome, nome_de_email(em)),
    'solicitante', case when s.id is null then null else jsonb_build_object(
        'id', s.id, 'matricula', s.matricula, 'nome', s.nome, 'funcao', s.funcao,
        'equipe', (select jsonb_build_object('id', e.id, 'codigo', e.codigo, 'descricao', e.descricao) from equipes_venda e where e.id = s.equipe_venda_id)) end,
    'atendente', case when a.id is null then null else jsonb_build_object(
        'id', a.id, 'nome', a.nome, 'papel', a.papel, 'presenca', a.presenca, 'capacidade', a.capacidade, 'area_id', a.area_id,
        'filas', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'codigo', f.codigo, 'nome', f.nome, 'area_id', f.area_id) order by f.nome), '[]')
                  from fila_atendentes fa join filas f on f.id = fa.fila_id where fa.atendente_id = a.id and fa.ativo and f.ativa)) end,
    'admin', coalesce(a.papel = 'admin', false),
    'precisa_identificar', s.id is null and a.id is null);
end $$;

-- Primeira entrada do consultor: informa a matrícula, que é ligada ao e-mail do login.
-- Regras: (1) e-mail já ligado → devolve; (2) matrícula pré-cadastrada sem e-mail → liga;
-- (3) matrícula ligada a outro e-mail → recusa; (4) não cadastrada → busca em public.employees
--     e só aceita se o e-mail do cadastro de funcionários for o mesmo do login.
create or replace function public.ca_identificar(p_matricula text) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); m text := btrim(coalesce(p_matricula, '')); s solicitantes; emp record;
begin
  s := meu_solicitante();
  if s.id is not null then
    if s.matricula <> m and m <> '' then
      raise exception 'Seu login já está ligado à matrícula %. Fale com a administração da Central para trocar.', s.matricula using errcode = '23505';
    end if;
    return public.ca_sessao();
  end if;
  if m !~ '^[0-9A-Za-z]{3,20}$' then
    raise exception 'Informe a sua matrícula (só números).' using errcode = '23514';
  end if;
  select * into s from solicitantes where matricula = m;
  if s.id is not null then
    if s.email is not null and s.email <> em then
      raise exception 'Esta matrícula está ligada a outro login. Fale com a administração da Central.' using errcode = '23505';
    end if;
    if not s.ativo then
      raise exception 'Esta matrícula está inativa na Central. Fale com a administração.' using errcode = '42501';
    end if;
    update solicitantes set email = em, identificado_em = coalesce(identificado_em, now()) where id = s.id;
  else
    select e.employee_id, e.first_name, e.last_name, lower(e.email) as email into emp
    from public.employees e where e.employee_id = m;
    if emp.employee_id is null then
      raise exception 'Matrícula % não encontrada. Confira o número ou fale com a administração da Central.', m using errcode = '23503';
    end if;
    if emp.email is not null and emp.email <> em then
      raise exception 'Esta matrícula pertence a outro e-mail no cadastro de funcionários.' using errcode = '42501';
    end if;
    insert into solicitantes(matricula, nome, email, identificado_em)
    values (m, coalesce(nullif(btrim(concat_ws(' ', emp.first_name, emp.last_name)), ''), nome_de_email(em)), em, now());
  end if;
  return public.ca_sessao();
end $$;

-- ---------------------------------------------------------------------
-- Consultor
-- ---------------------------------------------------------------------
create or replace function public.ca_menu() returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
begin
  perform exige_login();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ar.id, 'codigo', ar.codigo, 'nome', ar.nome, 'descricao', ar.descricao, 'icone', ar.icone, 'cor', ar.cor,
      'assuntos', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'codigo', s.codigo, 'nome', s.nome, 'descricao', s.descricao, 'icone', s.icone,
          'em_expediente', em_expediente(s.fila_id),
          'msg_fora_horario', f.msg_fora_horario) order by s.ordem, s.nome), '[]')
        from assuntos s join filas f on f.id = s.fila_id
        where s.area_id = ar.id and s.ativo and f.ativa
          and exists (select 1 from fluxos fl where fl.assunto_id = s.id and fl.status = 'publicado'))
    ) order by ar.ordem, ar.nome)
    from areas ar where ar.ativa), '[]');
end $$;

-- Abre o chamado em modo "bot" e devolve o fluxo publicado. Reaproveita um chamado em bot
-- do mesmo assunto aberto há menos de 30 min (evita chamados fantasmas ao voltar no app).
create or replace function public.ca_iniciar(p_assunto smallint) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); s solicitantes; ass assuntos; fl fluxos; cid uuid;
begin
  s := meu_solicitante();
  if s.id is null then raise exception 'Informe a sua matrícula antes de abrir um chamado.' using errcode = '42501'; end if;
  select * into ass from assuntos where id = p_assunto and ativo;
  if ass.id is null then raise exception 'Assunto indisponível.' using errcode = '23503'; end if;
  select * into fl from fluxos where assunto_id = ass.id and status = 'publicado';
  if fl.id is null then raise exception 'Este assunto ainda não tem fluxo publicado.' using errcode = '23503'; end if;
  select id into cid from chamados
  where solicitante_id = s.id and assunto_id = ass.id and status = 'bot' and criado_em > now() - interval '30 minutes'
  order by criado_em desc limit 1;
  if cid is null then
    insert into chamados(protocolo, solicitante_id, equipe_venda_id, area_id, assunto_id, fila_id, fluxo_id, status)
    values (novo_protocolo(), s.id, s.equipe_venda_id, ass.area_id, ass.id, ass.fila_id, fl.id, 'bot')
    returning id into cid;
    perform evento(cid, 'aberto');
  else
    update chamados set fluxo_id = fl.id where id = cid;
  end if;
  return jsonb_build_object('chamado', chamado_json(cid), 'fluxo', jsonb_build_object('id', fl.id, 'versao', fl.versao, 'definicao', fl.definicao));
end $$;

-- Envia as respostas do fluxo: valida no servidor, monta o resumo e põe na fila.
create or replace function public.ca_enviar_respostas(p_chamado uuid, p_respostas jsonb) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); c chamados; fl fluxos; r jsonb; fora boolean; f filas;
begin
  select * into c from chamados where id = p_chamado for update;
  if c.id is null or not dono_chamado(c.id) then raise exception 'Chamado não encontrado.' using errcode = '42501'; end if;
  if c.status <> 'bot' then raise exception 'Este chamado já foi enviado.' using errcode = '23514'; end if;
  select * into fl from fluxos where id = c.fluxo_id;
  r := validar_respostas(fl.definicao, p_respostas);
  fora := not em_expediente(c.fila_id);
  select * into f from filas where id = c.fila_id;
  update chamados set respostas = r->'respostas', resumo = r->>'resumo', resumo_itens = coalesce(r->'itens', '[]'), status = 'na_fila',
         entrou_fila_em = now(), fora_horario = fora
  where id = c.id;
  perform evento(c.id, 'entrou_fila', null, null, c.fila_id);
  if coalesce(r->>'resumo', '') <> '' then perform msg_sistema(c.id, r->>'resumo', 'bot'); end if;
  perform msg_sistema(c.id, case when fora
    then coalesce(f.msg_fora_horario, 'Recebemos o seu pedido fora do horário de atendimento. Ele já está na fila e será atendido no próximo expediente.')
    else 'Pedido recebido. Protocolo ' || c.protocolo || '. Você será atendido em instantes.' end);
  perform distribuir(c.fila_id);
  return chamado_json(c.id);
end $$;

create or replace function public.ca_desistir(p_chamado uuid, p_motivo text default null) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); c chamados;
begin
  select * into c from chamados where id = p_chamado for update;
  if c.id is null or not dono_chamado(c.id) then raise exception 'Chamado não encontrado.' using errcode = '42501'; end if;
  if c.status not in ('bot','na_fila','em_atendimento','aguardando_solicitante') then
    raise exception 'Este chamado já foi encerrado.' using errcode = '23514';
  end if;
  update chamados set status = 'desistiu', desistencia_em = now(), desistencia_motivo = nullif(btrim(p_motivo), ''),
         desistencia_etapa = case c.status when 'bot' then 'fluxo' when 'na_fila' then 'fila' else 'atendimento' end
  where id = c.id;
  perform evento(c.id, 'desistencia', p_motivo);
  if c.status <> 'bot' then perform msg_sistema(c.id, 'O consultor cancelou o pedido.'); end if;
  if c.atendente_id is not null then perform distribuir(c.fila_id); end if;
  return chamado_json(c.id);
end $$;

create or replace function public.ca_meus_chamados(p_limite integer default 50, p_antes timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := exige_login(); s solicitantes;
begin
  s := meu_solicitante();
  if s.id is null then return '[]'; end if;
  return coalesce((select jsonb_agg(chamado_json(x.id) || jsonb_build_object(
            'nao_lidas', (select count(*) from mensagens m where m.chamado_id = x.id and not m.interna
                          and m.autor in ('atendente','sistema') and m.lida_em is null))
          order by x.criado_em desc)
    from (select id, criado_em from chamados
          where solicitante_id = s.id and status <> 'bot' and (p_antes is null or criado_em < p_antes)
          order by criado_em desc limit least(greatest(p_limite, 1), 200)) x), '[]');
end $$;

-- Chamado completo (consultor ou atendente). Notas internas só para atendentes.
create or replace function public.ca_chamado(p_chamado uuid) returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := exige_login(); sou_at boolean := atende_chamado(p_chamado); c chamados;
begin
  if not (sou_at or dono_chamado(p_chamado)) then raise exception 'Chamado não encontrado.' using errcode = '42501'; end if;
  select * into c from chamados where id = p_chamado;
  return chamado_json(p_chamado) || jsonb_build_object(
    'mensagens', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'autor', m.autor, 'atendente', (select a.nome from atendentes a where a.id = m.atendente_id),
        'conteudo', m.conteudo, 'tipo', m.tipo, 'anexo_path', m.anexo_path, 'anexo_nome', m.anexo_nome, 'anexo_mime', m.anexo_mime,
        'interna', m.interna, 'criada_em', m.criada_em, 'lida_em', m.lida_em) order by m.id), '[]')
      from mensagens m where m.chamado_id = p_chamado and (sou_at or not m.interna)),
    'eventos', case when sou_at then (select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', e.tipo, 'motivo', e.motivo, 'criado_em', e.criado_em, 'por_email', e.por_email,
        'de_fila', (select nome from filas where id = e.de_fila_id), 'para_fila', (select nome from filas where id = e.para_fila_id),
        'de_atendente', (select nome from atendentes where id = e.de_atendente_id),
        'para_atendente', (select nome from atendentes where id = e.para_atendente_id)) order by e.id), '[]')
      from chamado_eventos e where e.chamado_id = p_chamado) end,
    'historico_solicitante', case when sou_at then (select coalesce(jsonb_agg(jsonb_build_object(
        'id', h.id, 'protocolo', h.protocolo, 'assunto', (select nome from assuntos where id = h.assunto_id),
        'status', h.status, 'resultado', h.resultado, 'criado_em', h.criado_em, 'documento_numero', h.documento_numero) order by h.criado_em desc), '[]')
      from (select * from chamados where solicitante_id = c.solicitante_id and id <> c.id and status <> 'bot'
            order by criado_em desc limit 10) h) end);
end $$;

create or replace function public.ca_enviar_mensagem(p_chamado uuid, p_conteudo text, p_tipo text default 'texto',
  p_anexo jsonb default null, p_interna boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); c chamados; a atendentes; autor autor_mensagem; mid bigint;
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
  if coalesce(btrim(p_conteudo), '') = '' and p_anexo is null then raise exception 'Mensagem vazia.' using errcode = '23514'; end if;
  if autor = 'atendente' and not p_interna then
    -- Responder um chamado da fila já o assume.
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
          coalesce(p_tipo, 'texto'), p_anexo->>'path', p_anexo->>'nome', p_anexo->>'mime', coalesce(p_interna, false))
  returning id into mid;
  return jsonb_build_object('id', mid, 'autor', autor, 'criada_em', now());
end $$;

-- Marca como lidas as mensagens do outro lado.
create or replace function public.ca_marcar_lidas(p_chamado uuid) returns integer
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); n int;
begin
  if dono_chamado(p_chamado) and (select atendente_id from chamados where id = p_chamado) is distinct from (meu_atendente()).id then
    update mensagens set lida_em = now() where chamado_id = p_chamado and lida_em is null and not interna and autor in ('atendente','sistema','bot');
  elsif atende_chamado(p_chamado) then
    update mensagens set lida_em = now() where chamado_id = p_chamado and lida_em is null and autor = 'solicitante';
  else
    raise exception 'Chamado não encontrado.' using errcode = '42501';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.ca_avaliar(p_chamado uuid, p_nota smallint, p_comentario text default null) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); c chamados;
begin
  select * into c from chamados where id = p_chamado;
  if c.id is null or not dono_chamado(c.id) then raise exception 'Chamado não encontrado.' using errcode = '42501'; end if;
  if c.status <> 'encerrado' then raise exception 'A avaliação abre quando o chamado for encerrado.' using errcode = '23514'; end if;
  if p_nota is null or p_nota not between 1 and 5 then raise exception 'Escolha uma nota de 1 a 5.' using errcode = '23514'; end if;
  if exists (select 1 from avaliacoes where chamado_id = c.id) then raise exception 'Este chamado já foi avaliado.' using errcode = '23505'; end if;
  insert into avaliacoes(chamado_id, nota, comentario) values (c.id, p_nota, nullif(btrim(p_comentario), ''));
  perform evento(c.id, 'avaliado', p_nota::text);
  return chamado_json(c.id);
end $$;

-- ---------------------------------------------------------------------
-- Atendente
-- ---------------------------------------------------------------------
create or replace function public.ca_presenca(p_presenca text) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); a atendentes; f smallint;
begin
  a := meu_atendente();
  if a.id is null then raise exception 'Você não está cadastrado como atendente.' using errcode = '42501'; end if;
  if p_presenca not in ('online','pausa','offline') then raise exception 'Status inválido.' using errcode = '23514'; end if;
  update atendentes set presenca = p_presenca::presenca, presenca_desde = now() where id = a.id;
  if p_presenca = 'online' then
    for f in select fila_id from fila_atendentes where atendente_id = a.id and ativo loop perform distribuir(f); end loop;
  end if;
  return public.ca_sessao();
end $$;

-- Tudo que o console precisa na tela principal.
create or replace function public.ca_painel_atendente() returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := exige_login(); a atendentes;
begin
  a := meu_atendente();
  if a.id is null then raise exception 'Você não está cadastrado como atendente.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'eu', jsonb_build_object('id', a.id, 'nome', a.nome, 'papel', a.papel, 'presenca', a.presenca, 'capacidade', a.capacidade),
    'filas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'nome', f.nome, 'area_id', f.area_id, 'em_expediente', em_expediente(f.id),
        'na_fila', (select count(*) from chamados c where c.fila_id = f.id and c.status = 'na_fila'),
        'mais_antigo_em', (select min(c.entrou_fila_em) from chamados c where c.fila_id = f.id and c.status = 'na_fila'),
        'online', (select count(*) from fila_atendentes x join atendentes y on y.id = x.atendente_id
                   where x.fila_id = f.id and x.ativo and y.ativo and y.presenca = 'online')) order by f.nome), '[]')
      from filas f where f.ativa and (a.papel = 'admin' or (a.papel = 'supervisor' and f.area_id = a.area_id)
                                      or exists (select 1 from fila_atendentes fa where fa.fila_id = f.id and fa.atendente_id = a.id and fa.ativo))),
    'meus', (select coalesce(jsonb_agg(chamado_json(c.id) || jsonb_build_object('nao_lidas',
                 (select count(*) from mensagens m where m.chamado_id = c.id and m.autor = 'solicitante' and m.lida_em is null))
               order by c.ultima_msg_em desc nulls last), '[]')
      from chamados c where c.atendente_id = a.id and c.status in ('em_atendimento','aguardando_solicitante')),
    'fila', (select coalesce(jsonb_agg(chamado_json(c.id) order by c.prioridade desc, c.entrou_fila_em), '[]')
      from (select c.* from chamados c
            where c.status = 'na_fila' and atende_chamado(c.id)
            order by c.prioridade desc, c.entrou_fila_em limit 200) c));
end $$;

create or replace function public.ca_assumir(p_chamado uuid) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); a atendentes; c chamados;
begin
  a := meu_atendente();
  select * into c from chamados where id = p_chamado for update;
  if a.id is null or c.id is null or not atende_chamado(c.id) then raise exception 'Chamado não encontrado.' using errcode = '42501'; end if;
  if c.status <> 'na_fila' then raise exception 'Este chamado já foi assumido ou encerrado.' using errcode = '23514'; end if;
  update chamados set atendente_id = a.id, status = 'em_atendimento', assumido_em = coalesce(assumido_em, now()) where id = c.id;
  perform evento(c.id, 'assumido', null, null, null, null, a.id);
  return chamado_json(c.id);
end $$;

-- Pega o próximo da fila (prioridade, depois o mais antigo) entre as filas do atendente.
create or replace function public.ca_proximo() returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); a atendentes; cid uuid;
begin
  a := meu_atendente();
  if a.id is null then raise exception 'Você não está cadastrado como atendente.' using errcode = '42501'; end if;
  select c.id into cid from chamados c
  join fila_atendentes fa on fa.fila_id = c.fila_id and fa.atendente_id = a.id and fa.ativo
  where c.status = 'na_fila' order by c.prioridade desc, c.entrou_fila_em for update of c skip locked limit 1;
  if cid is null then return null; end if;
  return public.ca_assumir(cid);
end $$;

create or replace function public.ca_aguardar_solicitante(p_chamado uuid, p_mensagem text) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); c chamados;
begin
  select * into c from chamados where id = p_chamado for update;
  if c.id is null or not atende_chamado(c.id) or c.atendente_id is distinct from (meu_atendente()).id then
    raise exception 'Assuma o chamado antes.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_mensagem), '') = '' then raise exception 'Escreva o que falta para o consultor.' using errcode = '23514'; end if;
  perform public.ca_enviar_mensagem(c.id, p_mensagem);
  update chamados set status = 'aguardando_solicitante' where id = c.id;
  perform evento(c.id, 'aguardando_solicitante', p_mensagem);
  return chamado_json(c.id);
end $$;

-- Repasse (outro atendente da mesma fila) ou transferência (outra fila/área). Motivo obrigatório.
create or replace function public.ca_transferir(p_chamado uuid, p_fila smallint default null, p_atendente uuid default null, p_motivo text default null) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); c chamados; f filas; para atendentes;
begin
  select * into c from chamados where id = p_chamado for update;
  if c.id is null or not atende_chamado(c.id) then raise exception 'Chamado não encontrado.' using errcode = '42501'; end if;
  if c.status not in ('na_fila','em_atendimento','aguardando_solicitante') then raise exception 'Este chamado não pode ser transferido.' using errcode = '23514'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da transferência.' using errcode = '23514'; end if;
  if p_fila is not null and p_fila <> c.fila_id then
    select * into f from filas where id = p_fila and ativa;
    if f.id is null then raise exception 'Fila de destino inválida.' using errcode = '23503'; end if;
    if p_atendente is not null and not exists (select 1 from fila_atendentes where fila_id = f.id and atendente_id = p_atendente and ativo) then
      raise exception 'O atendente escolhido não atende a fila de destino.' using errcode = '23514';
    end if;
    update chamados set fila_id = f.id, area_id = f.area_id,
           atendente_id = p_atendente,
           status = case when p_atendente is null then 'na_fila'::status_chamado else 'em_atendimento'::status_chamado end,
           qtd_transferencias = qtd_transferencias + 1
    where id = c.id;
    perform evento(c.id, 'transferencia', p_motivo, c.fila_id, f.id, c.atendente_id, p_atendente);
    perform msg_sistema(c.id, 'Seu pedido foi transferido para ' || f.nome || '.');
    if p_atendente is null then perform distribuir(f.id); end if;
  elsif p_atendente is not null then
    select * into para from atendentes where id = p_atendente and ativo;
    if para.id is null or not exists (select 1 from fila_atendentes where fila_id = c.fila_id and atendente_id = para.id and ativo) then
      raise exception 'O atendente escolhido não atende esta fila.' using errcode = '23514';
    end if;
    update chamados set atendente_id = para.id, status = 'em_atendimento', assumido_em = coalesce(assumido_em, now()),
           qtd_transferencias = qtd_transferencias + 1 where id = c.id;
    perform evento(c.id, 'repasse', p_motivo, c.fila_id, c.fila_id, c.atendente_id, para.id);
  else
    raise exception 'Escolha a fila ou o atendente de destino.' using errcode = '23514';
  end if;
  if c.atendente_id is not null then perform distribuir(c.fila_id); end if;
  return chamado_json(c.id);
end $$;

create or replace function public.ca_devolver_fila(p_chamado uuid, p_motivo text) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); c chamados;
begin
  select * into c from chamados where id = p_chamado for update;
  if c.id is null or not atende_chamado(c.id) then raise exception 'Chamado não encontrado.' using errcode = '42501'; end if;
  if c.status not in ('em_atendimento','aguardando_solicitante') then raise exception 'Este chamado não está em atendimento.' using errcode = '23514'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.' using errcode = '23514'; end if;
  update chamados set atendente_id = null, status = 'na_fila' where id = c.id;
  perform evento(c.id, 'devolvido_fila', p_motivo, c.fila_id, c.fila_id, c.atendente_id, null);
  perform distribuir(c.fila_id);
  return chamado_json(c.id);
end $$;

-- Encerramento com resultado e nº do documento (obrigatório quando o assunto exige).
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
  perform msg_sistema(c.id, 'Atendimento encerrado. Como foi? Avalie de 1 a 5.');
  perform distribuir(c.fila_id);
  return chamado_json(c.id);
end $$;

create or replace function public.ca_prioridade(p_chamado uuid, p_prioridade smallint, p_motivo text default null) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_login(); a atendentes;
begin
  a := meu_atendente();
  if a.papel not in ('supervisor','admin') or not atende_chamado(p_chamado) then raise exception 'Só supervisores mudam a prioridade.' using errcode = '42501'; end if;
  update chamados set prioridade = least(greatest(p_prioridade, 0), 9) where id = p_chamado;
  perform evento(p_chamado, 'prioridade', coalesce(p_motivo, p_prioridade::text));
  return chamado_json(p_chamado);
end $$;

create or replace function public.ca_respostas_rapidas() returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := exige_login(); a atendentes;
begin
  a := meu_atendente();
  if a.id is null then raise exception 'Você não está cadastrado como atendente.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'atalho', r.atalho, 'titulo', r.titulo, 'texto', r.texto, 'area_id', r.area_id) order by r.atalho)
    from respostas_rapidas r where r.ativo and (r.area_id is null or r.area_id = a.area_id or a.papel = 'admin')), '[]');
end $$;

-- ---------------------------------------------------------------------
-- Administração (cadastros, fluxos, indicadores)
-- ---------------------------------------------------------------------
create or replace function central_atendimento.exige_admin() returns text
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := exige_login();
begin
  if not eh_admin() then raise exception 'Apenas a administração da Central pode fazer isso.' using errcode = '42501'; end if;
  return em;
end $$;

create or replace function central_atendimento.entidade_ok(p text) returns boolean
language sql immutable set search_path = central_atendimento as $$
  select p in ('areas','equipes_venda','solicitantes','atendentes','filas','fila_atendentes','horarios','feriados','assuntos','respostas_rapidas','config');
$$;

create or replace function public.ca_admin_listar(p_entidade text) returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
declare r jsonb;
begin
  perform exige_admin();
  if not entidade_ok(p_entidade) then raise exception 'Cadastro desconhecido: %', p_entidade using errcode = '23514'; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from central_atendimento.%I t', p_entidade) into r;
  return r;
end $$;

-- Inclui ou altera um registro. Com a chave primária preenchida e existente: altera só os campos enviados.
-- Para "excluir" cadastros principais use ativo/ativa = false.
create or replace function public.ca_admin_salvar(p_entidade text, p_dados jsonb) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare pk text[]; cols text[]; existe boolean := false; cond text; r jsonb; sql text;
begin
  perform exige_admin();
  if not entidade_ok(p_entidade) then raise exception 'Cadastro desconhecido: %', p_entidade using errcode = '23514'; end if;
  select array_agg(a.attname order by a.attnum) into pk
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = ('central_atendimento.' || p_entidade)::regclass and i.indisprimary;
  select array_agg(a.attname order by a.attnum) into cols
  from pg_attribute a
  where a.attrelid = ('central_atendimento.' || p_entidade)::regclass and a.attnum > 0 and not a.attisdropped
    and a.attgenerated = '' and a.attidentity = '' and a.attname not in ('criado_em','atualizado_em')
    and p_dados ? a.attname;
  if cols is null then raise exception 'Nada para gravar.' using errcode = '23514'; end if;
  if (select bool_and(p_dados ? k and p_dados->>k is not null) from unnest(pk) k) then
    cond := (select string_agg(format('%1$I = (select %1$I from jsonb_populate_record(null::central_atendimento.%2$I, $1))', k, p_entidade), ' and ') from unnest(pk) k);
    execute format('select exists (select 1 from central_atendimento.%I where %s)', p_entidade, cond) using p_dados into existe;
  end if;
  if existe then
    cols := array(select c from unnest(cols) c where not c = any(pk));
    if cardinality(cols) = 0 then raise exception 'Nada para alterar.' using errcode = '23514'; end if;
    sql := format('update central_atendimento.%1$I t set (%2$s) = (select %2$s from jsonb_populate_record(null::central_atendimento.%1$I, $1)) where %3$s returning to_jsonb(t)',
                  p_entidade, (select string_agg(format('%I', c), ', ') from unnest(cols) c), cond);
    if cardinality(cols) = 1 then
      sql := format('update central_atendimento.%1$I t set %2$I = (select %2$I from jsonb_populate_record(null::central_atendimento.%1$I, $1)) where %3$s returning to_jsonb(t)',
                    p_entidade, cols[1], cond);
    end if;
  else
    sql := format('insert into central_atendimento.%1$I as t (%2$s) select %2$s from jsonb_populate_record(null::central_atendimento.%1$I, $1) returning to_jsonb(t)',
                  p_entidade, (select string_agg(format('%I', c), ', ') from unnest(cols) c));
  end if;
  execute sql using p_dados into r;
  return r;
end $$;

-- Remoção só para vínculos e itens de agenda (não apaga histórico).
create or replace function public.ca_admin_remover(p_entidade text, p_chave jsonb) returns integer
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare n int;
begin
  perform exige_admin();
  if p_entidade = 'fila_atendentes' then
    delete from fila_atendentes where fila_id = (p_chave->>'fila_id')::smallint and atendente_id = (p_chave->>'atendente_id')::uuid;
  elsif p_entidade = 'horarios' then delete from horarios where id = (p_chave->>'id')::int;
  elsif p_entidade = 'feriados' then delete from feriados where id = (p_chave->>'id')::int;
  elsif p_entidade = 'respostas_rapidas' then delete from respostas_rapidas where id = (p_chave->>'id')::int;
  else raise exception 'Este cadastro não se apaga; marque como inativo.' using errcode = '23514';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.ca_admin_fluxos(p_assunto smallint) returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
begin
  perform exige_admin();
  return coalesce((select jsonb_agg(to_jsonb(f) order by f.versao desc) from fluxos f where f.assunto_id = p_assunto), '[]');
end $$;

-- Salva rascunho: altera o rascunho aberto ou cria uma nova versão.
create or replace function public.ca_admin_fluxo_salvar(p_assunto smallint, p_definicao jsonb) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_admin(); f fluxos;
begin
  perform validar_definicao(p_definicao);
  select * into f from fluxos where assunto_id = p_assunto and status = 'rascunho' order by versao desc limit 1;
  if f.id is null then
    insert into fluxos(assunto_id, versao, status, definicao, criado_por)
    values (p_assunto, coalesce((select max(versao) from fluxos where assunto_id = p_assunto), 0) + 1, 'rascunho', p_definicao, em)
    returning * into f;
  else
    update fluxos set definicao = p_definicao, criado_por = em where id = f.id returning * into f;
  end if;
  return to_jsonb(f);
end $$;

create or replace function public.ca_admin_fluxo_publicar(p_fluxo integer) returns jsonb
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare em text := exige_admin(); f fluxos;
begin
  select * into f from fluxos where id = p_fluxo for update;
  if f.id is null then raise exception 'Fluxo não encontrado.' using errcode = '23503'; end if;
  perform validar_definicao(f.definicao);
  update fluxos set status = 'arquivado' where assunto_id = f.assunto_id and status = 'publicado' and id <> f.id;
  update fluxos set status = 'publicado', publicado_por = em, publicado_em = now() where id = f.id returning * into f;
  return to_jsonb(f);
end $$;

-- Testa respostas contra uma definição (usado pelo construtor de fluxos para simular).
create or replace function public.ca_fluxo_simular(p_definicao jsonb, p_respostas jsonb) returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
begin
  perform exige_login();
  perform validar_definicao(p_definicao);
  return validar_respostas(p_definicao, p_respostas);
end $$;

-- Base de chamados para indicadores e exportação (admin vê tudo; supervisor vê a própria área).
create or replace function public.ca_admin_chamados(p_de date, p_ate date, p_area smallint default null,
  p_limite integer default 1000, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := exige_login(); a atendentes;
begin
  a := meu_atendente();
  if a.papel is null or a.papel not in ('supervisor','admin') then raise exception 'Acesso restrito a supervisores e administração.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'protocolo', c.protocolo, 'status', c.status, 'area', ar.nome, 'assunto', s.nome, 'fila', f.nome,
      'matricula', so.matricula, 'solicitante', so.nome, 'equipe', e.codigo, 'atendente', at.nome,
      'criado_em', c.criado_em, 'entrou_fila_em', c.entrou_fila_em, 'assumido_em', c.assumido_em,
      'primeira_resposta_em', c.primeira_resposta_em, 'encerrado_em', c.encerrado_em,
      'espera_seg', c.espera_seg, 'atendimento_seg', c.atendimento_seg, 'total_seg', c.total_seg,
      'fora_horario', c.fora_horario, 'resultado', c.resultado, 'documento_tipo', c.documento_tipo,
      'documento_numero', c.documento_numero, 'qtd_transferencias', c.qtd_transferencias,
      'desistencia_etapa', c.desistencia_etapa, 'nota', av.nota, 'comentario', av.comentario) order by c.criado_em, c.id)
    from (select * from chamados c
          where (c.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
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

-- Indicadores do período (mesmos do painel atual do BLiP + espera e atendimento separados).
-- "Resolvido no 1º contato": encerrado como resolvido e sem novo chamado do mesmo consultor
-- no mesmo assunto nas 72 horas seguintes (premissa a validar com as áreas).
create or replace function public.ca_indicadores(p_de date, p_ate date, p_area smallint default null) returns jsonb
language plpgsql stable security definer set search_path = central_atendimento as $$
declare em text := exige_login(); a atendentes;
begin
  a := meu_atendente();
  if a.papel is null or a.papel not in ('supervisor','admin') then raise exception 'Acesso restrito a supervisores e administração.' using errcode = '42501'; end if;
  return (
    with base as (
      select c.*, (c.criado_em at time zone 'America/Sao_Paulo') as local_em,
             (c.status = 'encerrado' and c.resultado = 'resolvido' and not exists (
                select 1 from chamados d where d.solicitante_id = c.solicitante_id and d.assunto_id = c.assunto_id
                  and d.id <> c.id and d.status <> 'bot' and d.criado_em > c.criado_em
                  and d.criado_em <= c.encerrado_em + interval '72 hours')) as resolvido_1o
      from chamados c
      where (c.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
        and c.status <> 'bot'
        and (p_area is null or c.area_id = p_area)
        and (a.papel = 'admin' or c.area_id = a.area_id)),
    resumo as (
      select count(*) as chamados,
             count(distinct solicitante_id) as solicitantes,
             count(*) filter (where status = 'encerrado') as encerrados,
             count(*) filter (where status = 'desistiu') as desistencias,
             count(*) filter (where status in ('na_fila')) as na_fila_agora,
             count(*) filter (where fora_horario) as fora_horario,
             percentile_cont(0.5) within group (order by espera_seg) as espera_mediana_seg,
             percentile_cont(0.5) within group (order by atendimento_seg) as atendimento_mediana_seg,
             round(100.0 * count(*) filter (where status = 'encerrado' and total_seg <= 1800) / nullif(count(*) filter (where status = 'encerrado'), 0), 1) as pct_ate_30min,
             round(100.0 * count(*) filter (where resolvido_1o) / nullif(count(*) filter (where status = 'encerrado'), 0), 1) as pct_resolvido_1o_contato,
             round(100.0 * count(*) filter (where qtd_transferencias > 0) / nullif(count(*), 0), 1) as pct_transferidos,
             round(100.0 * count(*) filter (where documento_numero is not null) / nullif(count(*) filter (where status = 'encerrado'), 0), 1) as pct_com_documento,
             (select round(avg(av.nota), 2) from avaliacoes av join base b on b.id = av.chamado_id) as nota_media,
             (select count(*) from avaliacoes av join base b on b.id = av.chamado_id) as avaliacoes
      from base)
    select jsonb_build_object(
      'periodo', jsonb_build_object('de', p_de, 'ate', p_ate),
      'resumo', (select to_jsonb(resumo) from resumo),
      'por_area', (select coalesce(jsonb_agg(x order by x.chamados desc), '[]') from (
          select ar.nome as area, count(*) as chamados, percentile_cont(0.5) within group (order by b.espera_seg) as espera_mediana_seg,
                 percentile_cont(0.5) within group (order by b.atendimento_seg) as atendimento_mediana_seg,
                 round(avg(av.nota), 2) as nota_media
          from base b join areas ar on ar.id = b.area_id left join avaliacoes av on av.chamado_id = b.id group by ar.nome) x),
      'por_assunto', (select coalesce(jsonb_agg(x order by x.chamados desc), '[]') from (
          select s.nome as assunto, ar.nome as area, count(*) as chamados,
                 sum(coalesce(b.total_seg, 0)) as tempo_aberto_seg,
                 percentile_cont(0.5) within group (order by b.espera_seg) as espera_mediana_seg,
                 percentile_cont(0.5) within group (order by b.atendimento_seg) as atendimento_mediana_seg,
                 count(*) filter (where b.status = 'desistiu') as desistencias
          from base b join assuntos s on s.id = b.assunto_id join areas ar on ar.id = b.area_id group by s.nome, ar.nome) x),
      'por_atendente', (select coalesce(jsonb_agg(x order by x.encerrados desc), '[]') from (
          select at.nome as atendente, count(*) filter (where b.status = 'encerrado') as encerrados,
                 percentile_cont(0.5) within group (order by b.atendimento_seg) as atendimento_mediana_seg,
                 round(avg(av.nota), 2) as nota_media
          from base b join atendentes at on at.id = b.atendente_id left join avaliacoes av on av.chamado_id = b.id group by at.nome) x),
      'por_hora', (select coalesce(jsonb_agg(x order by x.dia_semana, x.hora), '[]') from (
          select extract(dow from local_em)::int as dia_semana, extract(hour from local_em)::int as hora, count(*) as chamados
          from base group by 1, 2) x),
      'por_resultado', (select coalesce(jsonb_object_agg(coalesce(resultado::text, 'sem_resultado'), n), '{}') from (
          select resultado, count(*) as n from base where status = 'encerrado' group by resultado) x)
    ));
end $$;

-- ---------------------------------------------------------------------
-- Permissões: só usuários logados executam as funções públicas.
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'ca\_%' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
revoke all on all functions in schema central_atendimento from anon, authenticated, public;
