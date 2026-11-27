# Formato dos fluxos (`fluxos.definicao`)

Fonte única da regra: o app desenha as perguntas a partir dela e o servidor valida as respostas
com a mesma definição (`validar_respostas`). O construtor do painel grava `layout` livremente.

```json
{
  "inicio": "acao",
  "nos": [
    {"id": "acao", "tipo": "pergunta", "chave": "acao", "rotulo": "O que você precisa na OV?",
     "campo": "opcoes", "obrigatorio": true, "opcoes": ["Criar OV", "Alterar OV"]},
    {"id": "num", "tipo": "pergunta", "chave": "numero_ov", "rotulo": "Nº da OV", "campo": "documento",
     "obrigatorio": true, "regex": "^[0-9]{6,12}$", "msg_erro": "O nº da OV tem só números."},
    {"id": "aviso", "tipo": "mensagem", "texto": "Tenha a CNH em mãos."},
    {"id": "fim", "tipo": "fim"}
  ],
  "arestas": [
    {"de": "acao", "para": "fim", "se": {"chave": "acao", "igual": "Criar OV"}},
    {"de": "acao", "para": "num"},
    {"de": "num", "para": "fim"}
  ],
  "layout": {}
}
```

- **Tipos de passo**: `pergunta`, `mensagem`, `fim`.
- **Campos**: `texto`, `numero` (`min`, `max`), `data` (AAAA-MM-DD), `opcoes`, `multipla` (array), `sim_nao`, `documento` (nº de RC/OV/pedido), `arquivo` (caminho no Storage).
- **Opcionais**: `validador` (`cpf` com dígito verificador, normaliza para 11 dígitos; `placa` Mercosul ou antiga, normaliza em maiúsculas), `min_hoje` (campo data: não aceita data passada), `obrigatorio`, `regex` + `msg_erro`, `ajuda`, `max_caracteres` (padrão 2000), `rotulo_resumo`.
- **Caminho**: a partir de `inicio` (ou do 1º passo), segue a primeira aresta cuja condição `se` é atendida
  (arestas com condição têm preferência; a sem condição é o "senão"). Sem arestas saindo de um passo, segue a ordem da lista.
- **Condições**: `{"chave": k, "igual": v}`, `{"diferente": v}`, `{"em": [..]}`, `{"preenchido": true}`.
- Só as respostas do caminho percorrido são gravadas; o `resumo` vira a primeira mensagem do atendente.
- `chave` em minúsculas (`^[a-z][a-z0-9_]*$`), única no fluxo.
