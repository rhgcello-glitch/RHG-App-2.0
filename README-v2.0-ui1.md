# RHG-App 2.0 — Interface UI 1

Esta entrega inicia a reformulação visual da RHG-App 2.0. É uma cópia de desenvolvimento; não substitui a versão estável nem altera as integrações de produção.

## Alterações desta entrega

- Nova identidade escura em preto, grafite e amarelo, com azul-marinho nos elementos de marca e destaque.
- Painel inicial com maior destaque para **Novo orçamento** e **Assistente RHG-Bot**.
- Navegação lateral no computador e navegação em cartões compactos no celular.
- Atalhos para Histórico/Orçamentos, Assistente RHG-Bot e Base RHG.
- Ajuste da cor do tema PWA e atualização do cache do service worker para evitar servir a interface anterior.
- Navegação entre painel, orçamento, histórico, assistente e base mantida pelo mecanismo existente.

## O que NÃO foi alterado

- `server.js`, endpoints e variáveis de ambiente.
- Integração com Google Sheets e Apps Script.
- Assistente RHG-Bot e interpretação dentro da tela Novo Orçamento.
- Autocomplete e cadastro de materiais e serviços.
- Geração de PDF, fotos, histórico e sincronização.
- Lógica atual de gravação de orçamento. A separação entre consulta, rascunho e orçamento oficial será implementada em uma etapa própria, após validação desta camada visual.

## Como testar

1. Publique esta cópia no serviço de desenvolvimento da RHG-App 2.0, sem substituir o serviço da v1.9.
2. Abra o aplicativo no celular e no computador.
3. No celular, confira os cartões de navegação e os quatro atalhos do painel.
4. No computador, confira o menu lateral.
5. Entre em Novo orçamento, Histórico, Assistente RHG-Bot e Base RHG para confirmar que as telas e integrações continuam acessíveis.
6. Faça um teste de interpretação e de busca de material/serviço. Não use dados reais de clientes para o teste visual.
7. Se o PWA mostrar a versão antiga, feche e abra novamente o aplicativo; o nome do cache foi atualizado nesta entrega.

## Próxima etapa

Após a validação visual, avançar para a reorganização da tela de Novo Orçamento em seções recolhíveis, começando por Dados do Cliente, sem alterar os recursos já existentes. A implementação separada de rascunhos e consultas será tratada em etapa funcional própria.
