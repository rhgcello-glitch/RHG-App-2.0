# RHG App 2.0 — UI 3

## Objetivo
Correção de legibilidade dos cartões de serviços/materiais e da sobreposição da lista de autocomplete em telas móveis.

## Alterações
- Em larguras até 900px, descrição ocupa uma linha completa do cartão.
- Quantidade e valor unitário ficam em duas colunas equilibradas.
- Fornecimento, subtotal e botão Remover ocupam linhas próprias.
- Textos e valores não devem invadir campos vizinhos; os valores permanecem em uma linha.
- Seção de orçamento aberta passa a ter prioridade de empilhamento e não recorta o autocomplete.
- Lista de sugestões recebe rolagem própria, alvos de toque maiores e limite de altura adequado ao celular.
- Cache do service worker atualizado para evitar servir CSS antigo.

## Preservação
Esta entrega altera CSS e identificador de cache do PWA. Não altera `server.js`, integração Google Sheets, RHG-Bot, interpretador, cálculos, histórico ou geração de PDF.

## Implantação e teste
1. Faça backup da UI 2.
2. Publique este pacote somente no serviço de desenvolvimento.
3. No celular, feche e reabra o PWA ou atualize a página para carregar o novo cache.
4. Abra Serviços e Materiais e confira descrição, quantidade, preço, subtotal e Remover.
5. Digite parte do nome de um item e confirme que a lista de sugestões aparece sobre a seção seguinte e permite selecionar uma opção.
6. Teste também em largura de computador.

## Observação
A validação visual final depende do teste no dispositivo real e do navegador utilizado.
