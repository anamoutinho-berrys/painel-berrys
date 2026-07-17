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

// Nº de dias cobertos pelo período selecionado, usado para calcular o
// investimento proporcional esperado (mensal/30 * dias). Retorna null para
// períodos sem duração clara (ano/máximo/custom incompleto) — nesses casos
// não damos alerta de margem, só o de saldo zerado.
function periodDays(preset) {
  const today = new Date();
  switch (preset) {
    case 'today': case 'yesterday': return 1;
    case 'last_7d':  return 7;
    case 'last_14d': return 14;
    case 'last_30d': return 30;
    case 'this_month': return today.getDate();
    case 'last_month': return new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    case 'custom': {
      const s = document.getElementById('dt-since')?.value;
      const u = document.getElementById('dt-until')?.value;
      if (!s || !u) return null;
      return Math.max(1, Math.round((new Date(u)-new Date(s))/86400000)+1);
    }
    default: return null; // this_year, maximum
  }
}

// Vermelho só quando o valor investido é 0, ou quando foge >10% do
// proporcional esperado pro período com base no valor mensal contratado.
function isSpendWarn(acc, spend) {
  if (!spend) return true;
  if (!acc.mensal) return false;
  const preset = document.getElementById('date-preset')?.value;
  const days = periodDays(preset);
  if (days == null) return false;
  const expected = acc.mensal/30*days;
  if (expected <= 0) return false;
  return spend < expected*0.9 || spend > expected*1.1;
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
  if (d.spend!==undefined) {
    td.className = isSpendWarn(acc, d.spend) ? 'num spend-warn' : 'num spend';
    td.textContent = fmt(d.spend);
    return;
  }
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

// ----------------------------------------------------------------------------
// Histórico de pagamento de boleto: sempre que o saldo de uma conta sobe de
// forma relevante (recarga/boleto compensado), registramos a data. Guardado
// em data/boleto-log.json no repo (via api/store.js), compartilhado entre
// todo mundo que abre o painel — não é por navegador.
// ----------------------------------------------------------------------------
let boletoLog = null;        // { data: {accId: {lastBalance, lastCheckedDate, payments[]}}, sha }
let boletoLogChanged = false;
let boletoLogPromise = null; // promise da 1ª carga, pra fetchAll aguardar antes de checar pagamentos
const BOLETO_JUMP_MIN = 10;  // R$ mínimo de aumento pra contar como pagamento (evita ruído)

async function loadBoletoLog() {
  try {
    const r = await storeGet('boleto-log');
    boletoLog = { data: r.data || {}, sha: r.sha || null };
  } catch (e) {
    console.warn('[boleto] falha ao carregar histórico', e);
    boletoLog = { data: {}, sha: null };
  }
  renderBoletoHistory();
  renderBoletoChecklist(); // coluna "pago" depende do boletoLog
}

function checkBoletoPayment(acc, newBalance) {
  if (!boletoLog || newBalance==null || isNaN(newBalance)) return;
  const today = new Date().toISOString().slice(0,10);
  const entry = boletoLog.data[acc.id] || { lastBalance:null, lastCheckedDate:null, payments:[] };
  if (entry.lastCheckedDate === today) return; // já conferido hoje, não repete
  const prev = entry.lastBalance;
  if (prev!=null && newBalance - prev >= BOLETO_JUMP_MIN) {
    entry.payments = [{ date:today, from:prev, to:newBalance }, ...(entry.payments||[])].slice(0,50);
  }
  if (prev !== newBalance) boletoLogChanged = true;
  entry.lastBalance = newBalance;
  entry.lastCheckedDate = today;
  boletoLog.data[acc.id] = entry;
}

async function flushBoletoLog() {
  if (!boletoLogChanged || !boletoLog) return;
  try {
    const r = await storeSet('boleto-log', boletoLog.data, boletoLog.sha);
    if (r.sha) boletoLog.sha = r.sha;
    boletoLogChanged = false;
    renderBoletoHistory();
    renderBoletoChecklist();
  } catch (e) {
    console.warn('[boleto] falha ao salvar histórico', e);
  }
}

function renderBoletoHistory() {
  const wrap = document.getElementById('boleto-history-wrap');
  const tb   = document.getElementById('boleto-history-body');
  if (!wrap || !tb || !boletoLog) return;
  const rows = [];
  Object.entries(boletoLog.data).forEach(([id, entry]) => {
    const acc = ACCOUNTS.find(a=>a.id===id);
    (entry.payments||[]).forEach(p => rows.push({ name: acc?acc.name:id, ...p }));
  });
  rows.sort((a,b) => b.date.localeCompare(a.date));
  if (!rows.length) { wrap.style.display='none'; return; }
  wrap.style.display='';
  tb.innerHTML = rows.slice(0,15).map(r => `<tr>
    <td>${new Date(r.date+'T00:00:00').toLocaleDateString('pt-BR')}</td>
    <td>${r.name}</td>
    <td class="num">${fmt(r.from)}</td>
    <td class="num" style="color:var(--green);font-weight:800;">${fmt(r.to)}</td>
  </tr>`).join('');
}

// ----------------------------------------------------------------------------
// Checklist mensal de boletos: a Meta não tem API para gerar boleto, então o
// painel vira a esteira do trabalho manual — lista todas as contas pré-pagas
// com link direto pra tela de faturamento de cada uma, e a Ana marca
// "gerado" e "enviado". Fica salvo em data/boleto-checklist.json (via
// api/store.js), compartilhado. A coluna "pago" é automática, cruzando com o
// histórico de recargas detectadas (boletoLog).
// ----------------------------------------------------------------------------
let bcLog = null;        // { data: {'2026-07': {accId: {gerado:'2026-07-17', enviado:'...'}}}, sha }
let bcMonth = new Date().toISOString().slice(0,7);

function bcEligible() { return ACCOUNTS.filter(a => a.id && !a.card); }

function bcBillingUrl(acc) {
  return `https://www.facebook.com/ads/manager/account_settings/account_billing/?act=${acc.id}`;
}

async function loadBcLog() {
  try {
    const r = await storeGet('boleto-checklist');
    bcLog = { data: r.data || {}, sha: r.sha || null };
  } catch (e) {
    console.warn('[boleto-check] falha ao carregar', e);
    bcLog = { data: {}, sha: null };
  }
  renderBoletoChecklist();
}

async function saveBcLog() {
  try {
    const r = await storeSet('boleto-checklist', bcLog.data, bcLog.sha);
    if (r.sha) bcLog.sha = r.sha;
    if (r.error) throw new Error(r.error);
  } catch (e) {
    // conflito de versão (alguém marcou ao mesmo tempo) ou rede: recarrega
    // e a Ana marca de novo — melhor do que sobrescrever a marcação alheia.
    console.warn('[boleto-check] falha ao salvar, recarregando', e);
    await loadBcLog();
  }
}

function bcShiftMonth(delta) {
  const [y, m] = bcMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  bcMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  renderBoletoChecklist();
}

async function bcToggle(accId, field) {
  if (!bcLog) return;
  const month = bcLog.data[bcMonth] || (bcLog.data[bcMonth] = {});
  const entry = month[accId] || (month[accId] = {});
  if (entry[field]) delete entry[field];
  else entry[field] = new Date().toISOString().slice(0,10);
  renderBoletoChecklist();
  await saveBcLog();
}

// recarga detectada no mês exibido = boleto pago (retorna a data ou null)
function bcPaidDate(accId) {
  const pays = boletoLog?.data?.[accId]?.payments || [];
  const p = pays.find(p => p.date.startsWith(bcMonth));
  return p ? p.date : null;
}

const bcFmtDay = iso => new Date(iso+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});

