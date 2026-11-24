# RHG App 2.1 — RHG-Bot Conversacional e Gestão Assistida da Base

## Base desta entrega
Esta versão parte do pacote RHG-App-2.0.2 enviado para esta atualização. Mantém o fluxo de orçamentos, rascunhos, histórico, fotos compartilhadas, consulta da Base RHG, autocomplete e busca de clientes.

## Novidades

### 1. Conversa contínua com o RHG-Bot
- O Assistente passou de consulta isolada para uma conversa com histórico visível durante a sessão.
- Cada resposta permite usar **Perguntar sobre esta resposta** para aprofundar um ponto específico.
- As respostas podem incluir orientação, mensagem sugerida ao cliente e resumo de documentos.
- O botão **Nova conversa** limpa o contexto visível do chat.

### 2. Envio de arquivos
O Assistente aceita até 4 arquivos por mensagem, respeitando até 8 MB por arquivo e 12 MB no total:
- PDF;
- Excel `.xlsx` e `.xlsm`;
- CSV;
- TXT;
- imagens PNG, JPG/JPEG e WEBP.

CSV e TXT são lidos como texto. XLSX/XLSM são lidos no servidor, sem biblioteca externa adicional. PDFs e imagens são encaminhados como conteúdo de arquivo/imagem ao endpoint compatível com a API Responses. O tamanho final da requisição é limitado no servidor.

**Nota:** se `RHG_AI_URL` apontar para um proxy personalizado, ele precisa aceitar a estrutura de entrada `input_file` e `input_image` compatível com a Responses API para ler PDFs e imagens. CSV, TXT e Excel são extraídos no próprio backend.

### 3. Revisão e aprovação antes da Base ser alterada
- O RHG-Bot pode apresentar propostas de atualização de preço para registros existentes e propostas de novos cadastros.
- Nenhuma proposta é gravada automaticamente.
- O usuário marca as propostas e clica em **Aprovar alterações selecionadas**.
- O servidor verifica a validade da proposta, a aba permitida, o preço, o ID/nome do registro e se o valor atual ainda corresponde ao valor que foi analisado.
- As propostas são assinadas pelo servidor e expiram em 30 minutos; alterações no conteúdo invalidam a assinatura.
- Apenas as abas `MATERIAIS` e `SERVIÇOS` podem receber esses cadastros/atualizações.
- Atualizações de materiais registram ocorrência em `HISTÓRICO DE PREÇOS`.
- Atualizações de serviços registram ocorrência em `HISTÓRICO DE PREÇOS SERVIÇOS`.
- O preço médio de materiais não é sobrescrito por uma cotação individual. São atualizados `Preço Unitário`, `Último Preço`, origem e data da cotação; o histórico guarda o novo valor.
- A cache de materiais/serviços é invalidada após uma aprovação.

### 4. Conhecimento de precificação e orçamentos
O backend do RHG-Bot recebeu regras consolidadas da apostila `Tabela de Preços — O Guia do Eletricista 2026`, incluindo:
- formas de cobrança (ponto/unidade, metro, quadro, diária e empreitada global/unitária/mista);
- composição de custo, contingência, lucro, encargos e despesas;
- levantamento de materiais e fatores preliminares;
- limites de escopo, materiais/infraestrutura inclusos ou excluídos;
- acréscimos para urgência, horário, feriados, altura e deslocamento, sempre como sugestões sujeitas à aprovação;
- prazo, validade, pagamento, garantia, cronograma e aditivos;
- opções comerciais ajustadas aos perfis C/B/A/AA.

Foram incorporadas 22 médias regionais do Sudeste calculadas pela média aritmética dos limites publicados na apostila. Essas médias são referências de mercado secundárias: a Base RHG continua sendo prioritária e o bot deve identificá-las como referenciais, não como preços oficiais da RHG.

O documento original contém divergências em alguns percentuais e parâmetros (por exemplo, adicionais de emergência e distância de conexão ao circuito existente). O RHG-Bot foi orientado a revelar essas divergências e não aplicar percentuais automaticamente.

### 5. Tipo de cliente e perfil comercial
- `Tipo`: Residencial ou Comercial.
- `Perfil`: C, B, A ou AA.
- Perfil começa sem seleção, para não presumir a classificação de um cliente.
- O perfil adapta a apresentação de opções; não é um multiplicador automático do preço.

## Implantação no Render
1. Faça backup do serviço/repositório 2.0.2 antes da substituição.
2. Descompacte este pacote e substitua os arquivos do serviço de desenvolvimento pelo conteúdo completo.
3. Mantenha as variáveis de ambiente existentes:
   - `RHG_SHEETS_URL`
   - `RHG_SHEETS_API_KEY`
   - `RHG_AI_API_KEY`
   - `RHG_AI_MODEL`
   - `RHG_AI_URL`
4. Faça o deploy no Render.
5. Abra o aplicativo e atualize a página. O nome de cache do Service Worker foi alterado para forçar a entrega dos novos arquivos estáticos.

## Apps Script / Google Sheets
**Não é necessária alteração nem nova implantação do Apps Script nesta versão.** A atualização assistida utiliza as ações `getData`, `update` e `append` já presentes na integração atual. As abas de histórico precisam existir na planilha, como na Base RHG 2.0 utilizada pela versão anterior.

Não altere o ID da planilha, a URL do Web App ou a chave de API durante esta implantação.

## Testes realizados nesta entrega
- `node --check app.js` — aprovado.
- `node --check server.js` — aprovado.
- Inspeção estrutural do HTML: IDs duplicados não encontrados.
- Teste local simulado do endpoint de saúde.
- Teste de leitura CSV e extração de XLSX enviados ao Assistente.
- Teste simulado de geração de proposta de atualização.
- Teste simulado de aprovação: atualizou um material e inseriu o respectivo histórico.
- Teste de rejeição de escrita em aba não permitida.

Os testes do endpoint de IA e Google Sheets foram simulados localmente; esta entrega não foi conectada à conta real do Render, à chave de IA ou à planilha em produção. A leitura de PDF/imagem depende da compatibilidade do endpoint de IA configurado.

## Roteiro recomendado após publicar
1. Abra o Assistente e faça uma pergunta simples; envie uma segunda pergunta usando **Perguntar sobre esta resposta**.
2. Anexe um CSV e uma planilha XLSX pequena. Confira se o resumo identifica os itens e preços.
3. Confira as propostas de atualização. Não aprove todas de uma vez; selecione um item de teste.
4. Aprove uma atualização de material em um ambiente de teste e confira `MATERIAIS` e `HISTÓRICO DE PREÇOS`.
5. Repita com um serviço e confira `SERVIÇOS` e `HISTÓRICO DE PREÇOS SERVIÇOS`.
6. Teste um registro novo e verifique se o ID gerado não se repete.
7. Verifique as demais funções da versão 2.0.2: novo orçamento, salvar, editar, PDF, WhatsApp, fotos compartilhadas e busca de clientes.

## Limitações desta entrega
- Não há autenticação de usuários na interface do aplicativo; a assinatura de aprovação protege a integridade das propostas geradas pelo servidor, mas não substitui autenticação/autorização de acesso ao sistema.
- As propostas geradas pela IA precisam ser revisadas por uma pessoa antes da gravação.
- O assistente não substitui projeto, dimensionamento, laudo, ART ou avaliação técnica presencial.
