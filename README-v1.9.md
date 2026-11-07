# RHG-App — v1.9

## Correção do RHG-Bot / JSON

### Problema
A chamada da Responses API utiliza `text.format.type = "json_object"`.
A API exige que a palavra `json` apareça no conteúdo de `input`.

### Correção
O `input` enviado ao RHG-Bot agora começa explicitamente com:

> Responda em JSON. A resposta desta solicitação deve ser JSON válido.

A estrutura de `text.format` foi mantida.

### Escopo
Esta versão altera somente o `server.js` atual enviado para análise, na montagem do `input` do RHG-Bot.

Não foram alterados:
- PDF;
- fotos;
- histórico;
- máscara de telefone;
- PWA;
- interface.

### Publicação
1. Substitua somente o `server.js` no GitHub.
2. Faça o commit.
3. No Render, use **Manual Deploy → Deploy latest commit**.
4. Teste primeiro o botão **Interpretar** no PC.
5. Depois teste no celular/tablet.

### Validação
O `server.js` desta versão foi validado com `node --check`.
