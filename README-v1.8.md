# RHG-App Web — v1.8

## Correção do RHG-Bot / JSON

### Problema corrigido

A versão anterior passou a usar `text.format` com `type: "json_object"`, mas a Responses API exige que a palavra `json` apareça explicitamente nas instruções de entrada.

Isso causava:

> Response input messages must contain the word 'json' in some form to use 'text.format' of type 'json_object'.

### Ajuste

- Mantido o retorno estruturado em JSON.
- Incluída explicitamente a instrução de que a resposta deve estar em JSON.
- Mantida a integração com o histórico compartilhado.
- Nenhuma alteração feita no layout do PDF.
- Nenhuma alteração feita na máscara de telefone.
- Nenhuma alteração feita na lógica de fotos.

### Publicação

1. Substituir os arquivos do projeto pelos desta versão.
2. Fazer commit no GitHub.
3. Render → Manual Deploy → Deploy latest commit.
4. Testar Interpretar no PC e no celular.

### Importante

Esta versão corrige especificamente o erro de validação da Responses API relacionado ao `text.format` JSON.
