# Painel Berry's — estrutura modular

O painel deixou de ser um único `index.html` gigante. Agora cada aba tem seus
próprios arquivos, e editar uma aba não encosta nas outras.

## Estrutura de pastas

```
index.html                 → "shell": navegação + injeta cada aba sob demanda
assets/
  core.css                 → todo o CSS (variáveis, layout, componentes)
  core.js                  → dados/utilitários usados por TODAS as abas:
                              lista de contas (ACCOUNTS), autenticação com a
                              API (apiFetch), formatação (fmt/fmtN/fmtPct),
                              saldo (parseMoney/fetchBal) e os fetchers
                              genéricos usados por Saldos + Acompanhamento +
                              Campanhas (fetchAccountData e afins).
  objectives.js             → lib compartilhada só entre "Relatório Real-Time"
                              e "Insights": classificação de campanha por
                              objetivo (vendas/alcance/tráfego/engajamento/
                              leads) e os fetchers fetchRelInsights/
                              fetchRelCampaigns/fetchRelTopAds.
tabs/
  saldos.html + saldos.js               → aba "Saldos"
  acompanhamento.html + .js             → aba "Acompanhamento"
  insights.html + .js                   → aba "Insights"
  campanhas.html + .js                  → aba "Campanhas"
  links.html + .js                      → aba "Central de Links" (sem JS próprio)
  trafego.html + .js                    → aba "Estrutura de Tráfego" (sem JS próprio)
  relatorio.html + .js                  → aba "Relatório Real-Time"
```

## Regra de ouro

- **Só mexer no CSS/JS de uma aba** → edite **apenas** `tabs/<aba>.html` e
  `tabs/<aba>.js`. As outras abas não são tocadas porque vivem em arquivos
  separados.
- **Mudar algo que vale para o painel inteiro** (lista de contas, formato de
  moeda, chamada à API) → `assets/core.js`.
- **Mudar a classificação de objetivo/campanha** (usada tanto no Relatório
  quanto no Insights) → `assets/objectives.js`. Depois de editar, confira as
  duas abas antes de publicar, já que ambas dependem desse arquivo.
- **Mudar a navegação em si** (nomes das abas, ordem, mecanismo de troca) →
  `index.html`.

## Como funciona o carregamento

O `index.html` não tem mais o conteúdo de cada aba embutido. Ele só tem os
7 `<div id="tab-*">` vazios e um pequeno *loader*: na primeira vez que uma
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
