# Araguaia Connect · app do consultor (PWA)

App de celular do consultor: entra com a conta Microsoft da Araguaia, informa a matrícula uma vez,
escolhe a área e o assunto (ou busca por palavra), responde as perguntas do fluxo com validação na hora,
confere o resumo, envia e acompanha a fila (posição e espera estimada), conversa com o atendente em tempo
real (checks de lida, "digitando…") e avalia de 1 a 5 no encerramento. Pode ser instalado na tela inicial
(Android e iPhone) e abre sem rede (a casca fica em cache; os dados nunca).

## Arquivos

```
src/index.html, styles.css     tela (sem CDN, sem script inline: CSP restrita)
src/app.js                     telas e navegação
src/motor.js                   percorre o fluxo e valida igual a central_atendimento.validar_respostas
src/api-supabase.js            login Microsoft, funções public.ca_* e Realtime (WebSocket) sem biblioteca
src/api-mock.js                banco simulado para a prévia (mesmos campos e status de docs/api.md)
src/icone.svg, src/png/        ícone "Conversa" e PNGs (32, 192, 512, 180 iOS, 512 maskable)
src/icones/                    as 4 opções apresentadas (escolhida: B)
montar.py                      monta public/ e previa/, valida e recusa chave secreta
tests/teste_fluxo.js           teste de tela (Playwright) em 390 e 1280 px
```

## Montar

```bash
python3 montar.py                                     # prévia: dados simulados, nada vai ao banco
SUPABASE_URL=https://cnbicexublaxoctsxjgq.supabase.co \
SUPABASE_KEY=sb_publishable_... python3 montar.py     # produção (o Render faz isso pelo render.yaml)
GERAR_ICONES=1 python3 montar.py                      # depois de trocar o icone.svg (precisa de Playwright)
```

A prévia lê os fluxos de `supabase/migrations/*carga_inicial*.sql`, então as perguntas da prévia são as mesmas do banco.
`previa/araguaia-connect-previa.html` é a prévia em arquivo único, para abrir no celular sem servidor.

## Testar

```bash
(cd public && python3 -m http.server 8765) &
node tests/teste_fluxo.js     # 114 checagens: fluxo completo, validações, layout, fonte mínima, toque, console, rede
```

## Decisões e suposições [a validar]

- Login: SSO Microsoft (provedor azure do Supabase) e matrícula na primeira entrada (`ca_identificar`).
  A URL do site publicado precisa estar em Supabase Auth > URL Configuration > Redirect URLs.
- Tempo real: `postgres_changes` em `mensagens` e `chamados` + broadcast `digitando` no canal `ca-chamado-<id>`.
  Plano B: consulta leve a cada 15 s se o WebSocket cair.
- Campo `arquivo` (foto da CNH, foto da ocorrência): ainda sem upload no app; a pergunta mostra "Pular".
- "Descartar" no resumo chama `ca_desistir` (conta como desistência no fluxo, útil para medir abandono).
- Sem notificação push nesta versão: o consultor vê as novidades ao abrir o app (lista com contador de não lidas).
