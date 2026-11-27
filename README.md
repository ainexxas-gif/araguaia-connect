# Araguaia Connect · Central de Atendimento Interno

> Nome provisório. Substitui o fluxo do BLiP: o consultor (CTC, gerente, faturista) abre o app no celular,
> escolhe a área e o assunto, responde as perguntas do fluxo e o pedido cai, já classificado, com o
> atendente certo. O atendente responde, repassa, transfere e encerra com resultado e nº do documento;
> o consultor avalia de 1 a 5. Tudo medido, com **espera e atendimento separados**.

## Estrutura

```
apps/consultor/        app do consultor (PWA, celular)
apps/painel/           console do atendente + administração (cadastros, construtor de fluxos, indicadores)
supabase/migrations/   schema central_atendimento (versionado; aplicar em ordem)
supabase/functions/    Edge Functions (quando precisar de chave secreta ou integração)
tests/sql/             bateria de regras no banco (não grava nada)
docs/                  modelo de dados, API (funções ca_*) e formato dos fluxos
```

## Stack

| Camada | Escolha |
|---|---|
| Banco | Supabase, projeto **Araguaia MC**, schema próprio `central_atendimento` |
| Login | SSO Microsoft (OAuth) com e-mail `@araguaia.com.br`, mesmo padrão das outras aplicações |
| Acesso | RLS em todas as tabelas; o front chama só as funções `public.ca_*` (security definer) |
| Tempo real | Supabase Realtime (`postgres_changes`) em `chamados` e `mensagens`, filtrado por RLS |
| Chave no front | só a publicável (`sb_publishable_…`); nunca `service_role` |

## Regras de negócio (resumo)

- **Identificação**: na primeira entrada o consultor informa a matrícula; ela é ligada ao e-mail do login.
  Matrícula nova é aceita se existir em `public.employees` com o mesmo e-mail.
- **Chamado**: nasce em `bot` ao abrir o assunto; vai para `na_fila` quando as respostas passam na validação
  do servidor; a distribuição automática entrega ao atendente online da fila com menor carga (capacidade por atendente).
- **Status**: `bot → na_fila → em_atendimento ⇄ aguardando_solicitante → encerrado`, ou `desistiu` em qualquer etapa.
  Chamado parado no fluxo por 30 min vira desistência (pg_cron a cada 10 min).
- **Tempos** (gravados pelo servidor): `criado_em`, `entrou_fila_em`, `assumido_em`, `primeira_resposta_em`,
  `encerrado_em`; o banco calcula `espera_seg`, `atendimento_seg`, `total_seg`.
- **Repasse** = outro atendente da mesma fila; **transferência** = outra fila/área. Motivo obrigatório; tudo na linha do tempo.
- **Encerramento**: resultado obrigatório; nº do documento (RC/OV/pedido) obrigatório quando o assunto exige.
- **Avaliação**: 1 a 5, uma por chamado, só pelo consultor, só depois de encerrado.
- **Notas internas** entre atendentes nunca chegam ao consultor (nem pelo Realtime).
- **Fora do expediente** o pedido entra na fila marcado `fora_horario` e o consultor recebe aviso.

## Testar

```bash
# Postgres local
psql -f tests/sql/00_stub_supabase.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done
psql -f tests/sql/10_regras.sql   # termina com "RESULTADO: 1 ok; 1b ok; ..." e desfaz tudo
```

## Pontos a validar (primeira versão)

Ver `docs/modelo-dados.md` → "Suposições".
