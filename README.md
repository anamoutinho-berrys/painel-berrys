# Painel Berry's — estrutura modular

O painel deixou de ser um único `index.html` gigante. Agora cada aba tem seus
próprios arquivos, e editar uma aba não encosta nas outras.

## Estrutura de pastas

```
index.html                 → "shell": navegação + injeta cada aba sob demanda
assets/
  core.css                 → todo o CSS (variáveis, layout, componentes)
  core.js                  → dados/utilitários usados por TODAS as abas:
                              lista de contas (ACCOUNTS, com valor mensal
                              contratado), autenticação com a API (apiFetch),
                              formatação (fmt/fmtN/fmtPct), saldo
                              (parseMoney/fetchBal), persistência simples
                              (storeGet/storeSet) e os fetchers genéricos
                              usados por Saldos + Acompanhamento.
  objectives.js             → lib usada pelo "Dash Unidades" (e, só nos
                              utilitários genéricos, pelo "Dash Franqueadora"):
                              classificação de campanha por objetivo (vendas/
                              alcance/tráfego/engajamento/leads) e os fetchers
                              fetchRelInsights/fetchRelCampaigns/fetchRelTopAds.
tabs/
  saldos.html + saldos.js               → aba "Saldos"
  relatorio.html + .js                  → aba "Dash Unidades"
  brasil.html + .js                     → aba "Dash Franqueadora": dash em tempo
                                           real SÓ das contas Berry's Brasil
                                           Principal e Bernardo Berry's.
                                           A renderização/agregação é uma
                                           CÓPIA independente (funções br* em
                                           brasil.js) — dá pra personalizar
                                           cada dash sem afetar o outro.
  acompanhamento.html + .js             → aba "Acompanhamento"
  instagram.html + .js                  → aba "Instagram" (seguidores ao vivo
                                           por unidade + snapshot diário em
                                           data/instagram.json pra calcular
                                           o crescimento ao longo do tempo)
  criativos.html + .js                  → aba "Planejamento de Criativos"
  links.html + .js                      → aba "Central de Links" (sem JS próprio)
  trafego.html + .js                    → aba "Estrutura de Tráfego" (sem JS próprio)
api/
  meta.js                               → proxy pra API da Meta (lê META_TOKEN)
  store.js                              → persistência simples: lê/grava
                                           data/<file>.json no próprio repo via
                                           GitHub Contents API. Usado pelo
                                           histórico de boletos (Saldos) e pelo
                                           board de Criativos.
  check-boletos.js                      → job diário (Vercel Cron, ver
                                           vercel.json) que checa o saldo de
                                           todas as contas e atualiza
                                           data/boleto-log.json sozinho, sem
                                           depender de alguém abrir o painel.
vercel.json                             → agenda o cron de check-boletos.js.
```

## Variáveis de ambiente (Vercel)

- `META_TOKEN` — token da Graph API da Meta, usado por `api/meta.js`.
- `GITHUB_TOKEN` — Personal Access Token do GitHub com permissão de escrita
  no repositório, usado por `api/store.js` pra gravar `data/*.json`.
- `GITHUB_REPO` — `owner/repo` do repositório (ex.: `anamoutinho-berrys/painel-berrys`).
- `GITHUB_BRANCH` — opcional, branch onde `data/*.json` é gravado (default `main`).
- `CRON_SECRET` — opcional; se definido, `api/check-boletos.js` só aceita
  chamadas com header `Authorization: Bearer <CRON_SECRET>` (é o que a
  Vercel envia automaticamente nas execuções agendadas em `vercel.json`).

## Checagem automática de boletos (cron)

`api/check-boletos.js` roda todo dia (horário definido em `vercel.json`,
por padrão 18h UTC / 15h em Brasília) e faz sozinho o que antes só
acontecia quando alguém abria a aba Saldos: busca o saldo disponível de
cada unidade na Meta, compara com o último valor salvo em
`data/boleto-log.json` e, se subir R$10 ou mais, registra a data de hoje
como um pagamento de boleto detectado — a mesma lógica de
`checkBoletoPayment` em `tabs/saldos.js`, só que rodando no servidor em vez
do navegador. Isso evita que a data fique atrasada só porque ninguém abriu
o painel no dia em que o boleto compensou.

A lista de IDs de conta usada pelo job (`ACCOUNT_IDS` em
`api/check-boletos.js`) precisa ser mantida em sincronia manualmente com
`ACCOUNTS` em `assets/core.js` sempre que uma unidade for adicionada,
removida ou tiver o `id`/`card` alterado.

## Regra de ouro

- **Só mexer no CSS/JS de uma aba** → edite **apenas** `tabs/<aba>.html` e
  `tabs/<aba>.js`. As outras abas não são tocadas porque vivem em arquivos
  separados.
- **Mudar algo que vale para o painel inteiro** (lista de contas, formato de
  moeda, chamada à API) → `assets/core.js`.
- **Mudar a classificação de objetivo/campanha** (usada no "Dash
  Unidades") → `assets/objectives.js`.
- **Mudar a navegação em si** (nomes das abas, ordem, mecanismo de troca) →
  `index.html`.

## Link direto pra uma aba

`index.html` lê `location.hash` no carregamento e ao trocar de aba atualiza a
URL (ex.: `index.html#criativos`). Pra mandar um link que já abre direto no
Planejamento de Criativos, existe também o atalho `criativos.html` na raiz,
que redireciona pra `index.html#criativos` — mais curto de compartilhar.

## Como funciona o carregamento

O `index.html` não tem mais o conteúdo de cada aba embutido. Ele só tem as
`<div id="tab-*">` vazias (uma por aba) e um pequeno *loader*: na primeira vez que uma
aba é aberta, o loader busca `tabs/<aba>.html`, injeta como HTML dentro da
div, e carrega `tabs/<aba>.js` dinamicamente (que define as funções daquela
aba e — se existir — chama `init_<aba>()` para preparar a tela).

Isso significa que **o painel precisa ser servido por HTTP**, não aberto
direto como arquivo (`file://`) — navegadores bloqueiam `fetch()` de arquivos
locais por segurança. Formas de servir:

- **GitHub Pages** (recomendado, já que o código está no GitHub): habilite
  Pages no repositório, aponte para a pasta/branch onde este conteúdo está,
  e pronto — funciona nativamente por HTTP.
- **Testar localmente**: rode `python3 -m http.server 8000` dentro da pasta
  e abra `http://localhost:8000/index.html`.

Se alguém abrir o arquivo direto (duplo clique), cada aba mostra um aviso
explicando isso, em vez de quebrar silenciosamente.

## Adicionando uma aba nova

1. Crie `tabs/nome-da-aba.html` (só o conteúdo interno, sem a `<div id="tab-...">`
   em volta — o loader já cria e injeta dentro dela).
2. Crie `tabs/nome-da-aba.js` com a lógica da aba e, se precisar rodar algo
   assim que a aba abre pela primeira vez, exponha `function init_nome_da_aba() {...}`.
3. No `index.html`: adicione o botão de navegação (`onclick="goTab('chave',this)"`),
   a `<div id="tab-chave" class="tab-page"></div>` vazia, e uma entrada em
   `TAB_FILE` mapeando `'chave' → 'nome-da-aba'`.
