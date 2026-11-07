# RHG-App 2.0 — Fase 1 (ambiente de desenvolvimento)

Esta versão é uma cópia de desenvolvimento baseada no RHG-App 1.9. Ela não substitui a versão estável publicada.

## O que está incluído nesta fase

- Busca inteligente de materiais e serviços enquanto o usuário digita nas linhas do orçamento.
- Pesquisa local no navegador, com pequeno debounce, após carregar o catálogo.
- Cache do catálogo no backend por 3 minutos e no navegador por 5 minutos; a pesquisa não consulta o Google Sheets a cada tecla.
- Sugestões exibem categoria, unidade e informação de preço.
- Preços classificados como históricos não são inseridos automaticamente no orçamento. Para materiais, quando `Preço Unitário` está vazio, o sistema pode exibir `Último Preço` ou `Preço Médio` somente como referência histórica.
- Cadastro manual de material/serviço a partir da busca, com confirmação explícita e verificação de duplicidade exata/aproximada.
- Inclusão nas abas `MATERIAIS` e `SERVIÇOS` usando os cabeçalhos reais da planilha enviada.
- API backend com uma única implementação das rotas gerais de consulta/gravação da Base RHG (remoção do bloco duplicado).
- Lista de abas autorizadas ampliada para incluir `ORIGENS E TIPOS` e `CONFLITOS E DUPLICIDADES`.
- Correção da identificação de linha física no Apps Script, inclusive quando há linhas vazias.
- Bloqueio de concorrência nas operações de gravação do Apps Script.
- Proteção por chave de API entre Render e Google Apps Script.

## Ainda não incluído

Esta é a primeira etapa técnica da RHG-App 2.0. Ainda não está implementado:

- Central de Atualização da Base RHG com upload de documentos de fornecedores.
- Leitura de PDF, XLSX, XLS, CSV, DOCX ou PDF digitalizado.
- Tela de comparação/aprovação de cotações.
- Atualização aprovada de preços com gravação automática no `HISTÓRICO DE PREÇOS`.
- Tela de revisão individual de serviços associados após mudança no custo de materiais.

Essas funções serão desenvolvidas nas próximas fases. Nenhum preço de serviço é recalculado automaticamente nesta fase.

## Arquivos importantes

- `server.js`: backend Node/Render, catálogo em cache e rotas RHG.
- `app.js`: interface, autocomplete e cadastro manual.
- `GOOGLE_APPS_SCRIPT_V2.gs`: novo código para o editor Apps Script.
- `.env.example`: nomes das variáveis de ambiente necessárias.
- `README-v2.0.md`: este guia.

## Configuração do Google Apps Script

> Faça isso primeiro em um momento de manutenção. A v1.9 continuará funcionando até que você substitua o Apps Script ou altere as variáveis de produção. Para testar com segurança, recomendamos criar uma implantação de teste do Apps Script e usar um serviço Render separado (staging).

1. Faça uma cópia da planilha RHG — Base de Dados no Google Drive e use essa cópia exclusivamente para testes.
2. Abra a cópia e entre em **Extensões → Apps Script**.
3. Faça uma cópia do projeto/código atual antes de qualquer alteração.
4. Substitua o código do projeto de teste pelo conteúdo de `GOOGLE_APPS_SCRIPT_V2.gs`.
5. No início do arquivo, substitua `COLE_AQUI_O_ID_DA_COPIA_DE_TESTE` pelo ID da planilha duplicada (o trecho entre `/d/` e `/edit` no endereço da planilha). Não use o ID da planilha de produção.
6. No Apps Script, abra **Configurações do projeto → Propriedades do script**.
7. Adicione a propriedade `RHG_API_KEY` com uma chave longa e aleatória. Não use uma senha curta nem compartilhe essa chave no navegador.
8. Clique em **Implantar → Nova implantação → Aplicativo da Web**.
9. Configure a execução como você (proprietário da cópia da planilha) e o acesso conforme a política da sua organização. Copie a URL `/exec` gerada.
10. Não substitua a URL da implantação de produção até concluir os testes de staging.

## Configuração no Render (staging)

Crie um serviço Web separado para esta cópia e configure as variáveis:

- `RHG_SHEETS_URL`: URL `/exec` da implantação de teste do Apps Script.
- `RHG_SHEETS_API_KEY`: exatamente o mesmo valor de `RHG_API_KEY` definido nas propriedades do script.
- `RHG_BOT_ENDPOINT`: mantenha o endpoint utilizado no ambiente de teste, se aplicável.
- As demais variáveis de IA necessárias ao RHG-Bot devem ser copiadas do ambiente atual, sem expor seus valores no repositório.

O `render.yaml` inclui `RHG_SHEETS_API_KEY` como variável não sincronizada. Não grave segredos no GitHub.

## Testes recomendados antes de publicar

1. Acesse `/health` e confirme que o serviço está online.
2. Abra a tela Novo orçamento e digite parte do nome de um material já cadastrado.
3. Confirme que as sugestões aparecem e que a busca continua funcionando após a primeira carga sem uma chamada por tecla ao Sheets.
4. Selecione um material com preço histórico e confirme que o valor não é aplicado automaticamente no orçamento.
5. Selecione um item com preço atual confirmado (quando houver) e confirme o preenchimento do valor unitário.
6. Teste a busca aproximada, por exemplo `cabo pp 2.5` e `cabo pp 2,5`.
7. Teste o cadastro de um novo material e confirme que ele aparece na aba `MATERIAIS` e na busca após atualizar o catálogo.
8. Tente cadastrar novamente o mesmo item e confirme que o sistema alerta sobre possível duplicidade.
9. Repita os testes para serviços.
10. Salve e reabra um orçamento de teste para conferir que o histórico compartilhado da v1.9 continua preservado.
11. Confirme que a chave incorreta ou ausente é recusada pelo Apps Script.

## Observações de segurança e operação

- Não execute os testes de cadastro diretamente na planilha de produção. O Apps Script deste pacote usa um placeholder de ID propositalmente: configure-o com o ID da cópia de teste antes de implantar.
- O código Apps Script mantém as abas autorizadas em uma lista explícita.
- A chave é enviada somente pelo backend Node ao Apps Script; não é incluída no JavaScript do navegador.
- A proteção por chave é uma camada de autenticação entre backend e Apps Script. As permissões de implantação do Web App também devem ser configuradas com cuidado.
- O histórico de preços ainda não é alterado por esta fase de autocomplete/cadastro. Isso será feito na fase de aprovação de cotações, preservando preço anterior, fornecedor, data e origem.

## Voltar à versão estável

A versão RHG-App 1.9 original permanece no ZIP de backup enviado pelo usuário. Não faça deploy desta cópia sobre o serviço de produção. Se o ambiente de staging apresentar problemas, interrompa os testes e mantenha a v1.9 publicada.
