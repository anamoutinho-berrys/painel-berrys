// ============================================================================
// tabs/instagram.js — lógica exclusiva da aba "Instagram".
// Depende de: core.js (ACCOUNTS, apiFetch, storeGet/storeSet, fmtN, paintTodayDate)
//
// Como funciona:
// 1. Para cada conta de anúncio, busca a conta de Instagram vinculada via
//    act_<id>/instagram_accounts (username + nº de seguidores ao vivo).
// 2. A API da Meta NÃO fornece histórico retroativo de seguidores, então a
//    aba grava um snapshot diário em data/instagram.json (via api/store.js,
//    mesmo mecanismo do histórico de boletos) e calcula o crescimento
//    comparando com os snapshots anteriores.
// ============================================================================

const IG_FILE = 'instagram';
let igStoreState = { data: null, sha: null };

function igDateStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function igDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return igDateStr(d); }

// Busca a conta de IG vinculada à conta de anúncio (username + seguidores).
async function igFetchAccount(acc) {
  const j = await apiFetch(acc.id, 'instagram_accounts', {
    fields: 'username,followed_by_count,media_count',
  });
  const ig = j.data && j.data[0];
  if (!ig) throw new Error('sem Instagram vinculado');
  return {
    username: ig.username || null,
    followers: ig.followed_by_count != null ? Number(ig.followed_by_count) : null,
    media: ig.media_count != null ? Number(ig.media_count) : null,
  };
}

// Valor do snapshot mais recente que seja <= data alvo (ou null se o
// histórico ainda não alcança essa data).
function igValueAt(history, targetDate) {
  let best = null;
  for (const d in history) if (d <= targetDate && (best === null || d > best)) best = d;
  return best !== null ? history[best] : null;
}

function igEarliest(history) {
  let best = null;
  for (const d in history) if (best === null || d < best) best = d;
  return best;
}

function igDeltaPill(delta, base) {
  if (delta == null) return '<span class="ig-delta na" title="histórico ainda insuficiente">—</span>';
  const pct = base ? ` (${(delta / base * 100).toFixed(1)}%)` : '';
  if (delta > 0) return `<span class="ig-delta up">▲ +${fmtN(delta)}${pct}</span>`;
  if (delta < 0) return `<span class="ig-delta down">▼ ${fmtN(delta)}${pct}</span>`;
  return '<span class="ig-delta flat">= 0</span>';
}

