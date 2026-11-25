# RHG App 2.2.0 — Fundação de segurança (branch security-dev)

## Escopo desta entrega

Esta etapa prepara a validação de Firebase ID Tokens no backend Node.js sem adicionar dependências externas. O servidor valida assinatura RS256 usando os certificados públicos oficiais do Firebase, além de conferir `aud`, `iss`, `sub`, `exp`, `iat` e `auth_time`.

Quando `RHG_AUTH_REQUIRED=true`, todas as rotas `/api/*` exigem `Authorization: Bearer <Firebase ID Token>`. Nesta primeira fase, somente o e-mail administrador configurado em `RHG_ADMIN_EMAIL` é autorizado. A rota `/health` permanece pública para o monitoramento do Render. A rota `/api/auth/session` retorna a identidade autenticada.

**Importante:** esta entrega é a fundação do backend, não o login completo do usuário. A interface web ainda precisa integrar o Firebase Web SDK e enviar o ID token em cada chamada à API. Não habilite `RHG_AUTH_REQUIRED=true` antes de publicar também essa integração de frontend, pois o frontend atual não envia tokens e as chamadas existentes serão recusadas.

## Variáveis do Render (ambiente de desenvolvimento)

| Nome | Valor |
|---|---|
| `FIREBASE_PROJECT_ID` | `rhg-app-901e6` |
| `RHG_ADMIN_EMAIL` | `rhg.cello@gmail.com` |
| `RHG_AUTH_REQUIRED` | `false` durante a preparação; mudar para `true` somente após integrar e testar o frontend autenticado |

Não é necessário criar chave privada de conta de serviço nesta implementação. O backend valida os tokens usando certificados públicos de assinatura do Firebase. Não coloque credenciais privadas no frontend ou no GitHub.

## Limitação deliberada desta fase

As APIs existentes retornam dados administrativos amplos (inclusive catálogo, clientes, orçamentos e fotos). Por isso, quando a autenticação for ativada, todas essas APIs ficam restritas ao administrador. Ainda não existe acesso de cliente. A próxima fase deverá criar endpoints de consulta por `client_id`, com autorização no servidor e proteção dos arquivos antes de liberar o portal.

## Procedimento seguro

1. Aplicar este pacote somente na branch `security-dev`.
2. Criar serviço Render de desenvolvimento ligado à branch `security-dev`.
3. Configurar as três variáveis acima, mantendo `RHG_AUTH_REQUIRED=false` até concluir a integração do frontend.
4. Testar `/health`.
5. Integrar login Google no frontend e envio do Bearer token.
6. Só então ativar `RHG_AUTH_REQUIRED=true` e testar com a conta administradora.
7. Não copiar as variáveis de Sheets/IA da produção para desenvolvimento sem criar primeiro uma integração de teste isolada.

## Verificações realizadas

- Sintaxe de `server.js` verificada com `node --check`.
- Sem novas dependências npm.
- Nenhuma alteração nas integrações de produção ou no Apps Script.
