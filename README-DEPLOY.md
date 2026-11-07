# RHG-App Web — publicação HTTPS

## Render
1. Crie um repositório privado no GitHub e envie estes arquivos.
2. No Render, escolha **New > Web Service** e conecte o repositório.
3. Runtime: **Node**.
4. Build Command: `npm install`.
5. Start Command: `npm start`.
6. Adicione as variáveis de ambiente no painel do Render. **Não envie o `.env`**.
7. Use `/health` como health check.

Variáveis:
- `RHG_SHEETS_URL`
- `RHG_AI_API_KEY`
- `RHG_AI_MODEL`
- `RHG_AI_URL` (opcional; padrão: `https://api.openai.com/v1/responses`)
- `RHG_BOT_ENDPOINT` (opcional, se o fluxo usar um endpoint externo)

O Render fornece HTTPS automaticamente para a URL do serviço.

## Teste
Depois do deploy, abra:
`https://SEU-ENDERECO.onrender.com/health`

Deve retornar JSON semelhante a:
`{"ok":true,"app":"RHGonçalves Web App","status":"online"}`

## Segurança
- Nunca publique `.env`.
- Nunca coloque `RHG_AI_API_KEY` no `app.js`.
- O navegador chama `/api/rhg/...`; a chave fica somente no backend.
