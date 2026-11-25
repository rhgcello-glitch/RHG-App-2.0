# RHG App 2.1.4 — Identidade visual do logotipo

## Alterações
- Cabeçalho agora combina o símbolo vetorial RHG em amarelo com o nome em branco e a descrição em amarelo, no padrão visual do aplicativo.
- Símbolo isolado das ferramentas cruzadas criado a partir do logotipo original, sem inscrições.
- Ícone genérico de raio no destaque “Ferramentas RHG integradas” substituído pelo símbolo da marca sem texto.
- Ícone de instalação/PWA preservado, assim como o restante dos recursos da versão 2.1.3.
- Cache do service worker atualizado para carregar os novos arquivos e evitar manter a identidade visual antiga.

## Arquivos adicionados/alterados
- `rhg-logo.svg` (utilizado no cabeçalho; já existente no pacote e preservado)
- `assets/rhg-symbol.svg` (novo símbolo isolado)
- `index.html`
- `styles.css`
- `service-worker.js`

## Implantação
1. Guarde o ZIP 2.1.3 como backup.
2. Publique o conteúdo deste pacote no mesmo serviço Render, substituindo os arquivos da versão anterior.
3. Não é necessário alterar Apps Script, planilha, variáveis de ambiente ou manifest.
4. Após o deploy, feche o app instalado e abra novamente. Se necessário, faça uma atualização forçada no navegador.

## Validação
- JavaScript principal verificado com `node --check`.
- Referências dos dois SVGs conferidas no pacote.
- Ícones PWA originais preservados sem alteração.
- Recomenda-se validar visualmente no navegador desktop e no app instalado após publicação.