// Sparkline SVG com os últimos 30 snapshots.
function igSpark(history) {
  const entries = Object.entries(history || {}).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-30);
  if (entries.length < 2) return '<span style="color:#ccc;font-size:11px;font-weight:700;">acumulando…</span>';
  const vals = entries.map(e => e[1]);
  const min = Math.min(...vals), max = Math.max(...vals), range = (max - min) || 1;
  const w = 90, h = 24;
  const pts = vals.map((v, i) =>
    `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - (v - min) / range * (h - 4)).toFixed(1)}`
  ).join(' ');
  return `<svg class="ig-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<polyline points="${pts}" fill="none" stroke="#c13584" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

async function igRefresh() {
  const tbody = document.getElementById('ig-tbody');
  const errEl = document.getElementById('ig-err');
  errEl.classList.remove('show');
  tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:#bbb;font-weight:700;"><span class="spin"></span> Carregando contas de Instagram…</td></tr>';

  // 1. histórico salvo (não é fatal se falhar — só perde os deltas)
  try { igStoreState = await storeGet(IG_FILE); } catch (e) { /* segue sem histórico */ }
  const hist = igStoreState.data || {};

  // 2. dados ao vivo, em lotes de 4 (mesmo padrão do Acompanhamento)
  const valid = ACCOUNTS.filter(a => a.id);
  const results = [];
  for (let i = 0; i < valid.length; i += 4) {
    const chunk = await Promise.all(valid.slice(i, i + 4).map(async acc => {
      try { return { ...acc, ...(await igFetchAccount(acc)) }; }
      catch (e) { return { ...acc, err: e.message }; }
    }));
    results.push(...chunk);
  }

  // 3. grava o snapshot de hoje (1 por dia por conta) se algo mudou
  const today = igDateStr(new Date());
  let changed = false;
  results.forEach(r => {
    if (r.followers == null) return;
    const h = hist[r.id] || (hist[r.id] = {});
    if (r.username) h.username = r.username;
    h.history = h.history || {};
    if (h.history[today] !== r.followers) { h.history[today] = r.followers; changed = true; }
  });
  if (changed) {
    try {
      const res = await storeSet(IG_FILE, hist, igStoreState.sha);
      if (res && res.sha) { igStoreState.sha = res.sha; igStoreState.data = hist; }
      else if (res && res.error) throw new Error(res.error);
    } catch (e) {
      errEl.textContent = '⚠️ Não foi possível salvar o snapshot de hoje (' + e.message + '). Os números ao vivo continuam corretos.';
      errEl.classList.add('show');
    }
  }

  // 4. render
  const d7 = igDaysAgo(7), d30 = igDaysAgo(30);
  let total = 0, count = 0, g7 = 0, g7n = 0, g30 = 0, g30n = 0;
  tbody.innerHTML = '';
  results.forEach(r => {
    const tr = document.createElement('tr');
    if (r.followers == null) {
      tr.innerHTML = `<td><span class="sname">${r.name}</span></td>
        <td colspan="6" class="cell-na" style="text-align:left;">${r.err || 'sem dados'}</td>`;
      tbody.appendChild(tr);
      return;
    }
    total += r.followers; count++;
    const h = (hist[r.id] && hist[r.id].history) || {};
    const v7 = igValueAt(h, d7), v30 = igValueAt(h, d30);
    const first = igEarliest(h);
    const delta7  = v7  != null ? r.followers - v7  : null;
    const delta30 = v30 != null ? r.followers - v30 : null;
    if (delta7  != null) { g7  += delta7;  g7n++; }
    if (delta30 != null) { g30 += delta30; g30n++; }
    const deltaFirst = (first && first !== today) ? r.followers - h[first] : null;
    const firstLbl = deltaFirst != null
      ? `${igDeltaPill(deltaFirst, h[first])}<div style="font-size:10px;color:#bbb;font-weight:700;margin-top:2px;">desde ${first.split('-').reverse().join('/')}</div>`
      : '<span class="ig-delta na" title="primeiro registro é de hoje">—</span>';
    const userLink = r.username
      ? `<a class="ig-user" href="https://instagram.com/${r.username}" target="_blank">@${r.username}</a>` : '';
    tr.innerHTML = `<td><span class="sname">${r.name}</span>${userLink}</td>
      <td class="num">${fmtN(r.followers)}</td>
      <td class="num">${igDeltaPill(delta7, v7)}</td>
      <td class="num">${igDeltaPill(delta30, v30)}</td>
      <td class="num">${firstLbl}</td>
      <td>${igSpark(h)}</td>
      <td class="num">${fmtN(r.media)}</td>`;
    tbody.appendChild(tr);
  });
  if (!tbody.children.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:#bbb;font-weight:700;">Nenhuma conta de Instagram encontrada.</td></tr>';
  }

  document.getElementById('ig-total').textContent = fmtN(total);
  document.getElementById('ig-count').textContent = fmtN(count) + ' / ' + valid.length;
  document.getElementById('ig-g7').textContent  = g7n  ? (g7  >= 0 ? '+' : '') + fmtN(g7)  : '—';
  document.getElementById('ig-g30').textContent = g30n ? (g30 >= 0 ? '+' : '') + fmtN(g30) : '—';
  document.getElementById('ig-g7-sub').textContent  = g7n  ? `${g7n} unidade${g7n > 1 ? 's' : ''} com histórico` : 'histórico em construção';
  document.getElementById('ig-g30-sub').textContent = g30n ? `${g30n} unidade${g30n > 1 ? 's' : ''} com histórico` : 'histórico em construção';
  document.getElementById('ig-last-up').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
}

function init_instagram() {
  paintTodayDate('ig-date');
  igRefresh();
}
