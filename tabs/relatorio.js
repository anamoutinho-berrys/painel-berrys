// ============================================================================
// tabs/relatorio.js — lógica exclusiva da aba "Relatório Real-Time".
// Depende de: core.js (ACCOUNTS, apiFetch, fmt/fmtN, paintTodayDate) e
// objectives.js (getAct, A_*, classifyObjective, classifyCampaigns,
// aggregateByObjective, fetchRelInsights/Campaigns/TopAds, tile/mrow).
// Qualquer mudança na classificação de objetivo/campanha deve ser feita em
// objectives.js, não aqui.
// ============================================================================

let relAutoTimer = null;

function onRelDateChange() {
  const v = document.getElementById('rel-preset').value;
  document.getElementById('rel-custom-dt').classList.toggle('show', v === 'custom');
  if (v !== 'custom') relFetch();
}

function toggleRelAutoRefresh() {
  const on = document.getElementById('rel-autorefresh').checked;
  if (on) { relFetch(); relAutoTimer = setInterval(relFetch, 5 * 60 * 1000); }
  else { clearInterval(relAutoTimer); relAutoTimer = null; }
}

function getRelDateParams() {
  const p = document.getElementById('rel-preset').value;
  if (p === 'custom') {
    const s = document.getElementById('rel-since').value;
    const u = document.getElementById('rel-until').value;
    if (!s || !u) return null;
    return { time_range: JSON.stringify({ since: s, until: u }) };
  }
  return { preset: p };
}

function renderObjBlock(key, g) {
  const meta = OBJ_GROUPS[key];
  let body = '';
  if (key === 'vendas') {
    body = `<div class="rel-tiles">
      ${tile('🛍️','Compras no site', fmtN(g.purchases), true)}
      ${tile('🏷️','Custo por compra', g.costPerPurchase!=null?fmt(g.costPerPurchase):'—')}
      ${tile('💲','Valor de conversão', g.convValue>0?fmt(g.convValue):'—')}
      ${tile('📈','ROAS', g.roas!=null?g.roas.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—', true)}
      ${tile('👥','Alcance', fmtN(g.reach))}
      ${tile('👁️','Impressões', fmtN(g.impressions))}
      ${tile('🖱️','Cliques', fmtN(g.clicks))}
      ${tile('📊','CTR', fmtPct(g.ctr))}
      ${tile('💸','CPC', g.cpc!=null?fmt(g.cpc):'—')}
      ${g.lpv>0?tile('📄','Visualizações da página', fmtN(g.lpv)):''}
      ${g.costPerLpv!=null?tile('🧾','Custo por visualização', fmt(g.costPerLpv)):''}
      ${g.msgs>0?tile('💬','Conversas iniciadas', fmtN(g.msgs)):''}
    </div>`;
  } else if (key === 'alcance') {
    body = `
      ${mrow('👥','Alcance', fmtN(g.reach)+' pessoas')}
      ${mrow('👁️','Impressões', fmtN(g.impressions))}
      ${mrow('🔁','Frequência', g.frequency? g.frequency.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—')}
      ${mrow('📊','Custo por 1.000 pessoas alcançadas', g.costPerReach!=null?fmt(g.costPerReach):'—')}
      ${mrow('🧾','CPM', g.cpm!=null?fmt(g.cpm):'—')}
      ${g.clicks>0?mrow('🖱️','Cliques no link', fmtN(g.clicks)):''}`;
  } else if (key === 'trafego') {
    body = `<div class="rel-tiles">
      ${tile('🖱️','Cliques no link', fmtN(g.linkClicks||g.clicks), true)}
      ${tile('💸','CPC', g.cpc!=null?fmt(g.cpc):'—')}
      ${tile('📊','CTR', fmtPct(g.ctr))}
      ${g.lpv>0?tile('📄','Visualizações da página', fmtN(g.lpv)):''}
      ${g.costPerLpv!=null?tile('🧾','Custo por visualização', fmt(g.costPerLpv)):''}
      ${tile('👥','Alcance', fmtN(g.reach))}
      ${tile('👁️','Impressões', fmtN(g.impressions))}
    </div>`;
  } else if (key === 'engaj') {
    body = `<div class="rel-tiles">
      ${tile('➕','Novos seguidores', g.follows>0?fmtN(g.follows):'—', true)}
      ${tile('🧾','Custo por seguidor', g.costPerFollow!=null?fmt(g.costPerFollow):'—', true)}
      ${tile('👥','Engajamentos', fmtN(g.engagement))}
      ${tile('🏷️','Custo por engajamento', g.costPerEng!=null?fmt(g.costPerEng):'—')}
      ${g.msgs>0?tile('💬','Conversas iniciadas', fmtN(g.msgs)):''}
      ${tile('👤','Alcance', fmtN(g.reach))}
      ${tile('👁️','Impressões', fmtN(g.impressions))}
    </div>`;
  } else if (key === 'leads') {
    body = `<div class="rel-tiles">
      ${tile('📋','Leads', fmtN(g.leads), true)}
      ${tile('🏷️','Custo por lead', g.costPerLead!=null?fmt(g.costPerLead):'—')}
      ${tile('🖱️','Cliques', fmtN(g.clicks))}
      ${tile('📊','CTR', fmtPct(g.ctr))}
      ${tile('👥','Alcance', fmtN(g.reach))}
    </div>`;
  } else {
    body = `<div class="rel-tiles">
      ${tile('👥','Alcance', fmtN(g.reach))}
      ${tile('👁️','Impressões', fmtN(g.impressions))}
      ${tile('🖱️','Cliques', fmtN(g.clicks))}
      ${tile('🧾','CPM', g.cpm!=null?fmt(g.cpm):'—')}
    </div>`;
  }
  return `<div class="rel-obj-block">
    <div class="rel-obj-block-head">
      <div class="rel-obj-pill">${meta.icon} ${meta.label}</div>
      <div class="rel-obj-invest">Investimento: <strong>${fmt(g.spend)}</strong></div>
    </div>
    ${body}
  </div>`;
}

