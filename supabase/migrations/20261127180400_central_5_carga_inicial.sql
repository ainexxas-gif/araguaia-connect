-- =====================================================================
-- Central de Atendimento Interno · 5/6 · Carga inicial (dados de referência)
-- Data: 27/11/2026 · Pedido: Fabrizzio
-- Fonte: doc "Central_Atendimento_Interno_Valor_e_Evolucao" (áreas, assuntos, campos coletados)
--        e public.sales_team_mappings (equipes de venda vigentes, copiadas por SQL).
-- [A VALIDAR] filas, horários, perguntas e regex são uma primeira versão: o BLiP tem 21 filas
-- cujos nomes não estão no documento. Ajustar pelo painel antes de entrar em produção.
-- Idempotente: pode rodar de novo sem duplicar.
-- =====================================================================
set local search_path = central_atendimento, public;

-- Áreas
insert into areas(codigo, nome, descricao, icone, cor, ordem) values
  ('PI',  'Planejamento Integrado', 'RC, OV e troca de centro',                                   'calendario', '#003D7C', 1),
  ('OC',  'Operações Comerciais',   'Motoristas, modificação de pedidos, data de remessa e entregas', 'caminhao',   '#5DB200', 2),
  ('SAC', 'Serviço ao Cliente',     'Documentos, pagamentos, produto e preço',                    'balao',      '#1A5A9E', 3)
on conflict (codigo) do update set nome = excluded.nome, descricao = excluded.descricao;

-- Equipes de venda vigentes (cópia de public.sales_team_mappings)
insert into equipes_venda(codigo, descricao, uf, canal, regiao, ativa)
select distinct on (m.equipe_vendas) m.equipe_vendas, m.descr_equipe, m.uf, m.canal_vendas, m.regiao_equipe, true
from public.sales_team_mappings m
where m.vigente and coalesce(m.equipe_vendas, '') <> ''
order by m.equipe_vendas, m.id desc
on conflict (codigo) do update set descricao = excluded.descricao, uf = excluded.uf, canal = excluded.canal, regiao = excluded.regiao;

-- Filas: uma por assunto [A VALIDAR com as 21 filas do BLiP]
insert into filas(area_id, codigo, nome, sla_espera_min, sla_atendimento_min)
select a.id, v.codigo, v.nome, v.sla_e, v.sla_a
from (values
  ('PI',  'PI_RC',            'PI · Requisição de compra (RC)', 10, 20),
  ('PI',  'PI_OV',            'PI · Ordem de venda (OV)',       10, 20),
  ('PI',  'PI_TROCA_CENTRO',  'PI · Troca de centro',           10, 30),
  ('OC',  'OC_MOTORISTA',     'OC · Cadastro de motoristas',    15, 30),
  ('OC',  'OC_MODIFICACAO',   'OC · Modificação de pedidos',    15, 30),
  ('OC',  'OC_DATA_REMESSA',  'OC · Data de remessa',           15, 30),
  ('OC',  'OC_ENTREGAS',      'OC · Entregas',                  15, 30),
  ('SAC', 'SAC_DOC_PAGTO',    'SAC · Documentos e pagamentos',  20, 30),
  ('SAC', 'SAC_PRODUTO_PRECO','SAC · Produto e preço',          20, 30)
) v(area, codigo, nome, sla_e, sla_a)
join areas a on a.codigo = v.area
on conflict (codigo) do nothing;

-- Horários [A VALIDAR]: seg a sex 07:30–18:00; sábado 08:00–12:00 (doc: ~50 chamados por sábado)
insert into horarios(fila_id, dia_semana, inicio, fim)
select f.id, d, '07:30', '18:00' from filas f cross join generate_series(1, 5) d
on conflict do nothing;
insert into horarios(fila_id, dia_semana, inicio, fim)
select f.id, 6, '08:00', '12:00' from filas f
on conflict do nothing;

