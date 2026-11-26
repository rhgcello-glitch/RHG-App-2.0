# RHG App 2.2.1 — autenticação administrativa Firebase

## O que foi implementado
- Tela de acesso antes de usar o aplicativo.
- Entrada com Google usando Firebase Authentication (SDK modular via CDN).
- Persistência local da sessão no navegador.
- Validação adicional da sessão no endpoint `/api/auth/session` do backend.
- Acesso liberado somente quando o backend retorna `role: admin`.
- Inclusão automática do token Firebase como `Authorization: Bearer ...` em chamadas same-origin `/api/*`.
- Botão para sair da conta.

## Configuração esperada no Render `rhg-app-dev`
- `RHG_AUTH_REQUIRED=true`
- `FIREBASE_PROJECT_ID=rhg-app-901e6`
- `RHG_ADMIN_EMAIL` igual ao e-mail administrativo cadastrado no Firebase.
- Manter as variáveis exclusivas da planilha/API de testes já configuradas.

## Firebase Console
- Authentication > Sign-in method: provedor Google ativado.
- Authentication > Settings > Authorized domains: incluir `rhg-app-dev.onrender.com`.
- O backend também exige `email_verified=true` e compara o e-mail com `RHG_ADMIN_EMAIL`.

## Publicação de teste
1. Faça backup da branch `security-dev`.
2. Substitua os arquivos correspondentes pelos desta entrega, mantendo os demais arquivos e assets do projeto.
3. Commit/push somente na branch `security-dev`.
4. Aguarde o deploy do serviço `rhg-app-dev`.
5. Abra o endereço em janela anônima, entre com a conta Google administrativa e confirme o acesso.
6. Teste sair/entrar novamente e as funções que consultam/salvam orçamentos, fotos, catálogo, Base RHG e RHG-Bot.
7. Não promova para `main`/produção até concluir os testes.

## Limitações desta etapa
- Esta integração implementa somente o perfil administrativo. Não cria ainda contas de clientes nem isolamento de dados por cliente.
- A tela de login é client-side; a autorização real continua sendo decidida pelo backend.
- O SDK Firebase é carregado do CDN oficial `www.gstatic.com`; o navegador precisa acessar esse domínio.
- Não foi realizado deploy nem teste de login real nesta entrega.
