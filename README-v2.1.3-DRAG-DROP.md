# RHG App 2.1.3 — Arrastar e soltar arquivos no RHG-Bot

## Novidade
- É possível arrastar arquivos do computador e soltá-los em qualquer ponto da área de conversa do RHG-Bot.
- A área destaca visualmente o destino enquanto arquivos estão sendo arrastados.
- Os arquivos aparecem como anexos pendentes; nada é enviado até o usuário clicar em **Enviar pergunta**.
- É possível remover anexos antes do envio.
- Mantidos os limites existentes: até 4 arquivos, 8 MB por arquivo e 12 MB no total.
- Mantidos os formatos aceitos: PDF, XLSX, XLSM, CSV, TXT, PNG, JPG, JPEG e WEBP.
- O botão **Anexar arquivo** continua disponível, inclusive no celular. A seleção por `label`/`input` permanece compatível com a correção do Opera GX da versão 2.1.2.

## Implantação
1. Preserve o ZIP da versão 2.1.2 como backup.
2. Substitua os arquivos do serviço pelos arquivos deste pacote e publique no Render.
3. Não é necessário alterar Apps Script nem variáveis de ambiente.
4. Após a publicação, faça recarga forçada no navegador (`Ctrl + F5`).

## Testes recomendados
- Opera GX e Firefox: arrastar um PDF e uma imagem para a conversa.
- Arrastar vários arquivos; verificar limite de quatro e limite total de 12 MB.
- Remover um anexo antes de enviar.
- Confirmar que arrastar arquivo não envia automaticamente a mensagem.
- Confirmar que o botão de anexar continua funcionando no desktop e no celular.

## Observação
Foi feita validação sintática local do JavaScript. O comportamento final de arrastar e soltar deve ser confirmado nos navegadores após o deploy.
