-- =====================================================================
-- Central de Atendimento Interno · 1/6 · Estrutura
-- Data: 27/11/2026 · Pedido: Fabrizzio (Gerência Geral de Logística e Inovação)
-- Porquê: substituir o fluxo do BLiP por uma central própria (app do consultor
-- + console do atendente), com espera e atendimento separados, resultado,
-- nº do documento e avaliação 1 a 5 (doc "Central_Atendimento_Interno_Valor_e_Evolucao").
-- Schema próprio da aplicação: central_atendimento. Nenhum outro schema é alterado.
-- =====================================================================

create schema if not exists central_atendimento;
comment on schema central_atendimento is 'Central de Atendimento Interno dos consultores (substitui o BLiP).';

set local search_path = central_atendimento, public;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type central_atendimento.status_chamado as enum
    ('bot',              -- consultor ainda respondendo o fluxo
     'na_fila',          -- enviado, aguardando atendente
     'em_atendimento',   -- assumido por atendente
     'aguardando_solicitante', -- atendente pediu informação ao consultor
     'encerrado',        -- fechado pelo atendente, com resultado
     'desistiu');        -- consultor abandonou (no fluxo ou na fila)
exception when duplicate_object then null; end $$;

do $$ begin
  create type central_atendimento.resultado_chamado as enum
    ('resolvido', 'resolvido_parcial', 'nao_resolvido', 'encaminhado_outra_area',
     'sem_retorno_solicitante', 'duplicado', 'fora_do_escopo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type central_atendimento.autor_mensagem as enum ('solicitante', 'atendente', 'bot', 'sistema');
exception when duplicate_object then null; end $$;

do $$ begin
  create type central_atendimento.presenca as enum ('online', 'pausa', 'offline');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------
create table if not exists areas (
  id          smallint generated always as identity primary key,
  codigo      text not null unique check (codigo ~ '^[A-Z0-9_]{2,20}$'),
  nome        text not null,
  descricao   text,
  icone       text,                 -- nome de ícone genérico usado pelo app
  cor         text check (cor is null or cor ~ '^#[0-9A-Fa-f]{6}$'),
  ordem       smallint not null default 0,
  ativa       boolean not null default true,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table areas is 'Áreas que atendem o time comercial (Planejamento Integrado, Operações Comerciais, Serviço ao Cliente; depois outros setores).';

create table if not exists equipes_venda (
  id          integer generated always as identity primary key,
  codigo      text not null unique,          -- equipe_vendas do SAP/C4C
  descricao   text,
  uf          text,
  canal       text,
  regiao      text,
  ativa       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table if not exists solicitantes (
  id            uuid primary key default gen_random_uuid(),
  matricula     text not null unique check (matricula ~ '^[0-9A-Za-z]{3,20}$'),
  nome          text not null,
  email         text unique check (email is null or email = lower(email)),
  equipe_venda_id integer references equipes_venda(id),
  funcao        text check (funcao is null or funcao in ('CTC','GERENTE','FATURISTA','OUTRO')),
  telefone      text,
  ativo         boolean not null default true,
  identificado_em timestamptz,          -- primeira vez que entrou no app
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table solicitantes is 'Consultores (CTC, gerentes, faturistas). Identificação única por matrícula + login Microsoft.';

create table if not exists atendentes (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique check (email = lower(email)),
  nome          text not null,
  matricula     text,
  area_id       smallint references areas(id),     -- área principal
  papel         text not null default 'atendente' check (papel in ('atendente','supervisor','admin')),
  presenca      presenca not null default 'offline',
  presenca_desde timestamptz not null default now(),
  capacidade    smallint not null default 5 check (capacidade between 1 and 50), -- chamados simultâneos
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on column atendentes.papel is 'atendente: atende suas filas; supervisor: vê e redistribui a área; admin: configura tudo.';

create table if not exists filas (
  id            smallint generated always as identity primary key,
  area_id       smallint not null references areas(id),
  codigo        text not null unique check (codigo ~ '^[A-Z0-9_]{2,30}$'),
  nome          text not null,
  descricao     text,
  distribuicao  text not null default 'automatica' check (distribuicao in ('automatica','manual')),
  sla_espera_min      integer check (sla_espera_min > 0),       -- meta de espera (definida pelo gestor)
  sla_atendimento_min integer check (sla_atendimento_min > 0),  -- meta de atendimento
  msg_fora_horario text,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists fila_atendentes (
  fila_id       smallint not null references filas(id) on delete cascade,
  atendente_id  uuid not null references atendentes(id) on delete cascade,
  prioridade    smallint not null default 1,   -- 1 = recebe primeiro
  ativo         boolean not null default true,
  primary key (fila_id, atendente_id)
);

create table if not exists horarios (
  id            integer generated always as identity primary key,
  fila_id       smallint not null references filas(id) on delete cascade,
  dia_semana    smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  inicio        time not null,
  fim           time not null check (fim > inicio),
  unique (fila_id, dia_semana, inicio)
);
comment on table horarios is 'Expediente por fila, em horário de Brasília. Fora dele o chamado entra na fila marcado como fora_horario.';

create table if not exists feriados (
  id            integer generated always as identity primary key,
  data          date not null,
  fila_id       smallint references filas(id) on delete cascade,  -- nulo = todas as filas
  descricao     text not null,
  unique (data, fila_id)
);

create table if not exists assuntos (
  id            smallint generated always as identity primary key,
  area_id       smallint not null references areas(id),
  fila_id       smallint not null references filas(id),
  codigo        text not null unique check (codigo ~ '^[A-Z0-9_]{2,30}$'),
  nome          text not null,
  descricao     text,
  icone         text,
  ordem         smallint not null default 0,
  documento_tipo text check (documento_tipo is null or documento_tipo in ('RC','OV','PEDIDO','NF','REMESSA','OUTRO')),
  documento_obrigatorio_no_encerramento boolean not null default false,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on column assuntos.documento_tipo is 'Documento que o assunto costuma gerar ou tratar (RC, OV, pedido...). Pedido no encerramento quando obrigatório.';

-- Fluxo do chatbot por assunto, versionado. A definição (nós e arestas) é a fonte única;
-- o servidor valida as respostas contra a versão publicada.
create table if not exists fluxos (
  id            integer generated always as identity primary key,
  assunto_id    smallint not null references assuntos(id),
  versao        integer not null,
  status        text not null default 'rascunho' check (status in ('rascunho','publicado','arquivado')),
  definicao     jsonb not null,
  criado_por    text,
  criado_em     timestamptz not null default now(),
  publicado_por text,
  publicado_em  timestamptz,
  unique (assunto_id, versao),
  check (jsonb_typeof(definicao -> 'nos') = 'array')
);
create unique index if not exists fluxos_um_publicado on fluxos (assunto_id) where status = 'publicado';
comment on column fluxos.definicao is
'{"inicio":"p1","nos":[{"id":"p1","tipo":"pergunta","chave":"numero_ov","rotulo":"Qual o nº da OV?","campo":"texto|numero|data|opcoes|multipla|sim_nao|documento|arquivo","obrigatorio":true,"opcoes":["A","B"],"regex":"^[0-9]{10}$","msg_erro":"...","min":0,"max":10,"ajuda":"..."},{"id":"m1","tipo":"mensagem","texto":"..."},{"id":"f1","tipo":"fim"}],"arestas":[{"de":"p1","para":"p2","se":{"chave":"tipo","igual":"X"}}],"layout":{}} — ver docs/fluxos.md';

create table if not exists respostas_rapidas (
  id            integer generated always as identity primary key,
  area_id       smallint references areas(id),     -- nulo = todas
  atalho        text not null check (atalho ~ '^/[a-z0-9_-]{2,30}$'),
  titulo        text not null,
  texto         text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  unique (area_id, atalho)
);

create table if not exists config (
  chave         text primary key,
  valor         jsonb not null,
  descricao     text,
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Operação
-- ---------------------------------------------------------------------
create sequence if not exists protocolo_seq;

create table if not exists chamados (
  id            uuid primary key default gen_random_uuid(),
  protocolo     text not null unique,                  -- ex.: 2611-00042 (aamm-sequência)
  solicitante_id uuid not null references solicitantes(id),
  equipe_venda_id integer references equipes_venda(id), -- foto da equipe no momento da abertura
  area_id       smallint not null references areas(id),
  assunto_id    smallint not null references assuntos(id),
  fila_id       smallint not null references filas(id),
  fluxo_id      integer references fluxos(id),
  status        status_chamado not null default 'bot',
  atendente_id  uuid references atendentes(id),
  respostas     jsonb not null default '{}'::jsonb,    -- {chave: valor} do fluxo
  resumo        text,                                  -- texto pronto para o atendente
  resumo_itens  jsonb not null default '[]'::jsonb,    -- [{rotulo, valor}] para desenhar o cartão
  prioridade    smallint not null default 0,
  fora_horario  boolean not null default false,
  -- marcos de tempo (horário do servidor)
  criado_em            timestamptz not null default now(),  -- abriu o fluxo
  entrou_fila_em       timestamptz,                         -- enviou as respostas
  assumido_em          timestamptz,                         -- 1º atendente assumiu
  primeira_resposta_em timestamptz,                         -- 1ª mensagem de atendente
  encerrado_em         timestamptz,
  -- durações (segundos), calculadas pelo banco
  espera_seg      integer generated always as (extract(epoch from (assumido_em - entrou_fila_em))::integer) stored,
  atendimento_seg integer generated always as (extract(epoch from (encerrado_em - assumido_em))::integer) stored,
  total_seg       integer generated always as (extract(epoch from (encerrado_em - entrou_fila_em))::integer) stored,
  -- encerramento
  resultado       resultado_chamado,
  resultado_obs   text,
  documento_tipo  text check (documento_tipo is null or documento_tipo in ('RC','OV','PEDIDO','NF','REMESSA','OUTRO')),
  documento_numero text,
  desistencia_em  timestamptz,
  desistencia_etapa text check (desistencia_etapa is null or desistencia_etapa in ('fluxo','fila','atendimento')),
  desistencia_motivo text,
  chamado_origem_id uuid references chamados(id),       -- reabertura / novo chamado ligado
  qtd_transferencias smallint not null default 0,
  ultima_msg_em   timestamptz,
  ultima_msg_autor autor_mensagem,
  atualizado_em   timestamptz not null default now(),
  check (status <> 'encerrado' or (resultado is not null and encerrado_em is not null))
);
create index if not exists chamados_fila_status on chamados (fila_id, status, entrou_fila_em);
create index if not exists chamados_atendente_status on chamados (atendente_id, status);
create index if not exists chamados_solicitante on chamados (solicitante_id, criado_em desc);
create index if not exists chamados_criado on chamados (criado_em);
create index if not exists chamados_documento on chamados (documento_tipo, documento_numero) where documento_numero is not null;

create table if not exists mensagens (
  id            bigint generated always as identity primary key,
  chamado_id    uuid not null references chamados(id) on delete cascade,
  autor         autor_mensagem not null,
  atendente_id  uuid references atendentes(id),
  conteudo      text check (char_length(conteudo) <= 8000),
  tipo          text not null default 'texto' check (tipo in ('texto','imagem','arquivo','audio','evento')),
  anexo_path    text,          -- caminho no Storage (bucket central-atendimento)
  anexo_nome    text,
  anexo_mime    text,
  interna       boolean not null default false,  -- nota entre atendentes, invisível ao consultor
  metadados     jsonb,
  criada_em     timestamptz not null default now(),
  entregue_em   timestamptz,
  lida_em       timestamptz,
  check (conteudo is not null or anexo_path is not null)
);
create index if not exists mensagens_chamado on mensagens (chamado_id, id);

-- Linha do tempo: abertura, fila, assunção, repasse, transferência, encerramento, avaliação...
create table if not exists chamado_eventos (
  id            bigint generated always as identity primary key,
  chamado_id    uuid not null references chamados(id) on delete cascade,
  tipo          text not null check (tipo in ('aberto','entrou_fila','atribuido','assumido','repasse','transferencia',
                                              'devolvido_fila','aguardando_solicitante','retomado','encerrado',
                                              'reaberto','desistencia','avaliado','prioridade')),
  de_fila_id    smallint references filas(id),
  para_fila_id  smallint references filas(id),
  de_atendente_id uuid references atendentes(id),
  para_atendente_id uuid references atendentes(id),
  motivo        text,
  por_email     text,
  criado_em     timestamptz not null default now()
);
create index if not exists eventos_chamado on chamado_eventos (chamado_id, id);
comment on table chamado_eventos is 'repasse = outro atendente da mesma fila; transferencia = outra fila/área.';

create table if not exists avaliacoes (
  chamado_id    uuid primary key references chamados(id) on delete cascade,
  nota          smallint not null check (nota between 1 and 5),
  comentario    text check (char_length(comentario) <= 1000),
  criada_em     timestamptz not null default now()
);

-- Auditoria dos cadastros (escrita só por gatilho)
create table if not exists auditoria (
  id            bigint generated always as identity primary key,
  tabela        text not null,
  registro      text,
  acao          text not null,
  antes         jsonb,
  depois        jsonb,
  por_email     text,
  em            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Gatilhos genéricos
-- ---------------------------------------------------------------------
create or replace function central_atendimento.tg_atualizado_em() returns trigger
language plpgsql set search_path = central_atendimento as $$
begin new.atualizado_em := now(); return new; end $$;

create or replace function central_atendimento.tg_auditoria() returns trigger
language plpgsql security definer set search_path = central_atendimento as $$
declare v_old jsonb; v_new jsonb;
begin
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  insert into auditoria(tabela, registro, acao, antes, depois, por_email)
  values (tg_table_name, coalesce(v_new->>'id', v_old->>'id', v_new->>'chave', v_old->>'chave'),
          lower(tg_op), v_old, v_new, lower(auth.jwt() ->> 'email'));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['areas','solicitantes','atendentes','filas','assuntos','chamados'] loop
    execute format('create or replace trigger %I before update on central_atendimento.%I for each row execute function central_atendimento.tg_atualizado_em()', 'tg_'||t||'_atualizado', t);
  end loop;
  foreach t in array array['areas','equipes_venda','solicitantes','atendentes','filas','fila_atendentes','horarios','feriados','assuntos','fluxos','respostas_rapidas','config'] loop
    execute format('create or replace trigger %I after insert or update or delete on central_atendimento.%I for each row execute function central_atendimento.tg_auditoria()', 'tg_'||t||'_auditoria', t);
  end loop;
end $$;

-- Mantém ultima_msg_* e primeira_resposta_em no chamado
create or replace function central_atendimento.tg_mensagem_chamado() returns trigger
language plpgsql security definer set search_path = central_atendimento as $$
begin
  if new.interna then return new; end if;
  update chamados c set
    ultima_msg_em = new.criada_em,
    ultima_msg_autor = new.autor,
    primeira_resposta_em = case when new.autor = 'atendente' and c.primeira_resposta_em is null
                                then new.criada_em else c.primeira_resposta_em end
  where c.id = new.chamado_id;
  return new;
end $$;
create or replace trigger tg_mensagens_chamado after insert on mensagens for each row execute function central_atendimento.tg_mensagem_chamado();

-- ---------------------------------------------------------------------
-- Segurança: RLS em tudo, nada liberado por padrão.
-- O front acessa via funções public.ca_* (security definer).
-- Exceção: SELECT em chamados/mensagens para o Realtime, filtrado por política.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'central_atendimento' loop
    execute format('alter table central_atendimento.%I enable row level security', t);
    execute format('revoke all on central_atendimento.%I from anon, authenticated, public', t);
  end loop;
end $$;
revoke all on all sequences in schema central_atendimento from anon, authenticated, public;
revoke all on all functions in schema central_atendimento from anon, authenticated, public;
alter default privileges in schema central_atendimento revoke all on tables from anon, authenticated, public;
alter default privileges in schema central_atendimento revoke all on functions from anon, authenticated, public;
alter default privileges in schema central_atendimento revoke all on sequences from anon, authenticated, public;
