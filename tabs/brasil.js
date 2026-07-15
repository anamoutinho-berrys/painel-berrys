// ============================================================================
// tabs/brasil.js — lógica exclusiva da aba "Dash Brasil" (tempo real, mas
// SÓ para as duas contas nacionais abaixo, fora da lista ACCOUNTS das
// unidades). Depende de: core.js (apiFetch, fmt/fmtN) e objectives.js
// (fetchRelInsights/Campaigns/TopAds, renderRelUnit, getAct, A_*).
// A renderização do card é a MESMA da aba "Dash - Tempo Real"
// (renderRelUnit, em assets/objectives.js) — mudou lá, mudou aqui.
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
      totalLeads += getAct(ci.actions, A_LEAD);
    });

    const card = renderRelUnit(acc, ins, topAds, campaigns, hasData, unitErr);
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