-- Assuntos (menu do app)
insert into assuntos(area_id, fila_id, codigo, nome, descricao, icone, ordem, documento_tipo, documento_obrigatorio_no_encerramento)
select a.id, f.id, v.codigo, v.nome, v.descr, v.icone, v.ordem, v.doc, v.obrig
from (values
  ('PI',  'PI_RC',             'RC',             'Requisição de compra (RC)', 'Criar ou ajustar RC',                      'documento',  1, 'RC',     true),
  ('PI',  'PI_OV',             'OV',             'Ordem de venda (OV)',       'Criar ou ajustar OV',                      'documento',  2, 'OV',     true),
  ('PI',  'PI_TROCA_CENTRO',   'TROCA_CENTRO',   'Troca de centro',           'Mudar o centro de origem do pedido',       'setas',      3, 'OV',     false),
  ('OC',  'OC_MOTORISTA',      'CAD_MOTORISTA',  'Cadastro de motoristas',    'Cadastrar motorista e veículo',            'caminhao',   1, null,     false),
  ('OC',  'OC_MODIFICACAO',    'MODIF_PEDIDO',   'Modificação de pedidos',    'Alterar quantidade, produto ou condição',  'lapis',      2, 'PEDIDO', true),
  ('OC',  'OC_DATA_REMESSA',   'DATA_REMESSA',   'Alteração de data de remessa', 'Antecipar ou adiar a remessa',          'calendario', 3, 'PEDIDO', true),
  ('OC',  'OC_ENTREGAS',       'ENTREGAS',       'Entregas',                  'Status, ocorrência ou agendamento',        'pin',        4, 'PEDIDO', false),
  ('SAC', 'SAC_DOC_PAGTO',     'DOC_PAGAMENTO',  'Documentos e pagamentos',   'Boleto, NF, comprovante, 2ª via',          'recibo',     1, 'NF',     false),
  ('SAC', 'SAC_PRODUTO_PRECO', 'PRODUTO_PRECO',  'Produto e preço',           'Dúvida de produto, tabela ou preço',       'etiqueta',   2, null,     false)
) v(area, fila, codigo, nome, descr, icone, ordem, doc, obrig)
join areas a on a.codigo = v.area join filas f on f.codigo = v.fila
on conflict (codigo) do nothing;

