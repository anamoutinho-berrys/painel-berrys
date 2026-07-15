// ============================================================================
// tabs/brasil.js — lógica exclusiva da aba "Dash Franqueadora" (tempo real, mas
// SÓ para as duas contas nacionais em BR_ACCOUNTS, fora da lista ACCOUNTS
// das unidades).
//
// IMPORTANTE: esta aba é INDEPENDENTE da aba "Dash Unidades"
// (tabs/relatorio.js). A renderização do card, a agregação por objetivo e
// os rótulos vivem AQUI, em cópias próprias (funções br*) — personalize à
// vontade sem medo de afetar o dash das unidades, e vice-versa.
// Só ficam compartilhados (assets/objectives.js e core.js) os utilitários
// genéricos: apiFetch, fmt/fmtN/fmtPct, getAct/A_*, OBJ_GROUPS,
// classifyObjective/classifyCampaigns, tile/mrow e os fetchers
// fetchRelInsights/fetchRelCampaigns/fetchRelTopAds.
// ============================================================================

const BR_ACCOUNTS = [
  {
    name: "Berry's Brasil Principal",
    id: "1835196527242936",
    mgr: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1835196527242936&business_id=102953152620437",
  },
  {
    name: "Bernardo Berry's",
    id: "648499830908887",
    mgr: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=648499830908887&business_id=102953152620437",
  },
];

// cadastros do pixel (complete_registration) contam como lead NESTA aba —
// a conta do Bernardo acompanha essa coluna no Gerenciador
const BR_A_LEAD = ['lead','onsite_conversion.lead_grouped','offsite_conversion.fb_pixel_complete_registration','complete_registration'];

let brAutoTimer = null;

function onBrDateChange() {
  const v = document.getElementById('br-preset').value;
  document.getElementById('br-custom-dt').classList.toggle('show', v === 'custom');
  if (v !== 'custom') brFetch();
}

function toggleBrAutoRefresh() {
  const on = document.getElementById('br-autorefresh').checked;
  if (on) { brFetch(); brAutoTimer = setInterval(brFetch, 5 * 60 * 1000); }
  else { clearInterval(brAutoTimer); brAutoTimer = null; }
}

function getBrDateParams() {
  const p = document.getElementById('br-preset').value;
  if (p === 'custom') {
    const s = document.getElementById('br-since').value;
    const u = document.getElementById('br-until').value;
    if (!s || !u) return null;
    return { time_range: JSON.stringify({ since: s, until: u }) };
  }
  return { preset: p };
}

/* ── agregação por objetivo (cópia local — difere da compartilhada por
      contar cadastros/complete_registration como lead via BR_A_LEAD) ── */
