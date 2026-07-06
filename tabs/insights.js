// ============================================================================
// tabs/insights.js — lógica exclusiva da aba "Insights".
// Depende de: core.js (ACCOUNTS, fmt/fmtN, getAct) e objectives.js
// (classifyObjective, aggregateByObjective, classifyCampaigns, fetchRelCampaigns,
// fetchRelTopAds). Qualquer mudança na classificação de objetivo/campanha deve
// ser feita em objectives.js, não aqui.
// ============================================================================

function insBars(items, fmtVal, invert) {
  // items: [{label, value, tag}] — invert=true: menor valor = barra maior (custos)
  if (!items.length) return '<div class="ins-loading">Sem dados no período.</div>';
  const vals = items.map(i => i.value);
  const max = Math.max(...vals), min = Math.min(...vals);
  return '<div class="insight-bar">' + items.map(i => {
    let w;
    if (max === min) w = 100;
    else w = invert ? (min / i.value) * 100 : (i.value / max) * 100;
    w = Math.max(8, Math.round(w));
    return `<div class="i-bar-item">
      <span class="i-bar-label" title="${i.label}">${i.label}</span>
      <div class="i-bar-track"><div class="i-bar-fill" style="width:${w}%"></div></div>
      <span class="i-bar-val">${fmtVal(i.value)}</span>
    </div>`;
  }).join('') + '</div>';
}

function insCard(id, html, verdict) {
  const el = document.getElementById(id);
  if (!el) return;
  const cat = el.querySelector('.i-cat').outerHTML;
  const h4  = el.querySelector('h4').outerHTML;
  el.innerHTML = cat + h4 + html + (verdict ? `<div class="i-verdict">💡 ${verdict}</div>` : '');
}

