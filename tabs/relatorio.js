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

function unitIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('moc')) return '🏪';
  if (n.includes('aracaju') || n.includes('recife') || n.includes('maceió') || n.includes('maceio') || n.includes('salvador')) return '🌴';
  if (n.includes('savassi') || n.includes('contagem') || n.includes('uberaba') || n.includes('anápolis') || n.includes('anapolis')) return '🏙️';
  return '🍦';
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

function renderRelUnit(acc, insights, topAds, campaigns, hasData, unitErr) {
  const card = document.createElement('div');
  card.className = 'rel-unit-card';
  const displayName = acc.name.replace(/berry's\s*/i, '').trim().toUpperCase();
  const groups = aggregateByObjective(campaigns);
  const groupKeys = Object.keys(groups).sort((x,y) => OBJ_GROUPS[x].order - OBJ_GROUPS[y].order);

  const objBadges = groupKeys.length
    ? `<div class="rel-obj-badges">${groupKeys.map((k,i) =>
        `<span class="rel-obj-badge${i>0?' alt':''}">${OBJ_GROUPS[k].icon} ${OBJ_GROUPS[k].label}</span>`).join('')}</div>`
    : '';

  const deliveryPlatforms = detectDeliveryPlatforms(campaigns);
  const deliveryBadges = deliveryPlatforms.length
    ? `<div class="rel-delivery-badges">${deliveryPlatforms.map(p =>
        `<span class="rel-delivery-badge" style="background:${p.color};">${p.icon} ${p.label}</span>`).join('')}</div>`
    : '';

  const headKpis = hasData ? `<div class="rel-head-kpis">
    <div class="rel-head-kpi"><span class="k-ico">💰</span><span><div class="k-lbl">Investimento total</div><div class="k-val">${fmt(insights.spend)}</div></span></div>
    <div class="rel-head-kpi"><span class="k-ico">👥</span><span><div class="k-lbl">Alcance da conta</div><div class="k-val">${fmtN(insights.reach)}</div></span></div>
  </div>` : '';

  const header = `<div class="rel-card-header">
    <div class="rel-card-icon-wrap">${unitIcon(acc.name)}</div>
    <div class="rel-card-title">${displayName}</div>
    ${acc.mgr ? `<a class="rel-card-mgr" href="${acc.mgr}" target="_blank">↗ Gerenciador</a>` : ''}
    ${deliveryBadges}
    ${headKpis}
    ${objBadges}
  </div>`;

  // chave p/ agrupar unidades com mix de campanhas parecido
  card.dataset.sig   = groupKeys.length ? groupKeys.join('|') : 'zz-none';
  card.dataset.nobj  = groupKeys.length;
  card.dataset.spend = insights.spend || 0;
  if (deliveryPlatforms.length) card.dataset.delivery = deliveryPlatforms.map(p => p.key).join('|');

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
// que tenham nomes literais diferentes entre unidades
function themeKeyForAdName(name) {
  const n = (name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const theme of CAMPAIGN_THEMES) {
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
        map.set(key, { name: ad.name, theme, thumb: ad.creative?.thumbnail_url, units: new Set(), spend: 0, reach: 0, clicks: 0, purchases: 0 });
      }
      const e = map.get(key);
      e.units.add(accName);
      e.spend     += parseFloat(ins.spend) || 0;
      e.reach     += parseInt(ins.reach) || 0;
      e.clicks    += parseInt(ins.clicks) || 0;
      e.purchases += getAct(ins.actions, A_PURCHASE);
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
    if (result.length >= 10) break;
  }
  return result;
}

function renderNetworkTopCreatives(list) {
  const wrap = document.getElementById('rel-top-creatives');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = `<div class="rel-nodata">Nenhum criativo se destacou em mais de uma unidade no período.</div>`;
    return;
  }
  const rankCls = ['r1', 'r2', 'r3'];
  wrap.innerHTML = list.map((c, i) => `
    <div class="rel-net-creative-card">
      <div class="rel-net-creative-thumb-wrap">
        <div class="rel-net-creative-rank ${rankCls[i] || 'rn'}">${i + 1}</div>
        <div class="rel-net-creative-units">🏬 ${c.units.size} unidades</div>
        ${c.thumb ? `<img class="rel-net-creative-thumb" src="${c.thumb}" onerror="this.style.display='none'" loading="lazy"/>` : ''}
      </div>
      <div class="rel-net-creative-body">
        <div class="rel-net-creative-name" title="${c.name}">${c.name}</div>
        <div class="rel-net-creative-metrics">${fmt(c.spend)} · ${fmtN(c.reach)} alcance · ${fmtN(c.clicks)} cliques${c.purchases > 0 ? ` · 🛍️ ${fmtN(c.purchases)} compras` : ''}</div>
      </div>
    </div>
  `).join('');
}