function buildResumo(displayName, groups) {
  const parts = [];
  const v = groups.vendas, a = groups.alcance, t = groups.trafego, e = groups.engaj;
  if (v && v.purchases > 0) {
    parts.push(`As campanhas de vendas geraram <strong>${fmtN(v.purchases)} compra${v.purchases>1?'s':''}</strong>` +
      (v.roas!=null ? `, com ROAS de <strong>${v.roas.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong> — para cada R$ 1,00 investido, retornaram ${fmt(v.roas)} em valor de conversão` : '') + '.');
  } else if (v) {
    parts.push('As campanhas de vendas ainda não registraram compras no período.');
  }
  if (a) parts.push(`No alcance, a unidade impactou <strong>${fmtN(a.reach)} pessoas</strong> a um custo de ${a.costPerReach!=null?fmt(a.costPerReach):'—'} por 1.000 alcançadas.`);
  if (t && (t.linkClicks||t.clicks) > 0) parts.push(`O tráfego gerou <strong>${fmtN(t.linkClicks||t.clicks)} cliques</strong>${t.cpc!=null?` a ${fmt(t.cpc)} por clique`:''}.`);
  if (e && e.follows > 0) parts.push(`Engajamento somou <strong>${fmtN(e.follows)} novos seguidores</strong>${e.costPerFollow!=null?` a ${fmt(e.costPerFollow)} por seguidor`:''}.`);
  if (!parts.length) return '';
  return `<div class="rel-resumo"><span class="r-chip">Resumo:</span><p>${parts.join(' ')}</p></div>`;
}

// plataforma(s) de delivery em que a unidade está anunciando no período —
// usa deliveryPlatformFor() (objectives.js): delivery com campanha de
// vendas/conversão é Anota Aí, delivery com campanha de tráfego é iFood
function detectDeliveryPlatforms(campaigns) {
  const active = campaigns.filter(c => parseFloat(c.insights?.data?.[0]?.spend || 0) > 0);
  const found = new Map();
  active.forEach(c => {
    const p = deliveryPlatformFor(c);
    if (p && !found.has(p.key)) found.set(p.key, p);
  });
  return [...found.values()].map(p => ({ key: p.key, icon: p.icon, label: p.name, color: p.color }));
}

