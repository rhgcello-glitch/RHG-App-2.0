# RHG App 2.0.1 — Fluxo seguro de orçamentos

Esta entrega corrige o ciclo de vida dos orçamentos oficiais e separa rascunhos do histórico compartilhado. É uma versão de desenvolvimento; não substitui a RHG App 1.9.

## O que mudou

- Rascunhos não recebem numeração oficial e não são enviados à aba `ORÇAMENTOS`.
- A área **Rascunhos** permite salvar, abrir e excluir rascunhos locais deste dispositivo.
- A abertura do aplicativo não restaura automaticamente o último orçamento editado.
- **Salvar orçamento** é a única ação que cria ou atualiza um registro oficial.
- O número oficial é gerado no Apps Script, consultando a planilha sob bloqueio de concorrência.
- Ao editar um orçamento oficial, o Apps Script localiza o mesmo `ID Interno`, atualiza a mesma linha e preserva o número.
- Cada criação/edição grava uma cópia dos dados anteriores e atuais na aba `HISTÓRICO DE ALTERAÇÕES ORÇAMENTOS`, criada automaticamente na primeira gravação.
- Dados completos de cliente, descrição e condições comerciais passam a ser persistidos em colunas adicionais na aba `ORÇAMENTOS`. As colunas são acrescentadas sem remover nem renomear as existentes.
- Gerar PDF, interpretar com RHG-Bot ou anexar fotos não salva automaticamente um orçamento oficial.
- O botão de salvamento só confirma sucesso depois da resposta positiva do Apps Script.
- A versão do cache PWA foi atualizada para carregar os novos arquivos.

## Compatibilidade com a planilha existente

A entrega mantém os 14 cabeçalhos originais da aba `ORÇAMENTOS` e acrescenta, se ainda não existirem:

- `Telefone do Cliente`
- `Tipo de Cliente`
- `Perfil do Cliente`
- `Endereço do Cliente`
- `Descrição do Serviço`
- `Descrição do Orçamento`
- `Condições Comerciais`
- `Atualizado em`
- `Versão`

A aba `HISTÓRICO DE ALTERAÇÕES ORÇAMENTOS` é criada automaticamente com cabeçalhos próprios. Nenhuma aba histórica de preços é modificada.

**Rascunhos são armazenados localmente no navegador/dispositivo.** Eles não sincronizam entre celular e computador nesta entrega. Orçamentos oficiais continuam compartilhados pela planilha.

## Implantação

1. Faça backup do serviço Render e do projeto Apps Script atualmente em uso.
2. Atualize o código do projeto Apps Script V2 com o arquivo `GOOGLE_APPS_SCRIPT_V2.gs` desta entrega.
3. **Preserve o valor real de `SPREADSHEET_ID` do projeto atualmente implantado.** O ZIP-base contém um texto de exemplo nesse campo; não publique com `COLE_AQUI_O_ID_DA_COPIA_DE_TESTE`.
4. Preserve a propriedade `RHG_API_KEY` já configurada no Apps Script e a variável `RHG_SHEETS_API_KEY` correspondente no Render.
5. Salve e crie uma nova implantação/versão do Web App do Apps Script, mantendo a URL `/exec` já usada pelo Render, se a implantação permitir atualizar a versão.
6. Publique os arquivos do ZIP no serviço Render de desenvolvimento ligado à planilha RHG v2.0. Não altere o serviço da v1.9.
7. Aguarde o deploy e abra o aplicativo. Se estiver instalado como PWA, feche e reabra ou atualize para receber a nova versão do cache.

## Testes obrigatórios antes do uso diário

1. Abra o app e confirme que o histórico oficial continua carregando.
2. Crie um orçamento de teste e clique em **Salvar rascunho**. Confirme que ele aparece em **Rascunhos**, sem número oficial e sem aparecer no histórico de orçamentos.
3. Reabra o rascunho, complete cliente, serviço/material e condições, e clique em **Salvar orçamento**.
4. Confirme que foi atribuído um número e que o orçamento aparece no histórico compartilhado.
5. Abra o mesmo orçamento, altere telefone, endereço, serviço, valor e condições; salve novamente.
6. Confirme que o número não mudou, que a mesma linha foi atualizada e que a aba `HISTÓRICO DE ALTERAÇÕES ORÇAMENTOS` recebeu uma nova linha com versões anterior e nova.
7. Gere PDF antes de salvar um novo rascunho e confirme que isso não cria um orçamento oficial.
8. Confira fotos compartilhadas de um orçamento já salvo.

## Limitações conhecidas desta entrega

- Rascunhos ficam no armazenamento local do navegador e não são compartilhados entre dispositivos.
- Para registros antigos, campos que nunca foram armazenados (telefone, endereço e condições separados) não podem ser reconstruídos retroativamente. Ao editar e salvar, os novos valores passam a ser armazenados.
- A aba de auditoria registra snapshots completos antes/depois; não é ainda uma comparação campo a campo na interface.
- Esta entrega foi validada por verificações estáticas e de sintaxe. O teste real de gravação deve ser feito no ambiente Google Sheets/Apps Script conectado, antes de usar com orçamentos de clientes.

## Arquivos centrais

- `app.js`: separação entre rascunho e salvamento oficial.
- `server.js`: endpoints de consulta/gravação e integração com a ação `saveQuote`.
- `GOOGLE_APPS_SCRIPT_V2.gs`: numeração, atualização da mesma linha e auditoria.
- `index.html`: navegação Rascunhos e botões de ação.
- `service-worker.js`: atualização do cache PWA.