async function relFetch() {
  const dateParams = getRelDateParams();
  if (!dateParams) { alert('Preencha as datas de início e fim.'); return; }

  const valid = ACCOUNTS.filter(a => a.id && !a.card);
  const wrap  = document.getElementById('rel-units-wrap');
  wrap.innerHTML = '';
  const networkAdsData = [];

  const pw = document.getElementById('rel-prog-wrap');
  const pf = document.getElementById('rel-prog-fill');
  const pl = document.getElementById('rel-prog-lbl');
  pw.classList.add('show');
  pf.style.width = '0%';

  let totalSpend = 0, totalReach = 0, totalImpr = 0, totalClicks = 0, totalPurch = 0, totalConvVal = 0;
  let done = 0;
  const relErrors = [];
  const errEl = document.getElementById('rel-err-banner');
  if (errEl) { errEl.style.display = 'none'; errEl.innerHTML = ''; }

  for (let i = 0; i < valid.length; i += 3) {
    await Promise.all(valid.slice(i, i + 3).map(async acc => {
      const placeholder = document.createElement('div');
      placeholder.className = 'rel-unit-card';
      placeholder.innerHTML = `<div class="rel-card-header"><div class="rel-card-icon-wrap">🍦</div><div class="rel-card-title">${acc.name.replace(/berry's\s*/i,'').trim().toUpperCase()}</div></div>
        <div class="rel-unit-loading"><span class="spin"></span> Carregando…</div>`;
      wrap.appendChild(placeholder);

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
      totalImpr   += ins.impressions || 0;
      totalClicks += ins.clicks || 0;
      campaigns.forEach(c => {
        const ci = c.insights?.data?.[0];
        if (!ci) return;
        totalPurch   += getAct(ci.actions, A_PURCHASE);
        totalConvVal += getAct(ci.action_values, A_PURCHASE);
      });

      const card = renderRelUnit(acc, ins, topAds, campaigns, hasData, unitErr);
      wrap.replaceChild(card, placeholder);

      done++;
      pf.style.width = (done / valid.length * 100) + '%';
      pl.textContent = `${done} / ${valid.length} unidades…`;

      document.getElementById('rel-total-spend').textContent   = fmt(totalSpend);
      document.getElementById('rel-total-reach').textContent   = fmtN(totalReach);
      document.getElementById('rel-total-impr').textContent    = fmtN(totalImpr);
      document.getElementById('rel-total-clicks').textContent  = fmtN(totalClicks);
      document.getElementById('rel-total-purch').textContent   = fmtN(Math.round(totalPurch));
      document.getElementById('rel-total-convval').textContent = fmt(totalConvVal);
    }));
  }

  pw.classList.remove('show');

  // agrupa unidades com o mesmo mix de objetivos; dentro do grupo, maior investimento primeiro
  const cards = [...wrap.querySelectorAll('.rel-unit-card')];
  cards.sort((a, b) => {
    const na = +(b.dataset.nobj||0) - (+(a.dataset.nobj||0));   // mais objetivos primeiro
    if (na) return na;
    const sig = (a.dataset.sig||'').localeCompare(b.dataset.sig||''); // mesmo mix junto
    if (sig) return sig;
    return (+(b.dataset.spend||0)) - (+(a.dataset.spend||0));   // maior investimento primeiro
  });
  cards.forEach(c => wrap.appendChild(c));

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

// bannerzinho lateral com o nome de cada unidade, estilo selo do app do
// iFood (ícone vermelho arredondado + nome em caixa alta) — estático, não
// depende do fetch do relatório, só da lista de contas
function renderNetworkUnitsPanel() {
  const wrap = document.getElementById('rel-network-units-list');
  if (!wrap) return;
  const units = ACCOUNTS.filter(a => a.id && !a.card);
  wrap.innerHTML = units.map(acc => {
    const displayName = acc.name.replace(/berry's\s*/i, '').trim();
    const initials = displayName.slice(0, 2).toUpperCase();
    return `<div class="rel-network-unit-badge" title="${displayName}">
      <div class="u-ico">${initials}</div>
      <div class="u-name">${displayName}</div>
    </div>`;
  }).join('');
}

function init_relatorio() {
  // a aba só carrega dados quando o usuário clica em "Atualizar" (relFetch)
  renderNetworkUnitsPanel();
}