// Conteúdo que abre ao clicar numa linha da tabela. O nome, o investimento e o
// alcance já estão na linha, então aqui não repete cabeçalho — só o link do
// Gerenciador e o detalhamento por objetivo / campanhas / anúncios.
function renderRelUnit(acc, insights, topAds, campaigns, hasData, unitErr) {
  const card = document.createElement('div');
  card.className = 'du-detail';
  const displayName = acc.name.replace(/berry's\s*/i, '').trim().toUpperCase();
  const groups = aggregateByObjective(campaigns);
  const groupKeys = Object.keys(groups).sort((x,y) => OBJ_GROUPS[x].order - OBJ_GROUPS[y].order);

  const header = acc.mgr
    ? `<div class="du-detail-top"><a class="rel-card-mgr" href="${acc.mgr}" target="_blank">↗ Abrir no Gerenciador</a></div>`
    : '';

  if (!hasData) {
    const msg = unitErr
      ? `⚠️ Erro ao consultar a API: <span style="color:#c0392b;">${unitErr}</span>`
      : 'Nenhuma métrica encontrada para o período selecionado.';
    card.innerHTML = header + `<div class="rel-nodata">${msg}</div>`;
    return card;
  }

  // blocos por objetivo — cada um só com as métricas que fazem sentido
  let objBlocks = groupKeys.map(k => renderObjBlock(k, groups[k])).join('');
  if (!groupKeys.length) {
    // sem detalhamento de campanha: mostra visão geral da conta
    objBlocks = `<div class="rel-obj-block">
      <div class="rel-obj-block-head"><div class="rel-obj-pill">📦 VISÃO GERAL DA CONTA</div>
      <div class="rel-obj-invest">Investimento: <strong>${fmt(insights.spend)}</strong></div></div>
      ${mrow('👥','Alcance', fmtN(insights.reach)+' pessoas')}
      ${mrow('👁️','Impressões', fmtN(insights.impressions))}
      ${mrow('🖱️','Cliques', fmtN(insights.clicks))}
      ${mrow('🧾','CPM', fmt(insights.cpm))}
    </div>`;
  }

  const resumo = buildResumo(displayName, groups);

  // só entram temas de campanhas que de fato tiveram gasto no período — uma
  // campanha ACTIVE sem investimento na janela selecionada não "veiculou" nela.
  // iFood (tráfego) e Anota Aí (vendas) sempre aparecem separados — ver
  // deliveryPlatformFor()/classifyCampaigns() em objectives.js
  const spentCampaigns = campaigns.filter(c => parseFloat(c.insights?.data?.[0]?.spend || 0) > 0);
  const themes = classifyCampaigns(spentCampaigns);
  const themePills = themes.length
    ? themes.map(t => `<span class="rel-theme-pill" style="color:${t.color};background:${t.bg};">${t.label}</span>`).join('')
    : `<span style="font-size:11px;color:#b8d2e4;font-weight:800;">Nenhuma campanha com investimento neste período</span>`;
  const themesBlock = `<div class="rel-themes-section">
    <div class="rel-section-lbl">O que rodou nesta unidade no período (${spentCampaigns.length} campanha${spentCampaigns.length===1?'':'s'} com investimento)</div>
    <div class="rel-themes-row">${themePills}</div>
  </div>`;

  const statusDot = st => st === 'ACTIVE' ? '#27ae60' : st === 'PAUSED' ? '#f5a623' : '#bbb';
  const objShort = { vendas:'Vendas', alcance:'Alcance', trafego:'Tráfego', engaj:'Engaj.', leads:'Leads', outros:'Outro' };
  const campRows = campaigns.map(c => {
    const sp = parseFloat(c.insights?.data?.[0]?.spend || 0);
    return `<div class="rel-camp-row">
      <div class="rel-camp-dot" style="background:${statusDot(c.status)}"></div>
      <div class="rel-camp-name" title="${c.name}">${c.name}</div>
      <span class="rel-camp-obj">${objShort[classifyObjective(c)]}</span>
      ${sp > 0 ? `<div class="rel-camp-spend">${fmt(sp)}</div>` : ''}
    </div>`;
  }).join('');
  const n = campaigns.length;
  const campsBlock = n ? `<div class="rel-camps-section">
    <div class="rel-section-lbl">Campanhas</div>
    <button class="rel-camps-toggle" onclick="const l=this.nextElementSibling;l.classList.toggle('open');this.textContent=l.classList.contains('open')?'▲ ocultar':'▼ ver ${n} campanha${n>1?'s':''}';">▼ ver ${n} campanha${n>1?'s':''}</button>
    <div class="rel-camp-list">${campRows}</div>
  </div>` : '';

  const rankCls = ['r1','r2','r3'];
  const adsRows = topAds.length ? topAds.map((ad, i) => {
    const ins = ad.insights.data[0];
    const thumb = ad.creative?.thumbnail_url;
    const sp  = parseFloat(ins.spend) || 0;
    const rch = parseInt(ins.reach) || 0;
    const clk = parseInt(ins.clicks) || 0;
    const pur = getAct(ins.actions, A_PURCHASE);
    return `<div class="rel-ad-item">
      <div class="rel-ad-rank ${rankCls[i]}">${i+1}</div>
      ${thumb ? `<img class="rel-ad-thumb" src="${thumb}" onerror="this.style.display='none'" loading="lazy"/>` : `<div class="rel-ad-thumb"></div>`}
      <div class="rel-ad-info">
        <div class="rel-ad-name">${ad.name}</div>
        <div class="rel-ad-metrics">${fmt(sp)} · ${fmtN(rch)} alcance · ${fmtN(clk)} cliques${pur>0?` · 🛍️ ${fmtN(pur)} compras`:''}</div>
      </div>
    </div>`;
  }).join('') : `<div class="rel-nodata" style="padding:8px 0 0;">Nenhum anúncio com gasto no período.</div>`;

  card.innerHTML = header + objBlocks + resumo + themesBlock + campsBlock + `
    <div class="rel-ads-section">
      <div class="rel-ads-badge-wrap"><div class="rel-ads-badge">🏆 MELHORES ANÚNCIOS</div></div>
      ${adsRows}
    </div>`;
  return card;
}

// tema da campanha/criativo (mesma lógica de CAMPAIGN_THEMES em objectives.js) —
// usado para agrupar variações do mesmo criativo (ex.: "Festival de Inverno")
// que tenham nomes literais diferentes entre unidades. Só temas com netGroup
// (campanhas de rede — mesmo criativo em todas as unidades) agrupam; categorias
// como "Influenciador" ficam de fora, pois o vídeo de cada unidade é diferente.
function themeKeyForAdName(name) {
  const n = (name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const theme of CAMPAIGN_THEMES) {
    if (!theme.netGroup) continue;
    if (theme.keys.some(k => n.includes(k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
      return theme.label;
    }
  }
  return null;
}

// agrega os "melhores anúncios" (já top-3 por unidade) numa lista única da rede,
// contando em quantas unidades cada criativo apareceu como destaque. Criativos
// reconhecidos como o mesmo tema (ex.: variações do "Festival de Inverno" com
// nomes diferentes por unidade) são agrupados numa única entrada, e o ranking
// final não repete o mesmo tema em mais de uma posição — a vaga vai para o
// próximo melhor criativo de um tema/objetivo diferente.
function computeNetworkTopCreatives(unitsAds) {
  const map = new Map();
  unitsAds.forEach(({ accName, ads }) => {
    ads.forEach(ad => {
      const ins = ad.insights?.data?.[0];
      if (!ins) return;
      const theme = themeKeyForAdName(ad.name);
      const key = theme || ad.name;
      if (!map.has(key)) {
        map.set(key, { name: ad.name, theme, thumb: ad.creative?.thumbnail_url, units: new Set(), spend: 0, reach: 0, clicks: 0, purchases: 0, convValue: 0 });
      }
      const e = map.get(key);
      e.units.add(accName);
      e.spend     += parseFloat(ins.spend) || 0;
      e.reach     += parseInt(ins.reach) || 0;
      e.clicks    += parseInt(ins.clicks) || 0;
      e.purchases += getAct(ins.actions, A_PURCHASE);
      e.convValue += getAct(ins.action_values, A_PURCHASE);
      if (!e.thumb && ad.creative?.thumbnail_url) e.thumb = ad.creative.thumbnail_url;
    });
  });

  const ranked = [...map.values()]
    .filter(c => c.units.size > 1) // só criativos que se destacaram em mais de uma unidade
    .sort((a, b) => (b.units.size - a.units.size) || (b.spend - a.spend));

  const result = [], seenThemes = new Set();
  for (const c of ranked) {
    if (c.theme) {
      if (seenThemes.has(c.theme)) continue; // já ocupou uma vaga com esse tema
      seenThemes.add(c.theme);
    }
    result.push(c);
    if (result.length >= 5) break;
  }
  return result;
}

// nome curto de exibição de uma unidade (sem o prefixo "Berry's")
function unitDisplayName(accName) {
  return accName.replace(/berry's\s*/i, '').trim();
}

// linha de métricas do criativo da rede. Criativo de campanha de vendas (tem
// valor de conversão rastreado) mostra ROAS; os demais mostram o alcance.
function netCreativeMetrics(c) {
  const base = fmt(c.spend, 0);
  if (c.convValue > 0) {
    const roas = c.spend > 0 ? c.convValue / c.spend : 0;
    return `${base} · ROAS ${fmtRoas(roas)}${c.purchases > 0 ? ` · ${fmtN(c.purchases)} compras` : ''}`;
  }
  return `${base} · ${fmtN(c.reach)} alcance`;
}

function fmtRoas(v) {
  return v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Top 5 enxuto: uma linha por criativo (posição, miniatura, nome, em quantas
// unidades se destacou e o resultado). Os nomes das unidades ficam no tooltip.
function renderNetworkTopCreatives(list) {
  const wrap = document.getElementById('rel-top-creatives');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = `<div class="rel-nodata">Nenhum criativo se destacou em mais de uma unidade no período.</div>`;
    return;
  }
  const rankCls = ['r1', 'r2', 'r3'];
  wrap.innerHTML = list.map((c, i) => {
    const units = [...c.units].sort().map(unitDisplayName);
    return `
    <div class="du-cr-row">
      <div class="du-cr-rank ${rankCls[i] || 'rn'}">${i + 1}</div>
      ${c.thumb ? `<img class="du-cr-thumb" src="${c.thumb}" onerror="this.style.display='none'" loading="lazy"/>` : `<div class="du-cr-thumb"></div>`}
      <div class="du-cr-info">
        <div class="du-cr-name" title="${c.name}">${c.theme || c.name}</div>
        <div class="du-cr-metrics">${netCreativeMetrics(c)}</div>
      </div>
      <div class="du-cr-units" title="${units.join(', ')}"><strong>${units.length}</strong> unidades</div>
    </div>`;
  }).join('');
}

/* ── tabela de unidades ──────────────────────────────────────────────────
   Uma linha por unidade, ordenável. Clicar na linha abre o detalhe (o card
   gerado por renderRelUnit). relRows guarda o estado de cada unidade. */

let relRows = [];
let relSort = { key: 'spend', dir: -1 };
const relOpen = new Set();

const REL_COLS = [
  { key: 'name',      label: 'Unidade',   fmt: v => v },
  { key: 'spend',     label: 'Investido', fmt: v => fmt(v, 0) },
  { key: 'reach',     label: 'Alcance',   fmt: v => fmtN(v) },
  { key: 'purchases', label: 'Compras',   fmt: v => fmtN(Math.round(v)) },
  { key: 'roas',      label: 'ROAS',      fmt: v => fmtRoas(v) },
  { key: 'clicks',    label: 'Cliques',   fmt: v => fmtN(v) },
  { key: 'follows',   label: 'Seguidores',fmt: v => fmtN(v) },
];

// números da linha: compras / ROAS / cliques / seguidores só existem para as
// unidades que têm campanha daquele objetivo (null → mostra "—")
function relRowSummary(ins, groups, purchases) {
  const g = groups;
  return {
    spend:     ins.spend || 0,
    reach:     ins.reach || 0,
    purchases: (g.vendas || purchases > 0) ? purchases : null,
    roas:      g.vendas ? g.vendas.roas : null,
    clicks:    g.trafego ? (g.trafego.linkClicks || g.trafego.clicks) : null,
    follows:   g.engaj && g.engaj.follows > 0 ? g.engaj.follows : null,
  };
}

function relCompare(a, b) {
  const { key, dir } = relSort;
  // unidades ainda carregando vão para o fim
  if (a.loading !== b.loading) return a.loading ? 1 : -1;
  if (key === 'name') return dir * a.name.localeCompare(b.name, 'pt-BR');
  const va = a.s?.[key], vb = b.s?.[key];
  if (va == null && vb == null) return a.name.localeCompare(b.name, 'pt-BR');
  if (va == null) return 1;   // "—" sempre embaixo, qualquer que seja a direção
  if (vb == null) return -1;
  return dir * (va - vb) || a.name.localeCompare(b.name, 'pt-BR');
}

function relSortBy(key) {
  relSort = relSort.key === key ? { key, dir: -relSort.dir } : { key, dir: key === 'name' ? 1 : -1 };
  renderRelTable();
}

function relToggleRow(name) {
  if (relOpen.has(name)) relOpen.delete(name); else relOpen.add(name);
  renderRelTable();
}

function renderRelTable() {
  const wrap = document.getElementById('rel-units-wrap');
  if (!wrap) return;
  const rows = [...relRows].sort(relCompare);
  const maxSpend = Math.max(0, ...rows.map(r => r.s?.spend || 0));

  const arrow = k => relSort.key === k ? (relSort.dir < 0 ? ' ▼' : ' ▲') : '';
  const thead = `<thead><tr>${REL_COLS.map(c =>
    `<th class="${c.key === 'name' ? 'l' : 'n'}${relSort.key === c.key ? ' sorted' : ''}" onclick="relSortBy('${c.key}')">${c.label}${arrow(c.key)}</th>`
  ).join('')}</tr></thead>`;

  const tbody = document.createElement('tbody');
  rows.forEach(r => {
    const open = relOpen.has(r.name);
    const tr = document.createElement('tr');
    tr.className = 'du-row' + (open ? ' open' : '');
    if (r.loading) {
      tr.innerHTML = `<td class="l"><span class="du-chev"></span><span class="du-name">${r.name}</span></td>
        <td colspan="${REL_COLS.length - 1}" class="du-loading"><span class="spin"></span> Carregando…</td>`;
      tbody.appendChild(tr);
      return;
    }
    tr.onclick = () => relToggleRow(r.name);
    const badges = (r.platforms || []).map(p =>
      `<span class="du-badge" style="background:${p.color};" title="Anunciando em ${p.label}">${p.icon} ${p.label}</span>`).join('');
    const bar = maxSpend > 0 ? `<div class="du-bar"><i style="width:${Math.max(2, (r.s.spend / maxSpend) * 100)}%"></i></div>` : '';
    const cells = REL_COLS.slice(1).map(c => {
      const v = r.s[c.key];
      const empty = v == null || (!r.hasData);
      return `<td class="n${c.key === 'spend' ? ' spend' : ''}${empty ? ' empty' : ''}">${empty ? '—' : c.fmt(v)}${c.key === 'spend' && !empty ? bar : ''}</td>`;
    }).join('');
    tr.innerHTML = `<td class="l"><span class="du-chev">▸</span><span class="du-name">${r.name}</span>${badges}${r.err ? '<span class="du-err" title="Erro na API — abra o detalhe">⚠️</span>' : ''}</td>${cells}`;
    tbody.appendChild(tr);

    if (open) {
      const dr = document.createElement('tr');
      dr.className = 'du-detail-row';
      const td = document.createElement('td');
      td.colSpan = REL_COLS.length;
      td.appendChild(r.card);
      dr.appendChild(td);
      tbody.appendChild(dr);
    }
  });

  const table = document.createElement('table');
  table.className = 'du-table';
  table.innerHTML = thead;
  table.appendChild(tbody);
  const scroller = document.createElement('div');
  scroller.className = 'du-table-scroll';
  scroller.appendChild(table);
  wrap.innerHTML = '';
  wrap.appendChild(scroller);
}

async function relFetch() {
  const dateParams = getRelDateParams();
  if (!dateParams) { alert('Preencha as datas de início e fim.'); return; }

  const valid = ACCOUNTS.filter(a => a.id && !a.card);
  const networkAdsData = [];
  relRows = valid.map(acc => ({ name: unitDisplayName(acc.name).toUpperCase(), loading: true, s: null }));
  renderRelTable();

  const pw = document.getElementById('rel-prog-wrap');
  const pf = document.getElementById('rel-prog-fill');
  const pl = document.getElementById('rel-prog-lbl');
  pw.classList.add('show');
  pf.style.width = '0%';

  let totalSpend = 0, totalReach = 0, totalPurch = 0, totalConvVal = 0;
  let done = 0;
  const relErrors = [];
  const errEl = document.getElementById('rel-err-banner');
  if (errEl) { errEl.style.display = 'none'; errEl.innerHTML = ''; }

  for (let i = 0; i < valid.length; i += 3) {
    await Promise.all(valid.slice(i, i + 3).map(async (acc, j) => {
      const idx = i + j;
      let ins = {}, topAds = [], campaigns = [], unitErr = null;
      const results = await Promise.allSettled([
        fetchRelInsights(acc.id, dateParams),
        fetchRelTopAds(acc.id, dateParams),
        fetchRelCampaigns(acc.id, dateParams)
      ]);
      if (results[0].status === 'fulfilled') ins = results[0].value; else unitErr = results[0].reason?.message || 'erro na API';
      if (results[1].status === 'fulfilled') topAds = results[1].value;
      if (results[2].status === 'fulfilled') campaigns = results[2].value;
      if (topAds.length) networkAdsData.push({ accName: acc.name, ads: topAds });

      const hasData = ins.spend > 0 || ins.impressions > 0;
      if (unitErr) relErrors.push(acc.name + ': ' + unitErr);
      totalSpend  += ins.spend  || 0;
      totalReach  += ins.reach  || 0;
      let unitPurch = 0;
      campaigns.forEach(c => {
        const ci = c.insights?.data?.[0];
        if (!ci) return;
        unitPurch    += getAct(ci.actions, A_PURCHASE);
        totalConvVal += getAct(ci.action_values, A_PURCHASE);
      });
      totalPurch += unitPurch;

      const groups = aggregateByObjective(campaigns);
      relRows[idx] = {
        name: unitDisplayName(acc.name).toUpperCase(),
        loading: false,
        hasData,
        err: unitErr,
        platforms: detectDeliveryPlatforms(campaigns),
        s: relRowSummary(ins, groups, unitPurch),
        card: renderRelUnit(acc, ins, topAds, campaigns, hasData, unitErr),
      };
      renderRelTable();

      done++;
      pf.style.width = (done / valid.length * 100) + '%';
      pl.textContent = `${done} / ${valid.length} unidades…`;

      document.getElementById('rel-total-spend').textContent   = fmt(totalSpend);
      document.getElementById('rel-total-reach').textContent   = fmtN(totalReach);
      document.getElementById('rel-total-purch').textContent   = fmtN(Math.round(totalPurch));
      document.getElementById('rel-total-convval').textContent = fmt(totalConvVal);
      document.getElementById('rel-total-roas').textContent    = totalSpend > 0 && totalConvVal > 0 ? `ROAS ${fmtRoas(totalConvVal / totalSpend)}` : 'retorno gerado';
    }));
  }

  pw.classList.remove('show');

  renderNetworkTopCreatives(computeNetworkTopCreatives(networkAdsData));

  if (relErrors.length && errEl) {
    errEl.style.display = 'block';
    errEl.innerHTML = '<strong>⚠️ ' + relErrors.length + ' unidade(s) com erro na API</strong> — abra o console (F12) para detalhes.<br><span style="font-weight:600;font-size:11px;">' + relErrors.slice(0,5).join(' · ') + (relErrors.length>5?' · …':'') + '</span>';
  }
  const sel = document.getElementById('rel-preset');
  document.getElementById('rel-period-sub').textContent = sel.options[sel.selectedIndex].text.toLowerCase();
  document.getElementById('rel-last-up').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
  document.getElementById('rel-date-display').textContent = new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
}

function init_relatorio() {
  // a aba só carrega dados quando o usuário clica em "Atualizar" (relFetch)
}
