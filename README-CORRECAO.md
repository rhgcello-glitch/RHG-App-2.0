# V1.4.2 — correção do servidor

Corrige a entrega de arquivos estáticos pelo servidor local. O `server.js` agora envia `Buffer` diretamente em vez de serializá-lo como JSON.

## Como atualizar

Use esta pasta/ZIP no lugar da V1.4.1.

Seu `.env` deve ser mantido localmente e não deve ser compartilhado.

Depois:

```bash
npm install
npm start
```

Abra `http://localhost:8787`.
