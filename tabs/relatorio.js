// ============================================================================
// tabs/relatorio.js — lógica exclusiva da aba "Relatório Real-Time".
// Depende de: core.js (ACCOUNTS, apiFetch, fmt/fmtN, paintTodayDate) e
// objectives.js (getAct, A_*, classifyObjective, classifyCampaigns,
// aggregateByObjective, fetchRelInsights/Campaigns/TopAds, tile/mrow,
// renderObjBlock/renderRelUnit — o card de unidade é compartilhado com a
// aba "Dash Brasil"). Qualquer mudança na classificação de objetivo/campanha
// ou no card de unidade deve ser feita em objectives.js, não aqui.
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

/* renderObjBlock, buildResumo, unitIcon, detectDeliveryPlatforms e
   renderRelUnit moraram aqui até serem compartilhados com a aba
   "Dash Brasil" — hoje vivem em assets/objectives.js. */


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
    if (result.length >= 10) break;
  }
  return result;
}

// nome curto de exibição de uma unidade (sem o prefixo "Berry's")
function unitDisplayName(accName) {
  return accName.replace(/berry's\s*/i, '').trim();
}

// linha de métricas do card de criativo da rede. Criativo de campanha de
// vendas (tem valor de conversão rastreado) mostra ROAS e valor em compras
// no lugar de cliques; os demais mantêm cliques.
function netCreativeMetrics(c) {
  const base = `${fmt(c.spend)} · ${fmtN(c.reach)} alcance`;
  if (c.convValue > 0) {
    const roas = c.spend > 0 ? c.convValue / c.spend : 0;
    const roasTxt = roas > 0 ? ` · ROAS ${roas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
    return `${base}${roasTxt} · ${fmt(c.convValue)} em compras${c.purchases > 0 ? ` · 🛍️ ${fmtN(c.purchases)} compras` : ''}`;
  }
  return `${base} · ${fmtN(c.clicks)} cliques${c.purchases > 0 ? ` · 🛍️ ${fmtN(c.purchases)} compras` : ''}`;
}

function renderNetworkTopCreatives(list) {
  const wrap = document.getElementById('rel-top-creatives');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = `<div class="rel-nodata">Nenhum criativo se destacou em mais de uma unidade no período.</div>`;
    return;
  }
  const rankCls = ['r1', 'r2', 'r3'];
  wrap.innerHTML = list.map((c, i) => {
    // nome de cada unidade em que ESTE criativo específico foi destaque,
    // estilo selo do app do iFood — em cima do card, não uma lista genérica
    const unitBadges = [...c.units].sort().map(u => {
      const name = unitDisplayName(u);
      return `<span class="rel-net-creative-unit-badge" title="${name}"><span class="u-ico">${name.slice(0, 2).toUpperCase()}</span>${name}</span>`;
    }).join('');
    return `
    <div class="rel-net-creative-card">
      <div class="rel-net-creative-units-row">${unitBadges}</div>
      <div class="rel-net-creative-thumb-wrap">
        <div class="rel-net-creative-rank ${rankCls[i] || 'rn'}">${i + 1}</div>
        ${c.thumb ? `<img class="rel-net-creative-thumb" src="${c.thumb}" onerror="this.style.display='none'" loading="lazy"/>` : ''}
      </div>
      <div class="rel-net-creative-body">
        <div class="rel-net-creative-name" title="${c.name}">${c.name}</div>
        <div class="rel-net-creative-metrics">${netCreativeMetrics(c)}</div>
      </div>
    </div>
  `;
  }).join('');
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

function init_relatorio() {
  // a aba só carrega dados quando o usuário clica em "Atualizar" (relFetch)
}
