# API · funções `public.ca_*`

Chamadas via `POST /rest/v1/rpc/<nome>` com o token do login Microsoft. Todas exigem login
(`28000` = não logado). Erros de regra vêm em português no `message`, com o código:
`42501` sem permissão, `23514` valor inválido, `23505` duplicado, `23503` não encontrado.

## Consultor (app)

| Função | Argumentos | Devolve |
|---|---|---|
| `ca_sessao` | — | `{email, nome, solicitante, atendente, admin, precisa_identificar}` |
| `ca_identificar` | `p_matricula text` | sessão |
| `ca_menu` | — | `[área {id, codigo, nome, icone, cor, assuntos:[{id, nome, em_expediente, msg_fora_horario}]}]` |
| `ca_iniciar` | `p_assunto smallint` | `{chamado, fluxo:{id, versao, definicao}}` (status `bot`) |
| `ca_fluxo_simular` | `p_definicao jsonb, p_respostas jsonb` | `{respostas, resumo}` — valida no servidor sem gravar |
| `ca_enviar_respostas` | `p_chamado uuid, p_respostas jsonb` | chamado (`na_fila` ou já `em_atendimento`) |
| `ca_meus_chamados` | `p_limite int = 50, p_antes timestamptz` | `[chamado + nao_lidas]` |
| `ca_chamado` | `p_chamado uuid` | chamado + `mensagens` (+ `eventos`, `historico_solicitante` para atendente) |
| `ca_enviar_mensagem` | `p_chamado, p_conteudo, p_tipo='texto', p_anexo jsonb {path,nome,mime}, p_interna=false` | `{id, autor, criada_em}` |
| `ca_marcar_lidas` | `p_chamado` | nº de mensagens marcadas |
| `ca_desistir` | `p_chamado, p_motivo` | chamado |
| `ca_avaliar` | `p_chamado, p_nota smallint (1 a 10), p_comentario` | chamado |

## Atendente (console)

| Função | Argumentos | Observação |
|---|---|---|
| `ca_presenca` | `p_presenca` online/pausa/offline | ficar online já distribui a fila |
| `ca_painel_atendente` | — | `{eu, filas:[contagem, mais antigo, online], meus:[...], fila:[...]}` |
| `ca_assumir` | `p_chamado` | puxa da fila |
| `ca_proximo` | — | assume o próximo (prioridade, depois o mais antigo) |
| `ca_aguardar_solicitante` | `p_chamado, p_mensagem` | envia a pergunta e muda o status |
| `ca_transferir` | `p_chamado, p_fila, p_atendente, p_motivo` | mesma fila + atendente = repasse; outra fila = transferência |
| `ca_devolver_fila` | `p_chamado, p_motivo` | |
| `ca_encerrar` | `p_chamado, p_resultado, p_documento_tipo, p_documento_numero, p_obs` | resultado: resolvido, resolvido_parcial, nao_resolvido, encaminhado_outra_area, sem_retorno_solicitante, duplicado, fora_do_escopo |
| `ca_prioridade` | `p_chamado, p_prioridade 0–9, p_motivo` | só supervisor/admin |
| `ca_respostas_rapidas` | — | atalhos |
| `ca_console_contexto` | — | áreas, filas, assuntos, atendentes (filas e carga) e respostas rápidas, leitura para qualquer atendente |
| `ca_console_lista` | `p_visao` 'equipe' (supervisor/admin) ou 'encerrados_hoje' | |

## Administração e indicadores

| Função | Argumentos | Observação |
|---|---|---|
| `ca_admin_listar` | `p_entidade` | areas, equipes_venda, solicitantes, atendentes, filas, fila_atendentes, horarios, feriados, assuntos, respostas_rapidas, config |
| `ca_admin_salvar` | `p_entidade, p_dados jsonb` | com a chave primária = altera só os campos enviados; sem = inclui |
| `ca_admin_remover` | `p_entidade, p_chave jsonb` | só fila_atendentes, horarios, feriados, respostas_rapidas (o resto: `ativo=false`) |
| `ca_admin_fluxos` | `p_assunto` | versões |
| `ca_admin_fluxo_salvar` | `p_assunto, p_definicao` | valida e grava como rascunho |
| `ca_admin_fluxo_publicar` | `p_fluxo int` | arquiva a publicada anterior |
| `ca_admin_chamados` | `p_de date, p_ate date, p_area, p_limite ≤1000, p_offset` | base para exportar, com ids e `resolvido_1o_contato` por linha; sem chamados em `bot` (supervisor vê a própria área) |
| `ca_indicadores` | `p_de, p_ate, p_area` | resumo, por área, assunto, atendente, hora e resultado |

## Campos extras do chamado

- `resumo_itens`: `[{chave, rotulo, valor}]` das respostas, para desenhar o cartão sem ler texto.
- `posicao_fila` (1 = próximo) e `espera_estimada_min` (média das últimas 20 esperas da fila em 7 dias, sem as de fora do horário): só quando `na_fila`.

## Tempo real

Assinar `postgres_changes` no schema `central_atendimento`:

- `mensagens` (INSERT/UPDATE) com filtro `chamado_id=eq.<id>` → conversa aberta.
- `chamados` (INSERT/UPDATE) → lista do consultor e fila do atendente.

O Realtime respeita RLS: cada um só recebe o que pode ver; notas internas só chegam a atendentes.
Ao receber o evento, recarregar pelo `ca_chamado`/`ca_painel_atendente` (o evento traz a linha crua).

## "Digitando…"

Realtime **broadcast** (sem tabela) no canal `ca-chamado-<id>`, evento `digitando`, payload `{autor: "solicitante"|"atendente"}`.
Mandar no máximo 1 a cada 3 s e não pôr texto da mensagem no payload.

## Anexos

Arquivos vão para o Storage, bucket privado `central-atendimento`, no caminho `<id do chamado>/<nome>`
(até 20 MB; fotos, PDF, Word, Excel, CSV e texto). Quem vê o chamado pode ler; quem vê e o chamado está aberto pode enviar.
Depois do upload, `ca_enviar_mensagem(p_chamado, p_conteudo, 'texto', p_anexo => {path, nome, mime})` grava a mensagem
(o tipo vira `imagem` ou `arquivo`). Para abrir, o front pede um link assinado de 1 hora (`/storage/v1/object/sign/...`).
Perguntas de fluxo com `campo: "arquivo"`: o app sobe o arquivo durante o fluxo e, ao enviar o pedido, manda cada arquivo como mensagem.
