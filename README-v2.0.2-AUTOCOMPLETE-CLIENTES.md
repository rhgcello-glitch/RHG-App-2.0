# RHG App 2.0.2 — Autocomplete e clientes

## Alterações
- Ajuste de camadas e overflow dos menus de autocomplete para que as sugestões de serviços e materiais apareçam sobre os campos seguintes também no desktop.
- Endpoint `/api/rhg/catalog` agora inclui a aba `CLIENTES`, além de `MATERIAIS` e `SERVIÇOS`.
- Campo Nome do cliente com busca inteligente por nome ou telefone.
- Ao selecionar um cliente, preenche nome, telefone, endereço, tipo e perfil, e mantém o ID do cliente no orçamento.
- A busca não altera o cadastro original da aba CLIENTES.

## Implantação
1. Faça backup do serviço RHG App 2.0.1 atual.
2. Substitua os arquivos do projeto pelos deste pacote no repositório/serviço de desenvolvimento.
3. Não altere `RHG_SHEETS_URL`, `RHG_SHEETS_API_KEY`, `RHG_AI_API_KEY` ou o ID da planilha.
4. Faça deploy no Render.
5. Não é necessário alterar nem republicar o Google Apps Script: a alteração do catálogo é feita pelo servidor consultando a aba `CLIENTES` existente.

## Testes recomendados
1. No computador, digite parte do nome de um serviço e confirme que a lista fica acima dos campos seguintes.
2. Repita com materiais.
3. No campo Cliente, busque por parte do nome e depois pelo telefone.
4. Selecione um cliente e confira nome, telefone, endereço, tipo e perfil.
5. Salve um orçamento de teste e confirme que o ID do cliente foi associado.
6. Confira que o cadastro original na aba CLIENTES não foi alterado.

## Observações
- A busca usa os cabeçalhos `ID Cliente`, `Nome/Razão Social`, `Telefone`, `Endereço`, `Tipo`, `Perfil do Cliente` e `Ativo` quando disponíveis. Também reconhece alguns nomes alternativos para os campos principais.
- Se a base não possuir os campos `Tipo` ou `Perfil do Cliente`, esses campos permanecem com os valores escolhidos no formulário.