const insShort = n => n.replace(/berry's\s*/i,'').trim();
const fmt2 = v => v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

async function insightsFetch() {
  const preset = document.getElementById('ins-preset').value;
  const dateParams = { preset };
  const valid = ACCOUNTS.filter(a => a.id && !a.card);
  ['ins-best-ads','ins-cpc','ins-reach','ins-eng','ins-sales','ins-reads'].forEach(id => {
    const el = document.getElementById(id);
    const cat = el.querySelector('.i-cat').outerHTML, h4 = el.querySelector('h4').outerHTML;
    el.innerHTML = cat + h4 + '<div class="ins-loading"><span class="spin"></span> Analisando…</div>';
  });
  document.getElementById('ins-last-up').textContent = 'Analisando '+valid.length+' contas…';

  // coleta: campanhas (por objetivo) + top ads de cada unidade
  const units = [];
  for (let i = 0; i < valid.length; i += 4) {
    await Promise.all(valid.slice(i, i+4).map(async acc => {
      try {
        const [campaigns, ads] = await Promise.all([
          fetchRelCampaigns(acc.id, dateParams),
          fetchRelTopAds(acc.id, dateParams)
        ]);
        units.push({ acc, name: insShort(acc.name), groups: aggregateByObjective(campaigns), ads });
      } catch(e) { console.warn('[insights]', acc.name, e.message); }
    }));
  }

  /* 1 ─ Melhores anúncios do grupo (eficiência: cliques por real; desempate por alcance) */
  const allAds = [];
  units.forEach(u => u.ads.forEach(ad => {
    const d = ad.insights?.data?.[0]; if (!d) return;
    const sp = parseFloat(d.spend)||0, clk = parseInt(d.clicks)||0, rch = parseInt(d.reach)||0;
    if (sp < 5) return; // ignora gasto irrisório: distorce a eficiência
    const pur = getAct(d.actions, A_PURCHASE);
    allAds.push({ unit: u.name, name: ad.name, thumb: ad.creative?.thumbnail_url, sp, clk, rch, pur, eff: clk/sp });
  }));
  allAds.sort((a,b) => b.eff - a.eff);
  const top5 = allAds.slice(0,5);
  const rankCls = ['g','s','b','',''];
  insCard('ins-best-ads',
    top5.length ? top5.map((a,i) => `<div class="ins-ad-row">
      <div class="ins-ad-rank ${rankCls[i]}">${i+1}</div>
      ${a.thumb?`<img class="ins-ad-thumb" src="${a.thumb}" onerror="this.style.display='none'" loading="lazy"/>`:'<div class="ins-ad-thumb"></div>'}
      <div style="flex:1;min-width:0;">
        <div class="ins-ad-nm">${a.name}<span class="ins-unit-tag">${a.unit}</span></div>
        <div class="ins-ad-mt">${fmt(a.sp)} · ${fmtN(a.rch)} alcance · ${fmtN(a.clk)} cliques (${a.eff.toFixed(1)}/R$)${a.pur>0?` · 🛍️ ${fmtN(a.pur)} compras`:''}</div>
      </div>
    </div>`).join('') : '<div class="ins-loading">Nenhum anúncio com gasto relevante.</div>',
    top5.length ? `<strong>${top5[0].name}</strong> (${top5[0].unit}) foi o mais eficiente: ${top5[0].eff.toFixed(1)} cliques por real investido. Vale replicar o criativo nas demais unidades.` : null);

  /* 2 ─ CPC (tráfego + vendas, onde clique é resultado-meio) */
  const cpcItems = units.map(u => {
    let sp=0, clk=0;
    ['trafego','vendas'].forEach(k => { const g=u.groups[k]; if (g){ sp+=g.spend; clk+=g.clicks; } });
    return clk >= 30 ? { label: u.name, value: sp/clk } : null; // mínimo p/ significância
  }).filter(Boolean).sort((a,b) => a.value - b.value).slice(0,8);
  const cpcAvg = cpcItems.length ? cpcItems.reduce((s,i)=>s+i.value,0)/cpcItems.length : 0;
  insCard('ins-cpc', insBars(cpcItems, v=>'R$ '+fmt2(v), true),
    cpcItems.length ? `<strong>${cpcItems[0].label}</strong> tem o clique mais barato (R$ ${fmt2(cpcItems[0].value)}, ${Math.round((1-cpcItems[0].value/cpcAvg)*100)}% abaixo da média do grupo de R$ ${fmt2(cpcAvg)}). Estudar os criativos e públicos dela como referência.` : null);

  /* 3 ─ Custo por 1.000 alcançadas (campanhas de alcance) + alerta de frequência */
  const reachItems = units.map(u => {
    const g = u.groups.alcance;
    return g && g.reach > 1000 ? { label: u.name, value: g.costPerReach, freq: g.frequency } : null;
  }).filter(Boolean).sort((a,b) => a.value - b.value).slice(0,8);
  const satur = reachItems.filter(i => i.freq > 2);
  let reachVerdict = null;
  if (reachItems.length) {
    reachVerdict = `<strong>${reachItems[0].label}</strong> alcança 1.000 pessoas por R$ ${fmt2(reachItems[0].value)} — a distribuição mais barata do grupo.`;
    if (satur.length) reachVerdict += ` ⚠️ Frequência acima de 2 em <strong>${satur.map(i=>i.label).join(', ')}</strong>: público começando a saturar, considerar renovar criativos ou ampliar público.`;
  }
  insCard('ins-reach', insBars(reachItems, v=>'R$ '+fmt2(v), true), reachVerdict);

  /* 4 ─ Engajamento: custo por engajamento; seguidores quando existirem */
  const engItems = units.map(u => {
    const g = u.groups.engaj;
    return g && g.engagement > 100 ? { label: u.name, value: g.costPerEng, follows: g.follows, cpf: g.costPerFollow } : null;
  }).filter(Boolean).sort((a,b) => a.value - b.value).slice(0,8);
  const withFollows = engItems.filter(i => i.follows > 0).sort((a,b) => a.cpf - b.cpf);
  let engVerdict = null;
  if (engItems.length) {
    engVerdict = `<strong>${engItems[0].label}</strong> engaja ao menor custo (R$ ${fmt2(engItems[0].value)} por engajamento).`;
    if (withFollows.length) engVerdict += ` Em seguidores, <strong>${withFollows[0].label}</strong> lidera: ${fmtN(withFollows[0].follows)} novos a R$ ${fmt2(withFollows[0].cpf)} cada.`;
  }
  insCard('ins-eng', insBars(engItems, v=>'R$ '+fmt2(v), true), engVerdict);

  /* 5 ─ Vendas: ROAS por unidade (barra maior = melhor) */
  const salesItems = units.map(u => {
    const g = u.groups.vendas;
    return g && g.purchases > 0 ? { label: u.name, value: g.roas||0, purchases: g.purchases, cpp: g.costPerPurchase } : null;
  }).filter(Boolean).sort((a,b) => b.value - a.value).slice(0,8);
  const noSales = units.filter(u => u.groups.vendas && !(u.groups.vendas.purchases > 0)).map(u => u.name);
  let salesVerdict = null;
  if (salesItems.length) {
    const t = salesItems[0];
    salesVerdict = `<strong>${t.label}</strong> lidera com ROAS ${fmt2(t.value)} (${fmtN(t.purchases)} compras a R$ ${fmt2(t.cpp)} cada) — para cada R$ 1,00 investido, voltaram R$ ${fmt2(t.value)}.`;
    if (noSales.length) salesVerdict += ` ⚠️ Campanhas de vendas sem compras registradas em: <strong>${noSales.join(', ')}</strong> — verificar pixel/rastreamento e oferta.`;
  } else if (noSales.length) {
    salesVerdict = `⚠️ Nenhuma compra registrada nas campanhas de vendas de <strong>${noSales.join(', ')}</strong> no período — verificar rastreamento.`;
  }
  insCard('ins-sales', insBars(salesItems, v=>'ROAS '+fmt2(v), false), salesVerdict);

  /* 6 ─ Leituras automáticas (regras sobre o consolidado) */
  const reads = [];
  const tot = { spend:0, reach:0, clicks:0, impr:0, purchases:0, convValue:0 };
  units.forEach(u => Object.values(u.groups).forEach(g => {
    tot.spend+=g.spend; tot.reach+=g.reach; tot.clicks+=g.clicks; tot.impr+=g.impressions;
    tot.purchases+=g.purchases; tot.convValue+=g.convValue;
  }));
  if (tot.spend > 0) reads.push(`O grupo investiu <strong>${fmt(tot.spend)}</strong> no período, alcançando <strong>${fmtN(tot.reach)} pessoas</strong> e gerando <strong>${fmtN(tot.clicks)} cliques</strong>${tot.purchases>0?` e <strong>${fmtN(Math.round(tot.purchases))} compras</strong> (${fmt(tot.convValue)} em valor de conversão, ROAS geral ${fmt2(tot.convValue/tot.spend)})`:''}.`);
  const ctrs = units.map(u => {
    let clk=0, imp=0; Object.values(u.groups).forEach(g=>{clk+=g.clicks;imp+=g.impressions;});
    return imp>5000 ? { name:u.name, ctr: clk/imp*100 } : null;
  }).filter(Boolean);
  if (ctrs.length >= 2) {
    const avg = ctrs.reduce((s,c)=>s+c.ctr,0)/ctrs.length;
    const best = [...ctrs].sort((a,b)=>b.ctr-a.ctr)[0];
    const worst = [...ctrs].sort((a,b)=>a.ctr-b.ctr)[0];
    reads.push(`CTR médio do grupo: <strong>${fmt2(avg)}%</strong>. Melhor criativo/público em <strong>${best.name}</strong> (${fmt2(best.ctr)}%); <strong>${worst.name}</strong> está em ${fmt2(worst.ctr)}% — vale testar os criativos vencedores de ${best.name} lá.`);
  }
  const idle = valid.filter(a => !units.find(u => u.acc.id === a.id && Object.keys(u.groups).length)).map(a => insShort(a.name));
  if (idle.length) reads.push(`Contas sem campanhas com investimento no período: <strong>${idle.join(', ')}</strong>.`);
  const themesAll = {};
  units.forEach(u => Object.values(u.groups).forEach(g => classifyCampaigns(g.campaigns).forEach(t => {
    themesAll[t.label] = (themesAll[t.label]||0) + g.spend;
  })));
  const topThemes = Object.entries(themesAll).sort((a,b)=>b[1]-a[1]).slice(0,3);
  if (topThemes.length) reads.push(`Temas com maior investimento: ${topThemes.map(([t,v])=>`<strong>${t}</strong> (${fmt(v)})`).join(', ')}.`);
  insCard('ins-reads', reads.length ? '<ul class="ins-list">'+reads.map(r=>'<li>'+r+'</li>').join('')+'</ul>' : '<div class="ins-loading">Sem dados suficientes.</div>', null);

  const sel = document.getElementById('ins-preset');
  document.getElementById('ins-last-up').textContent =
    'Análise de "'+sel.options[sel.selectedIndex].text.toLowerCase()+'" · '+units.length+' contas · '+new Date().toLocaleTimeString('pt-BR');
}

function init_insights() {
  // a aba só carrega dados quando o usuário clica em "Analisar" (insightsFetch)
}
