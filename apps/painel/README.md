# Painel web do Araguaia Connect

Site de quem atende o time comercial: console de atendimento, cadastros, construtor de fluxos do assistente e indicadores.
Fala só com as funções `public.ca_*` do Supabase (ver `docs/api.md`), com o login Microsoft da Araguaia.

## Abas e quem vê

| Aba | Papel mínimo | O que faz |
|---|---|---|
| Atendimento | atendente | fila, assumir, responder, pedir informação, nota interna, repassar, transferir, devolver, encerrar com resultado e nº do documento |
| Indicadores | supervisor | espera × atendimento, resolvido no 1º contato, picos por hora, desistência, avaliações, exportação em CSV |
| Fluxos | admin | perguntas do assistente por assunto, desvios conforme a resposta, simulador, publicar e voltar versão |
| Cadastros | admin | filas e horários, assuntos, atendentes, áreas, respostas rápidas, feriados, consultores, parâmetros |

## Montar

```bash
python3 montar.py            # public/  → produção (o que o Render publica)
python3 montar.py --previa   # previa/  → mesmo site com dados SIMULADOS, sem banco
node --test tests/*.test.js  # motor de indicadores e de fluxos
```

`montar.py` para com erro se achar placeholder sobrando, JS com erro de sintaxe, URL externa fora da lista,
chave secreta, script inline ou atributo `on*=`. Nunca editar `public/` ou `previa/` à mão (não vão para o git).

Variáveis opcionais: `SUPABASE_URL` e `SUPABASE_KEY` (só a chave **publicável** `sb_publishable_…`; a montagem recusa outra).
Sem elas, vale o projeto de produção em `ambientes.json`.

## Prévia local

```bash
python3 montar.py --previa && cd previa && python3 -m http.server 8000
# abrir http://localhost:8000/?perfil=admin   (ou supervisor, atendente) e clicar em Entrar
```

Os cadastros e fluxos da prévia saem da migração de carga inicial; atendentes, consultores e o histórico de 60 dias são fictícios.

## Publicação (Render, Static Site)

- Root directory `apps/painel`, build `python3 montar.py`, publish directory `public`.
- Headers: `Content-Security-Policy` igual ao do `index.html` + `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- No Supabase (Authentication › URL Configuration), incluir a URL do site em **Redirect URLs**; sem isso o login Microsoft volta para o endereço padrão.

## Arquivos

- `site/` fonte: `index.html`, `styles.css`, `app.js` (base), `console.js`, `cadastros.js`, `fluxos.js`, `indicadores.js`, `iniciar.js`
- `site/motor.js` definição única dos indicadores (mesmas regras de `ca_indicadores`)
- `site/fluxo_motor.js` cópia em JS de `validar_definicao` / `validar_respostas`, usada no simulador; o servidor confere antes de publicar
- `site/mock.js` só na prévia
- `src/` ícone (opção C), logo branco da Araguaia, favicon; `src/icones/` as 4 opções de ícone
