# RHG Web App — configuração local

## 1. Instalar dependências

Abra o terminal dentro desta pasta e execute:

`npm install`

## 2. Configurar o `.env`

O arquivo `.env` deve ficar na mesma pasta do `server.js`.

Use:

`RHG_AI_API_KEY=sua_chave_secreta`
`RHG_AI_MODEL=nome_do_modelo`
`RHG_AI_URL=https://api.openai.com/v1/responses`
`PORT=8787`

Nunca coloque a API key no `app.js`, `index.html` ou outro arquivo enviado ao navegador.

## 3. Iniciar

`npm start`

Depois abra:

`http://localhost:8787`

## Observação

O nome do modelo ainda deve ser escolhido/configurado. Não coloque a API key no chat.
