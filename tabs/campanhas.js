// ============================================================================
// tabs/campanhas.js — lógica exclusiva da aba "Campanhas".
// Depende de: core.js (ACCOUNTS, fetchAccountData, fmt/fmtN)
// ============================================================================

async function campFetch() {
  const preset=document.getElementById('camp-preset').value;
  const valid=ACCOUNTS.filter(a=>a.id&&!a.card);
  document.getElementById('camp-body').innerHTML='<tr><td colspan="9" style="text-align:center;padding:30px;color:#aaa;"><span class="spin"></span> Carregando campanhas…</td></tr>';
  let allCamps=[],totalSpend=0,totalImpr=0,totalClicks=0,active=0,paused=0;
  for (let i=0;i<valid.length;i+=3) {
    const chunk=await Promise.all(valid.slice(i,i+3).map(async acc=>{
      const d=await fetchAccountData(acc.id,preset,['campaigns']); return{acc,campaigns:d.campaigns||[]};
    }));
    chunk.forEach(({acc,campaigns})=>{
      campaigns.forEach(c=>{
        const ins=c.insights?.data?.[0]||{};
        const row={unit:acc.name,name:c.name,status:c.status,obj:c.objective||'—',
          budget:c.daily_budget?parseFloat(c.daily_budget)/100:null,
          spend:parseFloat(ins.spend)||0,impr:parseInt(ins.impressions)||0,
          clicks:parseInt(ins.clicks)||0,ctr:parseFloat(ins.ctr)||0,cpc:parseFloat(ins.cpc)||0};
        allCamps.push(row);
        totalSpend+=row.spend; totalImpr+=row.impr; totalClicks+=row.clicks;
        if(c.status==='ACTIVE') active++; else paused++;
      });
    });
  }
  document.getElementById('ck-active').textContent  = active;
  document.getElementById('ck-paused').textContent  = paused;
  document.getElementById('ck-spend').textContent   = fmt(totalSpend);
  document.getElementById('ck-impr').textContent    = fmtN(totalImpr);
  document.getElementById('ck-clicks').textContent  = fmtN(totalClicks);
  document.getElementById('ck-ctr').textContent     = allCamps.length ? fmtPct(allCamps.reduce((s,c)=>s+c.ctr,0)/allCamps.length) : '—';
  const filterStatus=document.getElementById('camp-status').value;
  const tb=document.getElementById('camp-body'); tb.innerHTML='';
  const objMap={LINK_CLICKS:'🚚 Delivery',PAGE_LIKES:'👥 Seguidores',POST_ENGAGEMENT:'🎉 Temática',EVENT_RESPONSES:'📅 Evento',OUTCOME_TRAFFIC:'🚚 Delivery',OUTCOME_ENGAGEMENT:'👥 Engaj.'};
  allCamps.filter(c=>filterStatus==='all'||c.status===filterStatus).forEach(c=>{
    const tr=document.createElement('tr');
    const sdot=c.status==='ACTIVE'?'s-active':c.status==='PAUSED'?'s-paused':'s-ended';
    tr.innerHTML=`<td><span class="sname">${c.unit}</span></td>
      <td style="max-width:200px;font-weight:700;">${c.name}</td>
      <td style="font-size:12px;font-weight:700;">${objMap[c.obj]||c.obj}</td>
      <td><span class="status-dot-tbl ${sdot}"></span><span style="font-size:12px;font-weight:700;">${c.status==='ACTIVE'?'Ativa':c.status==='PAUSED'?'Pausada':'Encerrada'}</span></td>
      <td class="num">${c.budget?fmt(c.budget):'—'}</td>
      <td class="num spend">${fmt(c.spend)}</td>
      <td class="num">${fmtN(c.impr)}</td>
      <td class="num">${fmtPct(c.ctr)}</td>
      <td class="num">${fmt(c.cpc)}</td>`;
    tb.appendChild(tr);
  });
  if(!tb.children.length) tb.innerHTML='<tr><td colspan="9" style="text-align:center;padding:30px;color:#bbb;font-weight:700;">Nenhuma campanha encontrada.</td></tr>';
  document.getElementById('camp-last-up').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR');
}

function init_campanhas() {
  // a aba só carrega dados quando o usuário clica em "Atualizar" (campFetch)
}