function brAggregateByObjective(campaigns) {
  const groups = {};
  campaigns.forEach(c => {
    const ins = c.insights?.data?.[0];
    if (!ins || !(parseFloat(ins.spend) > 0)) return;
    const g = classifyObjective(c);
    if (!groups[g]) groups[g] = {
      spend:0, impressions:0, reach:0, clicks:0, linkClicks:0,
      purchases:0, convValue:0, lpv:0, engagement:0, follows:0,
      leads:0, msgs:0, thruplays:0, freqW:0, campaigns:[]
    };
    const gr = groups[g];
    const sp = parseFloat(ins.spend) || 0;
    gr.spend       += sp;
    gr.impressions += parseInt(ins.impressions) || 0;
    gr.reach       += parseInt(ins.reach) || 0;
    gr.clicks      += parseInt(ins.clicks) || 0;
    gr.linkClicks  += parseInt(ins.inline_link_clicks) || 0;
    gr.purchases   += getAct(ins.actions, A_PURCHASE);
    gr.convValue   += getAct(ins.action_values, A_PURCHASE);
    gr.lpv         += getAct(ins.actions, A_LPV);
    gr.engagement  += getAct(ins.actions, A_ENG);
    gr.follows     += getAct(ins.actions, A_FOLLOW);
    gr.leads       += getAct(ins.actions, BR_A_LEAD);
    gr.msgs        += getAct(ins.actions, A_MSG);
    gr.freqW       += (parseFloat(ins.frequency) || 0) * sp;
    gr.campaigns.push(c);
  });
  Object.values(groups).forEach(g => {
    g.frequency = g.spend > 0 ? g.freqW / g.spend : 0;
    g.cpm = g.impressions > 0 ? g.spend / g.impressions * 1000 : null;
    g.ctr = g.impressions > 0 ? g.clicks / g.impressions * 100 : null;
    g.cpc = g.clicks > 0 ? g.spend / g.clicks : null;
    g.costPerPurchase = g.purchases > 0 ? g.spend / g.purchases : null;
    g.roas = g.spend > 0 && g.convValue > 0 ? g.convValue / g.spend : null;
    g.costPerLpv = g.lpv > 0 ? g.spend / g.lpv : null;
    g.costPerEng = g.engagement > 0 ? g.spend / g.engagement : null;
    g.costPerFollow = g.follows > 0 ? g.spend / g.follows : null;
    g.costPerLead = g.leads > 0 ? g.spend / g.leads : null;
    g.costPerReach = g.reach > 0 ? g.spend / g.reach * 1000 : null;
  });
  return groups;
}

