# RHG-App 2.1.1 — Correções do RHG-Bot e carregamento de fotos

## Objetivo
Correção pontual sobre a versão 2.1 RHG-Bot, preservando a integração e os recursos existentes.

## Ajustes

### 1. Carregamento de fotos no celular
- A galeria agora tenta buscar cada imagem novamente até três vezes quando há falha transitória na comunicação com o armazenamento.
- Foi adicionado pequeno intervalo progressivo entre as tentativas.
- A imagem é carregada com decodificação assíncrona e sem `lazy loading`, evitando que a galeria em uma seção recolhida/aba inativa fique aguardando indefinidamente a proximidade da viewport.
- Em caso de falha persistente, a interface apresenta uma mensagem mais clara para atualizar a galeria.

### 2. Anexar arquivo no computador
- O seletor de arquivos agora é aberto por um botão com evento explícito `click()` no campo `input[type=file]`, em vez de depender somente do comportamento do `label for`.
- Mantidos os formatos e limites de anexos existentes.

### 3. Layout da conversa
- O campo de resposta deixou de usar posicionamento `sticky`, que podia sobrepor mensagens durante a rolagem.
- A conversa ganhou área de rolagem própria com espaço inferior adicional e comportamento de rolagem contido.
- O campo de digitação permanece abaixo das respostas, sem cobri-las.

## Implantação
1. Mantenha a versão 2.1 atual como cópia de segurança.
2. Publique o conteúdo deste ZIP no serviço de desenvolvimento/Render.
3. Não é necessária alteração no Google Apps Script nem nas variáveis de ambiente.
4. Faça novo deploy e atualize o navegador com recarga forçada. No celular, feche e reabra o app/PWA após a atualização.

## Testes realizados
- `node --check app.js`
- `node --check server.js`
- Conferência dos seletores do botão e input de anexos.
- Conferência das regras CSS para garantir que o composer não permaneça sticky.
- Conferência do fluxo de retry de fotos.

Os testes são estáticos/locais; a confirmação final deve ser feita nos dispositivos reais após o deploy, especialmente em rede móvel.