function renderBoletoChecklist() {
  const tb = document.getElementById('bc-body');
  if (!tb) return;
  const [y, m] = bcMonth.split('-').map(Number);
  document.getElementById('bc-month-lbl').textContent =
    new Date(y, m-1, 1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const monthData = bcLog?.data?.[bcMonth] || {};
  const accs = bcEligible();
  let nGer = 0, nEnv = 0, nPag = 0;
  tb.innerHTML = accs.map((acc, i) => {
    const e = monthData[acc.id] || {};
    const paid = bcPaidDate(acc.id);
    if (e.gerado)  nGer++;
    if (e.enviado) nEnv++;
    if (paid)      nPag++;
    const chk = (field, lbl) => e[field]
      ? `<button class="btn" style="padding:3px 10px;font-size:11px;background:#e6f7ee;color:var(--green);" onclick="bcToggle('${acc.id}','${field}')" title="clique para desmarcar">✓ ${bcFmtDay(e[field])}</button>`
      : `<button class="btn btn-ghost" style="padding:3px 10px;font-size:11px;" onclick="bcToggle('${acc.id}','${field}')">${lbl}</button>`;
    const pendente = !e.gerado && !paid;
    return `<tr${pendente?' style="background:#fffaf2;"':''}>
      <td style="color:#bbb;font-size:12px;font-weight:700;">${i+1}</td>
      <td><div class="sname">${acc.name}</div></td>
      <td class="num">${acc.mensal ? fmt(acc.mensal) : '—'}</td>
      <td><a class="slink" href="${bcBillingUrl(acc)}" target="_blank">↗ Faturamento</a></td>
      <td>${chk('gerado','gerar ○')}</td>
      <td>${chk('enviado','enviar ○')}</td>
      <td>${paid ? `<span class="pill" style="background:#e6f7ee;color:var(--green);">✓ pago ${bcFmtDay(paid)}</span>` : '<span class="cell-na">—</span>'}</td>
    </tr>`;
  }).join('');
  document.getElementById('bc-progress').textContent =
    `${nGer}/${accs.length} gerados · ${nEnv}/${accs.length} enviados · ${nPag}/${accs.length} pagos`;
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

  if (boletoLogPromise) await boletoLogPromise;
  if (boletoLog) {
    valid.forEach(acc => {
      const bal = fetchedData[acc.id]?.balance;
      if (bal!==undefined) checkBoletoPayment(acc, bal);
    });
    await flushBoletoLog();
  }
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
  boletoLogPromise = loadBoletoLog();
  loadBcLog();
  renderBoletoChecklist();
  renderSaldosTable();
  updateSaldosSummary();
  fetchAll();
}