/* ── bloco de métricas conforme o objetivo (cópia local) ── */
function brRenderObjBlock(key, g) {
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
      ${tile('📋','Cadastros / Leads', fmtN(g.leads), true)}
      ${tile('🏷️','Custo por cadastro', g.costPerLead!=null?fmt(g.costPerLead):'—')}
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

function brBuildResumo(displayName, groups) {
  const parts = [];
  const v = groups.vendas, a = groups.alcance, t = groups.trafego, e = groups.engaj, l = groups.leads;
  if (v && v.purchases > 0) {
    parts.push(`As campanhas de vendas geraram <strong>${fmtN(v.purchases)} compra${v.purchases>1?'s':''}</strong>` +
      (v.roas!=null ? `, com ROAS de <strong>${v.roas.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong> — para cada R$ 1,00 investido, retornaram ${fmt(v.roas)} em valor de conversão` : '') + '.');
  } else if (v) {
    parts.push('As campanhas de vendas ainda não registraram compras no período.');
  }
  if (a) parts.push(`No alcance, a conta impactou <strong>${fmtN(a.reach)} pessoas</strong> a um custo de ${a.costPerReach!=null?fmt(a.costPerReach):'—'} por 1.000 alcançadas.`);
  if (t && (t.linkClicks||t.clicks) > 0) parts.push(`O tráfego gerou <strong>${fmtN(t.linkClicks||t.clicks)} cliques</strong>${t.cpc!=null?` a ${fmt(t.cpc)} por clique`:''}.`);
  if (e && e.follows > 0) parts.push(`Engajamento somou <strong>${fmtN(e.follows)} novos seguidores</strong>${e.costPerFollow!=null?` a ${fmt(e.costPerFollow)} por seguidor`:''}.`);
  if (l && l.leads > 0) parts.push(`As campanhas de cadastro geraram <strong>${fmtN(l.leads)} registro${l.leads>1?'s':''}</strong>${l.costPerLead!=null?` a ${fmt(l.costPerLead)} por cadastro`:''}.`);
  if (!parts.length) return '';
  return `<div class="rel-resumo"><span class="r-chip">Resumo:</span><p>${parts.join(' ')}</p></div>`;
}

// plataforma(s) de delivery em que a conta está anunciando no período (cópia local)
function brDetectDeliveryPlatforms(campaigns) {
  const active = campaigns.filter(c => parseFloat(c.insights?.data?.[0]?.spend || 0) > 0);
  const found = new Map();
  active.forEach(c => {
    const p = deliveryPlatformFor(c);
    if (p && !found.has(p.key)) found.set(p.key, p);
  });
  return [...found.values()].map(p => ({ key: p.key, icon: p.icon, label: p.name, color: p.color }));
}

function brRenderUnit(acc, insights, topAds, campaigns, hasData, unitErr) {
  const card = document.createElement('div');
  card.className = 'rel-unit-card';
  const displayName = acc.name.replace(/berry's\s*/i, '').trim().toUpperCase();
  const groups = brAggregateByObjective(campaigns);
  const groupKeys = Object.keys(groups).sort((x,y) => OBJ_GROUPS[x].order - OBJ_GROUPS[y].order);

  const objBadges = groupKeys.length
    ? `<div class="rel-obj-badges">${groupKeys.map((k,i) =>
        `<span class="rel-obj-badge${i>0?' alt':''}">${OBJ_GROUPS[k].icon} ${OBJ_GROUPS[k].label}</span>`).join('')}</div>`
    : '';

  const deliveryPlatforms = brDetectDeliveryPlatforms(campaigns);
  const deliveryBadges = deliveryPlatforms.length
    ? `<div class="rel-delivery-badges">${deliveryPlatforms.map(p =>
        `<span class="rel-delivery-badge" style="background:${p.color};">${p.icon} ${p.label}</span>`).join('')}</div>`
    : '';

  const headKpis = hasData ? `<div class="rel-head-kpis">
    <div class="rel-head-kpi"><span class="k-ico">💰</span><span><div class="k-lbl">Investimento total</div><div class="k-val">${fmt(insights.spend)}</div></span></div>
    <div class="rel-head-kpi"><span class="k-ico">👥</span><span><div class="k-lbl">Alcance da conta</div><div class="k-val">${fmtN(insights.reach)}</div></span></div>
  </div>` : '';

  const header = `<div class="rel-card-header">
    <div class="rel-card-icon-wrap">🇧🇷</div>
    <div class="rel-card-title">${displayName}</div>
    ${acc.mgr ? `<a class="rel-card-mgr" href="${acc.mgr}" target="_blank">↗ Gerenciador</a>` : ''}
    ${deliveryBadges}
    ${headKpis}
    ${objBadges}
  </div>`;

  card.dataset.spend = insights.spend || 0;

  if (!hasData) {
    const msg = unitErr
      ? `⚠️ Erro ao consultar a API: <span style="color:#c0392b;">${unitErr}</span>`
      : 'Nenhuma métrica encontrada para o período selecionado.';
    card.innerHTML = header + `<div class="rel-nodata">${msg}</div>`;
    return card;
  }

  // blocos por objetivo — cada um só com as métricas que fazem sentido
  let objBlocks = groupKeys.map(k => brRenderObjBlock(k, groups[k])).join('');
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

  const resumo = brBuildResumo(displayName, groups);

  // só entram temas de campanhas que de fato tiveram gasto no período
  const spentCampaigns = campaigns.filter(c => parseFloat(c.insights?.data?.[0]?.spend || 0) > 0);
  const themes = classifyCampaigns(spentCampaigns);
  const themePills = themes.length
    ? themes.map(t => `<span class="rel-theme-pill" style="color:${t.color};background:${t.bg};">${t.label}</span>`).join('')
    : `<span style="font-size:11px;color:#b8d2e4;font-weight:800;">Nenhuma campanha com investimento neste período</span>`;
  const themesBlock = `<div class="rel-themes-section">
    <div class="rel-section-lbl">O que rodou nesta conta no período (${spentCampaigns.length} campanha${spentCampaigns.length===1?'':'s'} com investimento)</div>
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
    const reg = getAct(ins.actions, BR_A_LEAD);
    return `<div class="rel-ad-item">
      <div class="rel-ad-rank ${rankCls[i]}">${i+1}</div>
      ${thumb ? `<img class="rel-ad-thumb" src="${thumb}" onerror="this.style.display='none'" loading="lazy"/>` : `<div class="rel-ad-thumb"></div>`}
      <div class="rel-ad-info">
        <div class="rel-ad-name">${ad.name}</div>
        <div class="rel-ad-metrics">${fmt(sp)} · ${fmtN(rch)} alcance · ${fmtN(clk)} cliques${pur>0?` · 🛍️ ${fmtN(pur)} compras`:''}${reg>0?` · 📋 ${fmtN(reg)} cadastros`:''}</div>
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

async function brFetch() {
  const dateParams = getBrDateParams();
  if (!dateParams) { alert('Preencha as datas de início e fim.'); return; }

  const wrap = document.getElementById('br-units-wrap');
  wrap.innerHTML = '';

  const pw = document.getElementById('br-prog-wrap');
  const pf = document.getElementById('br-prog-fill');
  const pl = document.getElementById('br-prog-lbl');
  pw.classList.add('show');
  pf.style.width = '0%';

  let totalSpend = 0, totalReach = 0, totalImpr = 0, totalClicks = 0, totalPurch = 0, totalLeads = 0;
  let done = 0;
  const brErrors = [];
  const errEl = document.getElementById('br-err-banner');
  if (errEl) { errEl.style.display = 'none'; errEl.innerHTML = ''; }

  await Promise.all(BR_ACCOUNTS.map(async acc => {
    const placeholder = document.createElement('div');
    placeholder.className = 'rel-unit-card';
    placeholder.innerHTML = `<div class="rel-card-header"><div class="rel-card-icon-wrap">🇧🇷</div><div class="rel-card-title">${acc.name.toUpperCase()}</div></div>
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

    const hasData = ins.spend > 0 || ins.impressions > 0;
    if (unitErr) brErrors.push(acc.name + ': ' + unitErr);
    totalSpend  += ins.spend  || 0;
    totalReach  += ins.reach  || 0;
    totalImpr   += ins.impressions || 0;
    totalClicks += ins.clicks || 0;
    campaigns.forEach(c => {
      const ci = c.insights?.data?.[0];
      if (!ci) return;
      totalPurch += getAct(ci.actions, A_PURCHASE);
      totalLeads += getAct(ci.actions, BR_A_LEAD);
    });

    const card = brRenderUnit(acc, ins, topAds, campaigns, hasData, unitErr);
    wrap.replaceChild(card, placeholder);

    done++;
    pf.style.width = (done / BR_ACCOUNTS.length * 100) + '%';
    pl.textContent = `${done} / ${BR_ACCOUNTS.length} contas…`;

    document.getElementById('br-total-spend').textContent  = fmt(totalSpend);
    document.getElementById('br-total-reach').textContent  = fmtN(totalReach);
    document.getElementById('br-total-impr').textContent   = fmtN(totalImpr);
    document.getElementById('br-total-clicks').textContent = fmtN(totalClicks);
    document.getElementById('br-total-purch').textContent  = fmtN(Math.round(totalPurch));
    document.getElementById('br-total-leads').textContent  = fmtN(Math.round(totalLeads));
  }));

  pw.classList.remove('show');

  // maior investimento primeiro
  const cards = [...wrap.querySelectorAll('.rel-unit-card')];
  cards.sort((a, b) => (+(b.dataset.spend||0)) - (+(a.dataset.spend||0)));
  cards.forEach(c => wrap.appendChild(c));

  if (brErrors.length && errEl) {
    errEl.style.display = 'block';
    errEl.innerHTML = '<strong>⚠️ ' + brErrors.length + ' conta(s) com erro na API</strong> — abra o console (F12) para detalhes.<br><span style="font-weight:600;font-size:11px;">' + brErrors.join(' · ') + '</span>';
  }
  const sel = document.getElementById('br-preset');
  document.getElementById('br-period-sub').textContent = sel.options[sel.selectedIndex].text.toLowerCase();
  document.getElementById('br-last-up').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
  document.getElementById('br-date-display').textContent = new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
}

function init_brasil() {
  // são só duas contas, então já carrega direto ao abrir a aba
  brFetch();
}
