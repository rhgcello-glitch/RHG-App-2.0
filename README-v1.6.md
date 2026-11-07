# RHG-App Web — v1.6

## Histórico persistente e máscara de telefone

### Principais ajustes desta versão

- Histórico de orçamentos preparado para persistência na aba `ORÇAMENTOS`.
- Uso do `ID Interno` como identificador único do orçamento.
- Atualização do mesmo orçamento em vez de criar duplicatas quando o ID já existe.
- Compatibilidade com as 14 colunas da aba `ORÇAMENTOS`.
- Máscara de telefone aplicada diretamente no `index.html`, com suporte a telefone fixo e celular.
- `inputmode="numeric"`, `maxlength="15"` e `autocomplete="tel"` no campo de telefone.
- Máscara resiliente caso o campo seja criado/reconstruído dinamicamente pela interface.
- Esta versão deve ser publicada no Render após o commit no GitHub.

## Estrutura esperada da aba ORÇAMENTOS

1. ID Interno
2. Número do Orçamento
3. Data
4. ID Cliente
5. Cliente
6. Serviços
7. Materiais
8. Subtotal
9. Desconto
10. Total
11. Status
12. Observações
13. Fonte do Documento
14. Tipo de Registro

## Publicação

1. Substituir os arquivos do projeto pelos arquivos desta versão.
2. Fazer commit no GitHub.
3. No Render, usar **Manual Deploy → Deploy latest commit**.
4. Após o deploy, recarregar o aplicativo no celular/tablet para atualizar o PWA.

## Teste da máscara

O campo deve aceitar somente números e formatar automaticamente:

- Fixo: `(11) 1234-5678`
- Celular: `(11) 91234-5678`

