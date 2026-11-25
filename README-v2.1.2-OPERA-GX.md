# RHG App 2.1.2 — Compatibilidade de anexos no Opera GX

## Alteração
- O seletor de arquivos deixou de ser aberto por `input.click()` disparado via JavaScript.
- O controle passou a usar um `label for="assistantFiles"` associado diretamente ao input de arquivo, mantendo o input visualmente oculto e acessível.
- Isso evita bloqueios de alguns navegadores/ambientes que não reconhecem o acionamento programático do seletor como gesto direto do usuário.
- Mantidas validações de extensão, quantidade e tamanho dos anexos e todo o fluxo de conversa.

## Publicação
1. Faça backup da versão atual.
2. Substitua os arquivos pelo conteúdo deste pacote no serviço de desenvolvimento.
3. Não é necessária alteração no Apps Script nem nas variáveis de ambiente.
4. Após publicar, faça recarga forçada (Ctrl+F5) no Opera GX e teste anexar PDF e imagem.

## Teste recomendado no Opera GX
- Clique em Anexar arquivo e confirme que o seletor nativo abre.
- Se não abrir, teste temporariamente com bloqueio de anúncios/rastreadores e extensões desativados para o domínio do RHG App.
- Se o seletor abrir, mas o upload falhar, registre a mensagem exibida pelo RHG-Bot e o formato/tamanho do arquivo.

## Observação
A mudança remove a chamada programática ao seletor, mas a confirmação final depende do teste no Opera GX do usuário.