-- Fluxos v1 publicados [A VALIDAR com cada área: perguntas, obrigatoriedade e formatos]
with defs(codigo, def) as (values
('RC', $j${"inicio":"acao","nos":[
  {"id":"acao","tipo":"pergunta","chave":"acao","rotulo":"O que você precisa na RC?","campo":"opcoes","obrigatorio":true,"opcoes":["Criar RC","Alterar RC","Cancelar RC","Status da RC"]},
  {"id":"num","tipo":"pergunta","chave":"numero_rc","rotulo":"Nº da RC","campo":"documento","obrigatorio":true,"regex":"^[0-9]{6,12}$","msg_erro":"O nº da RC tem só números (6 a 12 dígitos)."},
  {"id":"mat","tipo":"pergunta","chave":"material","rotulo":"Código do material","campo":"texto","obrigatorio":true,"regex":"^[0-9]{1,18}$","msg_erro":"Informe o código SAP do material (só números)."},
  {"id":"centro","tipo":"pergunta","chave":"centro","rotulo":"Centro","campo":"texto","obrigatorio":true,"regex":"^[A-Za-z0-9]{4}$","msg_erro":"O centro tem 4 caracteres (ex.: 1001)."},
  {"id":"centro_dest","tipo":"pergunta","chave":"centro_destino","rotulo":"Centro de destino","campo":"texto","obrigatorio":false,"regex":"^[A-Za-z0-9]{4}$","msg_erro":"O centro tem 4 caracteres.","ajuda":"Preencha quando a RC for de transferência."},
  {"id":"qtd","tipo":"pergunta","chave":"quantidade","rotulo":"Quantidade","campo":"numero","obrigatorio":true,"min":0},
  {"id":"obs","tipo":"pergunta","chave":"observacao","rotulo":"Algo mais que o atendente precise saber?","campo":"texto","obrigatorio":false,"max_caracteres":1000},
  {"id":"fim","tipo":"fim"}],
 "arestas":[
  {"de":"acao","para":"mat","se":{"chave":"acao","igual":"Criar RC"}},
  {"de":"acao","para":"num"},
  {"de":"num","para":"obs","se":{"chave":"acao","em":["Cancelar RC","Status da RC"]}},
  {"de":"num","para":"mat"},
  {"de":"mat","para":"centro"},{"de":"centro","para":"centro_dest"},{"de":"centro_dest","para":"qtd"},
  {"de":"qtd","para":"obs"},{"de":"obs","para":"fim"}]}$j$),
('OV', $j${"inicio":"acao","nos":[
  {"id":"acao","tipo":"pergunta","chave":"acao","rotulo":"O que você precisa na OV?","campo":"opcoes","obrigatorio":true,"opcoes":["Criar OV","Alterar OV","Liberar OV","Status da OV"]},
  {"id":"num","tipo":"pergunta","chave":"numero_ov","rotulo":"Nº da OV","campo":"documento","obrigatorio":true,"regex":"^[0-9]{6,12}$","msg_erro":"O nº da OV tem só números (6 a 12 dígitos)."},
  {"id":"cli","tipo":"pergunta","chave":"cliente","rotulo":"Código ou nome do cliente","campo":"texto","obrigatorio":true},
  {"id":"mat","tipo":"pergunta","chave":"material","rotulo":"Código do material","campo":"texto","obrigatorio":true,"regex":"^[0-9]{1,18}$","msg_erro":"Informe o código SAP do material (só números)."},
  {"id":"centro","tipo":"pergunta","chave":"centro","rotulo":"Centro","campo":"texto","obrigatorio":true,"regex":"^[A-Za-z0-9]{4}$","msg_erro":"O centro tem 4 caracteres (ex.: 1001)."},
  {"id":"qtd","tipo":"pergunta","chave":"quantidade","rotulo":"Quantidade","campo":"numero","obrigatorio":true,"min":0},
  {"id":"obs","tipo":"pergunta","chave":"observacao","rotulo":"Algo mais que o atendente precise saber?","campo":"texto","obrigatorio":false,"max_caracteres":1000},
  {"id":"fim","tipo":"fim"}],
 "arestas":[
  {"de":"acao","para":"cli","se":{"chave":"acao","igual":"Criar OV"}},
  {"de":"acao","para":"num"},
  {"de":"num","para":"obs","se":{"chave":"acao","em":["Liberar OV","Status da OV"]}},
  {"de":"num","para":"mat"},
  {"de":"cli","para":"mat"},{"de":"mat","para":"centro"},{"de":"centro","para":"qtd"},{"de":"qtd","para":"obs"},{"de":"obs","para":"fim"}]}$j$),
('TROCA_CENTRO', $j${"nos":[
  {"id":"num","tipo":"pergunta","chave":"numero_ov","rotulo":"Nº da OV","campo":"documento","obrigatorio":true,"regex":"^[0-9]{6,12}$","msg_erro":"O nº da OV tem só números."},
  {"id":"de","tipo":"pergunta","chave":"centro_atual","rotulo":"Centro atual","campo":"texto","obrigatorio":true,"regex":"^[A-Za-z0-9]{4}$","msg_erro":"O centro tem 4 caracteres."},
  {"id":"para","tipo":"pergunta","chave":"centro_destino","rotulo":"Novo centro","campo":"texto","obrigatorio":true,"regex":"^[A-Za-z0-9]{4}$","msg_erro":"O centro tem 4 caracteres."},
  {"id":"motivo","tipo":"pergunta","chave":"motivo","rotulo":"Motivo da troca","campo":"opcoes","obrigatorio":true,"opcoes":["Falta de estoque","Frete","Pedido do cliente","Outro"]},
  {"id":"motivo_outro","tipo":"pergunta","chave":"motivo_outro","rotulo":"Qual o motivo?","campo":"texto","obrigatorio":true},
  {"id":"fim","tipo":"fim"}],
 "arestas":[{"de":"num","para":"de"},{"de":"de","para":"para"},{"de":"para","para":"motivo"},
  {"de":"motivo","para":"motivo_outro","se":{"chave":"motivo","igual":"Outro"}},{"de":"motivo","para":"fim"},{"de":"motivo_outro","para":"fim"}]}$j$),
('CAD_MOTORISTA', $j${"nos":[
  {"id":"aviso","tipo":"mensagem","texto":"Tenha em mãos a CNH do motorista e as placas. Com tudo certo aqui, o cadastro sai sem idas e vindas."},
  {"id":"pedido","tipo":"pergunta","chave":"numero_pedido","rotulo":"Nº do pedido / OV","campo":"documento","obrigatorio":true,"regex":"^[0-9]{6,12}$","msg_erro":"O nº do pedido tem só números."},
  {"id":"nome","tipo":"pergunta","chave":"motorista_nome","rotulo":"Nome completo do motorista","campo":"texto","obrigatorio":true},
  {"id":"cpf","tipo":"pergunta","chave":"motorista_cpf","rotulo":"CPF do motorista","campo":"texto","obrigatorio":true,"validador":"cpf","msg_erro":"CPF inválido. Confira os 11 números."},
  {"id":"cnh","tipo":"pergunta","chave":"motorista_cnh","rotulo":"Nº da CNH","campo":"texto","obrigatorio":true,"regex":"^[0-9]{9,11}$","msg_erro":"A CNH tem 9 a 11 números."},
  {"id":"fone","tipo":"pergunta","chave":"motorista_telefone","rotulo":"Celular do motorista (com DDD)","campo":"texto","obrigatorio":true,"regex":"^[0-9]{10,11}$","msg_erro":"Digite DDD + número, só números."},
  {"id":"placa","tipo":"pergunta","chave":"placa_cavalo","rotulo":"Placa do cavalo","campo":"texto","obrigatorio":true,"validador":"placa","msg_erro":"Placa no formato ABC1D23 ou ABC1234."},
  {"id":"carreta","tipo":"pergunta","chave":"placa_carreta","rotulo":"Placa da carreta","campo":"texto","obrigatorio":false,"validador":"placa","msg_erro":"Placa no formato ABC1D23 ou ABC1234."},
  {"id":"transp","tipo":"pergunta","chave":"transportadora","rotulo":"Transportadora","campo":"texto","obrigatorio":true},
  {"id":"foto","tipo":"pergunta","chave":"foto_cnh","rotulo":"Foto da CNH","campo":"arquivo","obrigatorio":false},
  {"id":"fim","tipo":"fim"}]}$j$),
('MODIF_PEDIDO', $j${"nos":[
  {"id":"pedido","tipo":"pergunta","chave":"numero_pedido","rotulo":"Nº do pedido / OV","campo":"documento","obrigatorio":true,"regex":"^[0-9]{6,12}$","msg_erro":"O nº do pedido tem só números."},
  {"id":"oque","tipo":"pergunta","chave":"alteracoes","rotulo":"O que precisa mudar?","campo":"multipla","obrigatorio":true,"opcoes":["Quantidade","Produto","Preço / condição","Cliente / local de entrega","Outro"]},
  {"id":"detalhe","tipo":"pergunta","chave":"detalhe","rotulo":"Descreva a mudança (de → para)","campo":"texto","obrigatorio":true,"max_caracteres":1500,"ajuda":"Ex.: quantidade de 30 t para 45 t no item 10."},
  {"id":"motivo","tipo":"pergunta","chave":"motivo","rotulo":"Motivo","campo":"opcoes","obrigatorio":true,"opcoes":["Pedido do cliente","Erro na digitação","Falta de estoque","Negociação comercial","Outro"]},
  {"id":"fim","tipo":"fim"}]}$j$),
('DATA_REMESSA', $j${"nos":[
  {"id":"pedido","tipo":"pergunta","chave":"numero_pedido","rotulo":"Nº do pedido / OV","campo":"documento","obrigatorio":true,"regex":"^[0-9]{6,12}$","msg_erro":"O nº do pedido tem só números."},
  {"id":"data","tipo":"pergunta","chave":"nova_data","rotulo":"Nova data de remessa","campo":"data","obrigatorio":true,"min_hoje":true},
  {"id":"motivo","tipo":"pergunta","chave":"motivo","rotulo":"Motivo","campo":"opcoes","obrigatorio":true,"opcoes":["Pedido do cliente","Falta de estoque","Logística / frete","Clima / safra","Outro"]},
  {"id":"obs","tipo":"pergunta","chave":"observacao","rotulo":"Observação","campo":"texto","obrigatorio":false,"max_caracteres":1000},
  {"id":"fim","tipo":"fim"}]}$j$),
('ENTREGAS', $j${"nos":[
  {"id":"tipo","tipo":"pergunta","chave":"tipo","rotulo":"Sobre a entrega, você precisa de:","campo":"opcoes","obrigatorio":true,"opcoes":["Status da entrega","Ocorrência na entrega","Agendamento"]},
  {"id":"pedido","tipo":"pergunta","chave":"numero_pedido","rotulo":"Nº do pedido / OV","campo":"documento","obrigatorio":true,"regex":"^[0-9]{6,12}$","msg_erro":"O nº do pedido tem só números."},
  {"id":"ocorr","tipo":"pergunta","chave":"ocorrencia","rotulo":"O que aconteceu?","campo":"texto","obrigatorio":true,"max_caracteres":1500},
  {"id":"foto","tipo":"pergunta","chave":"foto","rotulo":"Foto (se tiver)","campo":"arquivo","obrigatorio":false},
  {"id":"fim","tipo":"fim"}],
 "arestas":[{"de":"tipo","para":"pedido"},
  {"de":"pedido","para":"ocorr","se":{"chave":"tipo","igual":"Ocorrência na entrega"}},{"de":"pedido","para":"fim"},
  {"de":"ocorr","para":"foto"},{"de":"foto","para":"fim"}]}$j$),
('DOC_PAGAMENTO', $j${"nos":[
  {"id":"tipo","tipo":"pergunta","chave":"tipo","rotulo":"Do que você precisa?","campo":"opcoes","obrigatorio":true,"opcoes":["2ª via de boleto","Nota fiscal","Comprovante de pagamento","Baixa de pagamento","Outro"]},
  {"id":"cli","tipo":"pergunta","chave":"cliente","rotulo":"Código ou CNPJ/CPF do cliente","campo":"texto","obrigatorio":true},
  {"id":"doc","tipo":"pergunta","chave":"documento","rotulo":"Nº da NF, OV ou título","campo":"documento","obrigatorio":false},
  {"id":"obs","tipo":"pergunta","chave":"observacao","rotulo":"Detalhes","campo":"texto","obrigatorio":true,"max_caracteres":1500},
  {"id":"fim","tipo":"fim"}]}$j$),
('PRODUTO_PRECO', $j${"nos":[
  {"id":"tipo","tipo":"pergunta","chave":"tipo","rotulo":"Sua dúvida é sobre:","campo":"opcoes","obrigatorio":true,"opcoes":["Produto","Preço / tabela","Disponibilidade"]},
  {"id":"prod","tipo":"pergunta","chave":"produto","rotulo":"Produto (código ou nome)","campo":"texto","obrigatorio":true},
  {"id":"duvida","tipo":"pergunta","chave":"duvida","rotulo":"Qual a dúvida?","campo":"texto","obrigatorio":true,"max_caracteres":1500},
  {"id":"fim","tipo":"fim"}]}$j$)
)
insert into fluxos(assunto_id, versao, status, definicao, criado_por, publicado_por, publicado_em)
select s.id, 1, 'publicado', d.def::jsonb, 'carga_inicial', 'carga_inicial', now()
from defs d join assuntos s on s.codigo = d.codigo
where not exists (select 1 from fluxos f where f.assunto_id = s.id);

