// ============================================================================
// tabs/acompanhamento.js — lógica exclusiva da aba "Acompanhamento".
// Depende de: core.js (ACCOUNTS, fetchAccountData, fmt/fmtN, paintTodayDate)
// ============================================================================

async function dashFetch() {
  const preset = document.getElementById('dash-preset').value;
  const valid  = ACCOUNTS.filter(a=>a.id&&!a.card);
  document.getElementById('dash-units').innerHTML='<div style="padding:30px;text-align:center;color:#aaa;font-weight:700;grid-column:1/-1;"><span class="spin"></span> Carregando métricas…</div>';
  const results=[];
  for (let i=0;i<valid.length;i+=4) {
    const chunk=await Promise.all(valid.slice(i,i+4).map(async acc=>{
      const d=await fetchAccountData(acc.id,preset,['insights']); return{...acc,...d};
    }));
    results.push(...chunk);
  }
  let ti=0,tr2=0,tc=0,cpmSum=0,cpmCount=0;
  results.forEach(r=>{ ti+=(r.impressions||0); tr2+=(r.reach||0); tc+=(r.clicks||0); if(r.cpm){cpmSum+=r.cpm;cpmCount++;} });
  document.getElementById('d-impr').textContent   = fmtN(ti);
  document.getElementById('d-reach').textContent  = fmtN(tr2);
  document.getElementById('d-clicks').textContent = fmtN(tc);
  document.getElementById('d-cpm').textContent    = cpmCount ? fmt(cpmSum/cpmCount) : '—';
  const grid=document.getElementById('dash-units'); grid.innerHTML='';
  results.forEach(r=>{
    if(!r.impressions&&!r.spend) return;
    const card=document.createElement('div'); card.className='unit-card';
    card.innerHTML=`<div class="u-name">${r.name}</div>
      <div class="unit-metrics">
        <div class="u-metric"><div class="u-lbl">Investido</div><div class="u-val spend">${fmt(r.spend)}</div></div>
        <div class="u-metric"><div class="u-lbl">Impressões</div><div class="u-val">${fmtN(r.impressions)}</div></div>
        <div class="u-metric"><div class="u-lbl">Cliques</div><div class="u-val">${fmtN(r.clicks)}</div></div>
        <div class="u-metric"><div class="u-lbl">CPM</div><div class="u-val">${fmt(r.cpm)}</div></div>
        <div class="u-metric"><div class="u-lbl">CTR</div><div class="u-val">${fmtPct(r.ctr)}</div></div>
        <div class="u-metric"><div class="u-lbl">CPC</div><div class="u-val green">${fmt(r.cpc)}</div></div>
      </div>`;
    grid.appendChild(card);
  });
  if(!grid.children.length) grid.innerHTML='<div style="padding:40px;text-align:center;color:#bbb;font-weight:700;grid-column:1/-1;">Nenhuma métrica encontrada para o período.</div>';
  document.getElementById('dash-last-up').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR');
}

function init_acompanhamento() {
  paintTodayDate('dash-date');
}

