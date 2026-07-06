// ============================================================================
// tabs/saldos.js — lógica exclusiva da aba "Saldos".
// Depende de: core.js (ACCOUNTS, apiFetch, fetchAccountData, fmt/fmtN, paintTodayDate)
// ============================================================================

function renderSaldosTable() {
  const tb = document.getElementById('tbl-body');
  tb.innerHTML = '';
  ACCOUNTS.forEach((acc,i) => {
    const m = parseFloat(localStorage.getItem('m_'+(acc.id||acc.name))||'0')||0;
    const d = fetchedData[acc.id]||{};
    const tr = document.createElement('tr');
    const tn = document.createElement('td');
    tn.style.cssText='color:#bbb;font-size:12px;font-weight:700;';
    tn.textContent = i+1;
    const tname = document.createElement('td');
    tname.innerHTML = `<div class="sname">${acc.name}${acc.card?' <span class="pill pill-card">cartão</span>':''}</div>`
      +(acc.mgr?`<a class="slink" href="${acc.mgr}" target="_blank">↗ Gerenciador</a>`:'')
      +(!acc.id?'<span class="pill pill-unk">sem conta</span>':'');
    const tmensal = document.createElement('td'); tmensal.style.textAlign='right';
    const inp = document.createElement('input');
    inp.type='number'; inp.className='inp-m'; inp.value=m||''; inp.placeholder='0,00';
    inp.min='0'; inp.step='100'; inp.dataset.key=acc.id||acc.name;
    inp.addEventListener('change', onMensalChange);
    tmensal.appendChild(inp);
    const ttax = document.createElement('td');
    ttax.className='num tax'; ttax.id='tax_'+(acc.id||acc.name).replace(/\W/g,'_');
    ttax.textContent = m ? fmt(m*0.88) : '—';
    const tspend = document.createElement('td'); tspend.id='spend_'+(acc.id||'na'+i);
    paintSpend(tspend, acc, d);
    const tbal = document.createElement('td'); tbal.id='bal_'+(acc.id||'na'+i);
    paintBalance(tbal, acc, d);
    tr.append(tn, tname, tmensal, ttax, tspend, tbal);
    tb.appendChild(tr);
  });
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
  if (d.balance!==undefined) { td.className=d.balance>0?'num bal':'num zero'; td.textContent=fmt(d.balance); return; }
  td.innerHTML='<span class="cell-na">—</span>';
}

function onMensalChange(e) {
  const v=parseFloat(e.target.value)||0, key=e.target.dataset.key;
  localStorage.setItem('m_'+key, v);
  const el=document.getElementById('tax_'+key.replace(/\W/g,'_'));
  if(el) el.textContent = v ? fmt(v*0.88) : '—';
  updateSaldosSummary();
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
    const v = parseFloat(localStorage.getItem('m_'+(acc.id||acc.name))||'0')||0;
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
