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

## Cronograma IG

Aba "📅 Cronograma IG" → mostra quantos reels e posts estáticos cada unidade
publicou no Instagram num período escolhido (7 dias, 30 dias, este mês ou
mês passado), comparado com a meta semanal liberada pela franqueadora
(4 reels + 3 estáticos — proporcional quando o período é maior que 7 dias).
Código: `tabs/cronograma.html` + `tabs/cronograma.js`.

- A lista de unidades x id da conta de anúncios mora em `CG_UNITS` dentro
  de `tabs/cronograma.js` (mesmos ids de `ACCOUNTS` em `assets/core.js`).
- IMPORTANTE: NÃO usar o campo `business_discovery` do Graph API pra puxar
  @ arbitrário — ele exige a permissão "Instagram Public Content Access",
  que o app não tem, e dá erro "(#10) Application does not have permission
  for this action". Em vez disso, a conta de Instagram é descoberta a
  partir da conta de anúncios de cada unidade (`connected_instagram_accounts`
  → `promote_pages`/`assigned_pages` → `instagram_accounts`, nessa ordem),
  igual à extinta aba "Instagram" (ver `git log --all -- tabs/instagram.js`
  se precisar consultar aquela implementação). Por isso só dá pra monitorar
  unidades que já têm conta de anúncios cadastrada em `ACCOUNTS`.
- Unidades sem conta de anúncios ainda (Shopping Riomar Aracaju, Shopping
  Tacaruna, RibeirãoShopping) ficam sem monitoramento até terem conta —
  o @ conhecido delas aparece só como referência na tabela.
- "Berry's Conquista" tem conta de anúncios própria (diferente da
  Contagem), então o @ dela é descoberto automaticamente pela API — não
  depende de nenhum @ digitado à mão, resolve a ambiguidade que existia
  na lista original repassada pela Ana.

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
