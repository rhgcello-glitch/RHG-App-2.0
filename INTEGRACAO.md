# Integração Web App ↔ RHG-Bot — V1.4

O Web App agora possui uma camada de backend que pode executar a mesma lógica comercial do RHG-Bot por meio de uma API de IA compatível com Responses.

## Fluxo

Navegador → `server.js` → API de IA → resposta estruturada → navegador.

A chave fica somente no servidor.

## Configuração local

1. Instale Node.js 18+.
2. Copie `.env.example` para `.env`.
3. Defina:
   - `RHG_AI_API_KEY`
   - `RHG_AI_MODEL`
   - opcionalmente `RHG_AI_URL`
4. Inicie o servidor com as variáveis de ambiente configuradas.
5. Abra `http://localhost:8787`.

## Endpoints

- `POST /api/rhg/interpret`
- `POST /api/rhg/assistant`

O frontend já envia:
- descrição do serviço;
- cliente;
- serviços atuais;
- materiais atuais;
- desconto;
- situação comercial.

## Observação

Esta camada reproduz as regras e o comportamento do RHG-Bot no backend; ela não chama diretamente o plugin do ChatGPT. Isso é intencional: plugins do ChatGPT e APIs externas são superfícies diferentes. A integração usa uma execução de modelo no servidor, mantendo a lógica do RHG-Bot como instruções versionadas.

Antes de publicar, devemos adicionar autenticação do usuário, banco de dados e armazenamento seguro das variáveis de ambiente.
