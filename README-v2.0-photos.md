# RHG App 2.0 — Fotos compartilhadas (UI Photos 1)

## O que foi alterado
- No celular, o usuário pode escolher entre **Tirar foto** (câmera) e **Escolher da galeria/arquivos**.
- No computador, o seletor de arquivos permite escolher imagens locais.
- As imagens são otimizadas no navegador e enviadas pelo backend ao Google Drive, vinculadas ao ID do orçamento.
- Celular e computador consultam a mesma galeria no servidor; descrições e remoções também são compartilhadas.
- O PDF consulta as imagens remotas vinculadas ao orçamento.

## Configuração obrigatória do Apps Script
1. Abra o projeto Apps Script V2.0 e substitua o conteúdo pelo arquivo atualizado `GOOGLE_APPS_SCRIPT_V2.gs` deste pacote (ou incorpore as novas funções e o desvio `photo_` no `doPost`).
2. Confirme que a propriedade de script `RHG_API_KEY` continua configurada e igual a `RHG_SHEETS_API_KEY` no Render.
3. Salve e crie uma **nova versão da implantação do aplicativo da Web**. Mantenha a execução como sua conta e o acesso compatível com a configuração atual do app.
4. Na primeira operação de fotos, o Google solicitará autorização para criar e gerenciar a pasta `RHG App 2.0 - Fotos dos Orçamentos` no seu Drive. Autorize com a conta proprietária da Base RHG. O ID da pasta será salvo automaticamente em `RHG_PHOTOS_FOLDER_ID`.
5. A URL do Apps Script normalmente permanece a mesma quando você atualiza uma implantação existente para uma nova versão; confirme no Render que `RHG_SHEETS_URL` aponta para a implantação V2.0.

## Implantação no Render
- Publique os arquivos atualizados do projeto no serviço de desenvolvimento V2.0.
- Não é necessária uma nova variável de ambiente: a integração usa `RHG_SHEETS_URL` e `RHG_SHEETS_API_KEY` já existentes.
- O endpoint de upload aceita requisições de até 12 MB; cada imagem é redimensionada no navegador e o Apps Script limita o arquivo otimizado a 8 MB.

## Testes obrigatórios
1. No celular, abrir um orçamento já salvo e testar **Tirar foto**.
2. Testar **Escolher da galeria/arquivos** e selecionar uma imagem existente.
3. No computador, abrir o mesmo orçamento e confirmar que as imagens aparecem.
4. Adicionar uma foto pelo computador e confirmar que aparece no celular após atualizar a galeria.
5. Editar uma descrição e remover uma foto; confirmar que as alterações aparecem nos dois dispositivos.
6. Gerar o PDF e confirmar que as fotos e descrições aparecem.

## Migração de fotos antigas
As fotos gravadas pela versão anterior no IndexedDB ficam apenas no navegador/dispositivo em que foram adicionadas. Ao abrir novamente o orçamento no dispositivo em que as fotos antigas foram adicionadas, o app tentará transferi-las automaticamente para o Drive. Depois da transferência confirmada, remove a cópia local antiga. Essa migração precisa ocorrer em cada dispositivo que tenha fotos locais. Não limpe os dados do navegador antes de abrir os respectivos orçamentos e confirmar a sincronização.

## Segurança e observações
- Os arquivos são armazenados no Google Drive da conta que autoriza o Apps Script; não são salvos no disco efêmero do Render.
- A pasta não precisa ser compartilhada publicamente. O backend acessa o Drive por meio do Apps Script e da chave de API.
- A exclusão de uma foto envia o arquivo para a lixeira do Drive.
- Testar primeiro no ambiente de desenvolvimento; não substituir a versão estável.