-- Confere as definições carregadas
do $$ declare f record; begin
  for f in select id, definicao from central_atendimento.fluxos loop perform central_atendimento.validar_definicao(f.definicao); end loop;
end $$;

-- Respostas rápidas de exemplo
insert into respostas_rapidas(area_id, atalho, titulo, texto) values
  (null, '/ola',      'Saudação',          'Olá! Já estou com o seu pedido e te retorno em instantes.'),
  (null, '/aguarde',  'Pedir um momento',  'Estou verificando no sistema, só um momento.'),
  (null, '/feito',    'Concluído',         'Pronto, está feito! Posso ajudar em mais alguma coisa?'),
  (null, '/falta',    'Falta informação',  'Para seguir preciso de mais uma informação:')
on conflict do nothing;

-- Parâmetros
insert into config(chave, valor, descricao) values
  ('bot_abandono_min', '30', 'Minutos sem enviar o fluxo até o chamado em bot contar como desistência'),
  ('resolvido_1o_contato_horas', '72', 'Janela sem novo chamado do mesmo assunto para contar como resolvido no 1º contato'),
  ('storage_bucket', '"central-atendimento"', 'Bucket do Storage para anexos (a criar)')
on conflict (chave) do nothing;

-- Fecha como desistência os chamados parados no fluxo (rodado pelo pg_cron a cada 10 min)
create or replace function central_atendimento.fechar_abandonados() returns integer
language plpgsql volatile security definer set search_path = central_atendimento as $$
declare n int; lim int := coalesce((select (valor #>> '{}')::int from config where chave = 'bot_abandono_min'), 30);
begin
  with x as (
    update chamados set status = 'desistiu', desistencia_em = now(), desistencia_etapa = 'fluxo'
    where status = 'bot' and criado_em < now() - make_interval(mins => lim) returning id)
  insert into chamado_eventos(chamado_id, tipo, motivo) select id, 'desistencia', 'abandonou o fluxo' from x;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function central_atendimento.fechar_abandonados() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and not exists (select 1 from cron.job where jobname = 'central_atendimento_abandonados') then
    perform cron.schedule('central_atendimento_abandonados', '*/10 * * * *', 'select central_atendimento.fechar_abandonados()');
  end if;
end $$;
