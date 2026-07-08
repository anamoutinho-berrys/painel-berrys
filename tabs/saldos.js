// ============================================================================
// tabs/saldos.js — lógica exclusiva da aba "Saldos".
// Depende de: core.js (ACCOUNTS, apiFetch, fetchAccountData, fmt/fmtN, paintTodayDate)
// ============================================================================

let sortState = { col: null, dir: 1 };

// Linhas sem valor de investimento/saldo (cartão, sem conta, erro ou pós-pago)
// sempre vão para o fim da lista, em qualquer ordenação escolhida.
function isIncomplete(acc, d) {
  return !!acc.card || !acc.id || !!d.spendErr || !!d.balErr || !!d.postpaid;
}

function sortedAccounts() {
  const rows = ACCOUNTS.map(acc => ({ acc, d: fetchedData[acc.id]||{} }));
  const complete   = rows.filter(r => !isIncomplete(r.acc, r.d));
  const incomplete = rows.filter(r =>  isIncomplete(r.acc, r.d));
  if (sortState.col) {
    const key = sortState.col;
    complete.sort((a,b) => {
      let va, vb;
      if (key==='name')          { va=a.acc.name.toLowerCase();      vb=b.acc.name.toLowerCase(); }
      else if (key==='mensal')   { va=a.acc.mensal||0;                vb=b.acc.mensal||0; }
      else if (key==='tax')      { va=(a.acc.mensal||0)*0.88;         vb=(b.acc.mensal||0)*0.88; }
      else if (key==='spend')    { va=a.d.spend??-Infinity;           vb=b.d.spend??-Infinity; }
      else if (key==='balance')  { va=a.d.balance??-Infinity;         vb=b.d.balance??-Infinity; }
      if (va<vb) return -1*sortState.dir;
      if (va>vb) return  1*sortState.dir;
      return 0;
    });
  }
  return [...complete, ...incomplete];
}

function onSortClick(col) {
  if (sortState.col === col) {
    sortState.dir *= -1;
  } else {
    sortState.col = col;
    sortState.dir = col==='name' ? 1 : -1;
  }
  renderSaldosTable();
}

function updateSortArrows() {
  ['name','mensal','tax','spend','balance'].forEach(col => {
    const el = document.getElementById('arrow-'+col);
    if (!el) return;
    el.textContent = sortState.col===col ? (sortState.dir===1?'▲':'▼') : '';
  });
}

function renderSaldosTable() {
  const tb = document.getElementById('tbl-body');
  tb.innerHTML = '';
  sortedAccounts().forEach(({acc,d}, idx) => {
    const tr = document.createElement('tr');
    const tn = document.createElement('td');
    tn.style.cssText='color:#bbb;font-size:12px;font-weight:700;';
    tn.textContent = idx+1;
    const tname = document.createElement('td');
    tname.innerHTML = `<div class="sname">${acc.name}${acc.card?' <span class="pill pill-card">cartão</span>':''}</div>`
      +(acc.mgr?`<a class="slink" href="${acc.mgr}" target="_blank">↗ Gerenciador</a>`:'')
      +(!acc.id?'<span class="pill pill-unk">sem conta</span>':'');
    const tmensal = document.createElement('td');
    tmensal.className='num'; tmensal.textContent = acc.mensal ? fmt(acc.mensal) : '—';
    const ttax = document.createElement('td');
    ttax.className='num tax'; ttax.textContent = acc.mensal ? fmt(acc.mensal*0.88) : '—';
    const tspend = document.createElement('td'); tspend.id='spend_'+(acc.id||'na'+idx);
    paintSpend(tspend, acc, d);
    const tbal = document.createElement('td'); tbal.id='bal_'+(acc.id||'na'+idx);
    paintBalance(tbal, acc, d);
    tr.append(tn, tname, tmensal, ttax, tspend, tbal);
    tb.appendChild(tr);
  });
  updateSortArrows();
}

function errLabel(msg) {
  if (!msg||msg==='?') return 'sem acesso';
  if (/token|oauth|auth/i.test(msg))   return 'token expirado';
  if (/permission/i.test(msg))         return 'sem permissão';
  if (/rate|limit/i.test(msg))         return 'limite atingido';
  if (/does not exist/i.test(msg))     return 'conta não encontrada';
  if (/META_TOKEN/i.test(msg))         return 'token não configurado';
  return msg.length>38 ? msg.slice(0,38)+'…' : msg;
}

