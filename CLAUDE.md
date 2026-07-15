# Painel Berry's — guia para o Claude

## Nomes que a Ana usa para os dois dashboards de tempo real

O painel tem DUAS abas de dash em tempo real, parecidas mas independentes.
Quando a Ana pedir uma alteração, o nome indica em quais arquivos mexer:

- **"Dash Unidades"** (ou "dash das unidades", "dash das cidades") →
  aba "📈 Dash Unidades", com TODAS as unidades/cidades da lista `ACCOUNTS`
  de `assets/core.js`. Código: `tabs/relatorio.html` + `tabs/relatorio.js`.

- **"Dash Franqueadora"** (ou "dash da franqueadora") → aba
  "🇧🇷 Dash Franqueadora", SÓ com as duas contas nacionais definidas em
  `BR_ACCOUNTS` dentro de `tabs/brasil.js`: Berry's Brasil Principal
  (act 1835196527242936) e Bernardo Berry's (act 648499830908887).
  Código: `tabs/brasil.html` + `tabs/brasil.js`.

## Regra de independência (importante!)

A Ana quer poder personalizar cada dash SEM afetar o outro. Por isso o
Dash Franqueadora tem CÓPIAS próprias da renderização e da agregação
(funções `br*` em `tabs/brasil.js` — `brRenderUnit`,
`brAggregateByObjective`, `brRenderObjBlock` etc.), em vez de compartilhar
com `tabs/relatorio.js`.

- Alteração pedida para UM dash → mexa só nos arquivos daquele dash.
  NÃO refatore para compartilhar código entre os dois, mesmo que fique
  duplicado — a duplicação aqui é intencional.
- `assets/objectives.js` e `assets/core.js` são compartilhados (fetchers,
  formatação, classificação de objetivo) — mudanças ali afetam várias
  abas; confira as duas antes de publicar.
- Particularidade do Dash Franqueadora: cadastros do pixel
  (`complete_registration`) contam como lead (constante `BR_A_LEAD` em
  `tabs/brasil.js`). No Dash Unidades isso não se aplica.

## Fluxo de publicação

Deploy é automático pela Vercel: merge no `main` → produção atualiza.
O padrão da Ana é abrir PR e ela aprovar (ou pedir para mergear).
