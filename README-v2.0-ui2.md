# RHG App 2.0 — UI 2 (legibilidade e seções recolhíveis)

## Objetivo desta entrega
Ajustar a tela de criação de orçamento para uso em celular, após a avaliação da UI 1. A identidade visual escura foi mantida; o foco desta versão é melhorar a leitura dos itens e organizar o formulário em seções recolhíveis.

## Alterações
- As sete áreas do formulário agora são seções recolhíveis (`details/summary`), todas fechadas ao iniciar um novo orçamento.
- A primeira seção é Dados do Cliente.
- Serviços e materiais passaram a ser apresentados em cartões individuais, com rótulos explícitos para descrição, quantidade, valor unitário, fornecimento e subtotal.
- No celular, os campos usam disposição vertical/duas colunas amplas, evitando a grade estreita que dificultava a leitura.
- Os resumos de Serviços e Materiais mostram a quantidade de itens e seus totais.
- Os botões de adicionar serviço/material e fotos ficam em áreas próprias dentro das seções.
- Atualizados os identificadores de cache e os parâmetros de versão dos arquivos para `ui2`.

## Arquivos alterados
- `index.html` — estrutura das seções recolhíveis e cartões de itens.
- `styles.css` — estilos responsivos e legibilidade dos cartões.
- `app.js` — atualização dos resumos de quantidade e total.
- `service-worker.js` — nova versão do cache PWA.

## Funcionalidades preservadas nesta entrega
O backend e as integrações não foram modificados. A lógica existente de RHG-Bot/interpretador, autocomplete, inclusão de serviços e materiais, cálculos, fotos, geração de PDF, WhatsApp e histórico foi mantida.

## Ainda não incluído
- Rascunhos independentes do histórico oficial e consultas sem registro.
- Central de Atualização da Base RHG para importar cotações de fornecedores.
- Tela independente do Interpretador (planejada para a versão 2.1).

A função de salvamento existente não foi alterada nesta entrega. Portanto, não considerar o fluxo de rascunhos aprovado como implementado ainda.

## Implantação e teste
1. Mantenha a versão atual/estável como backup.
2. Publique este pacote no serviço de desenvolvimento da RHG App 2.0.
3. No celular, abra Novo Orçamento e confirme que as sete seções aparecem recolhidas.
4. Expanda Serviços e Materiais; confira se cada item mostra descrição, quantidade, valor unitário e subtotal de forma legível.
5. Teste inclusão, edição, remoção, autocomplete, cálculo dos totais, interpretação, PDF e histórico.
6. Se o aplicativo estiver instalado como PWA, feche e reabra; o cache foi versionado para `rhg-app-v20-ui2`.

## Observação
Esta entrega melhora a interface e não deve ser tratada como validação de produção. A confirmação final depende dos testes no Render e no celular.