function paintSpend(td, acc, d) {
  if (!acc.id) { td.innerHTML='<span class="cell-na">—</span>'; return; }
  if (d.loading) { td.innerHTML='<div class="cell-load"><span class="spin"></span></div>'; return; }
  if (d.spendErr) {
    console.warn('[spend]', acc.name, d.spendErr);
    td.style.textAlign='center';
    td.innerHTML=`<span style="color:#fc8181;font-size:11px;font-weight:800;">⚠ ${errLabel(d.spendErr)}</span>`;
    return;
  }
  if (d.spend!==undefined) { td.className='num spend'; td.textContent=fmt(d.spend); return; }
  td.innerHTML='<span class="cell-na">—</span>';
}

function paintBalance(td, acc, d) {
  if (acc.card) { td.innerHTML='<span class="pill pill-card">cartão</span>'; return; }
  if (!acc.id)  { td.innerHTML='<span class="cell-na">—</span>'; return; }
  if (d.loading){ td.innerHTML='<div class="cell-load"><span class="spin"></span></div>'; return; }
  if (d.balErr) {
    console.warn('[balance]', acc.name, d.balErr);
    td.style.textAlign='center';
    td.innerHTML=`<span style="color:#fc8181;font-size:11px;font-weight:800;">⚠ ${errLabel(d.balErr)}</span>`;
    return;
  }
  if (d.postpaid) { td.style.textAlign='center'; td.innerHTML='<span class="pill pill-card">pós-pago</span>'; return; }
  if (d.balance!==undefined) { td.className=d.balance<200?'num bal-low':'num bal'; td.textContent=fmt(d.balance); return; }
  td.innerHTML='<span class="cell-na">—</span>';
}

function onDateChange() {
  const v = document.getElementById('date-preset').value;
  document.getElementById('custom-dt').classList.toggle('show', v==='custom');
  if (v !== 'custom') fetchAll();
}

async function fetchAll() {
  const preset = document.getElementById('date-preset').value;
  const valid  = ACCOUNTS.filter(a=>a.id&&!a.card);
  valid.forEach(a => { fetchedData[a.id]={loading:true}; });
  renderSaldosTable();
  const pw=document.getElementById('prog-wrap'), pf=document.getElementById('prog-fill'), pl=document.getElementById('prog-lbl');
  pw.classList.add('show'); pf.style.width='0%';
  let done=0, firstErr=null;
  for (let i=0; i<valid.length; i+=4) {
    await Promise.all(valid.slice(i,i+4).map(async acc => {
      fetchedData[acc.id] = await fetchAccountData(acc.id, preset, ['spend','balance']);
      if (!firstErr && (fetchedData[acc.id].spendErr||fetchedData[acc.id].balErr))
        firstErr = fetchedData[acc.id].spendErr || fetchedData[acc.id].balErr;
      done++; pf.style.width=(done/valid.length*100)+'%';
      pl.textContent=`${done}/${valid.length} contas…`;
      refreshCells(acc.id); updateSaldosSummary();
    }));
  }
  pw.classList.remove('show');
  document.getElementById('last-up').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR');
  const eb=document.getElementById('err-banner');
  if (firstErr && /META_TOKEN|configurado/i.test(firstErr)) {
    document.getElementById('err-msg').textContent='Token não configurado no servidor. Adicione META_TOKEN nas variáveis de ambiente do Vercel.';
    eb.classList.add('show');
  } else { eb.classList.remove('show'); }
}

function refreshCells(id) {
  const acc = ACCOUNTS.find(a=>a.id===id)||{id};
  const d   = fetchedData[id]||{};
  const se  = document.getElementById('spend_'+id), be=document.getElementById('bal_'+id);
  if(se) paintSpend(se,acc,d);
  if(be) paintBalance(be,acc,d);
}

function updateSaldosSummary() {
  let tm=0,tt=0,ti=0,tb=0,hi=false,hb=false;
  ACCOUNTS.forEach(acc => {
    const v = acc.mensal||0;
    tm+=v; tt+=v*0.88;
    if (acc.id) {
      const d = fetchedData[acc.id]||{};
      if (d.spend!==undefined&&!isNaN(d.spend))                        { ti+=d.spend;   hi=true; }
      if (!acc.card&&d.balance!==undefined&&!isNaN(d.balance))         { tb+=d.balance; hb=true; }
    }
  });
  document.getElementById('c-mensal').textContent   = tm ? fmt(tm) : '— —';
  document.getElementById('c-tax').textContent      = tt ? fmt(tt) : '— —';
  document.getElementById('c-invested').textContent = hi ? fmt(ti) : '— —';
  document.getElementById('c-balance').textContent  = hb ? fmt(tb) : '— —';
  const p = document.getElementById('date-preset');
  document.getElementById('c-invested-sub').textContent = p.options[p.selectedIndex].text.toLowerCase();
}

function init_saldos() {
  paintTodayDate('date-display');
  renderSaldosTable();
  updateSaldosSummary();
  fetchAll();
}
