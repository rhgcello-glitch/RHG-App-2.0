# RHG-App Web — v1.7

## Correção do RHG-Bot no PC

### Ajustes

- Força a resposta estruturada JSON no endpoint do RHG-Bot.
- Mantém compatibilidade com a resposta do Responses API.
- Parser mais tolerante a JSON envolvido em markdown ou texto adicional.
- Parser também reconhece arrays JSON quando presentes.
- Seleciona o maior candidato JSON válido quando houver mais de um trecho.
- Atualiza o cache do PWA para `rhg-app-v17`.

### Motivo

A integração funcionava no celular, mas o PC continuava recebendo a mensagem de que a resposta da IA não estava no JSON esperado. Como o problema persistiu em janela anônima, a hipótese de cache simples perdeu força. Esta versão corrige a origem do problema no processamento da resposta do backend, sem alterar a integração do histórico.

### Publicação

1. Substituir os arquivos desta versão no GitHub.
2. Fazer commit.
3. No Render, usar **Manual Deploy → Deploy latest commit**.
4. Testar a função **Interpretar com RHG-Bot** no PC e no celular.
