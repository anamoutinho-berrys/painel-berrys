// ============================================================================
// tabs/instagram.js — lógica exclusiva da aba "Instagram".
// Depende de: core.js (ACCOUNTS, apiFetch, storeGet/storeSet, fmt/fmtN,
// paintTodayDate) e objectives.js (classifyObjective, getAct, A_ENG).
//
// Como funciona:
// 1. Para cada conta de anúncio, descobre a conta de Instagram vinculada
//    (igResolveIg) — de preferência o nó IGUser, que é o único que aceita
//    /insights.
// 2. Puxa os Insights do perfil (igFetchInsights): novos seguidores,
//    deixaram de seguir, alcance, visitas ao perfil, interações — os mesmos
//    números da tela "Insights → Público → Tendências" do Business Suite.
//    A API só disponibiliza os últimos 30 dias, então a janela é de 28 dias,
//    igual à do Business Suite.
// 3. Puxa também o investimento em Ads dos mesmos 28 dias, pra cruzar
//    orgânico × pago na tabela "Cruzamento".
// 4. Como a Meta NÃO fornece histórico retroativo de seguidores, a aba grava
//    um snapshot diário em data/instagram.json (via api/store.js) e calcula
//    o crescimento comparando com os snapshots anteriores.
// ============================================================================

const IG_FILE = 'instagram';
const IG_WINDOW_DAYS = 28;   // janela dos insights (a API só guarda 30 dias)
let igStoreState = { data: null, sha: null };
let igLastResults = [];      // guardado pro painel de diagnóstico

function igDateStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function igDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return igDateStr(d); }

// ── 1. Descoberta da conta de Instagram ─────────────────────────────────────
// A ordem das tentativas importa: SÓ o nó IGUser (id começando com 17841…)
// aceita /insights. O edge instagram_accounts devolve o nó ANTIGO de
// Instagram, que até traz o nº de seguidores mas NÃO aceita insights — por
// isso ele fica por último, como último recurso. Cada tentativa é registrada
// em `diag` pra aparecer no painel de diagnóstico da aba.

const igIsIgUser = id => /^17841/.test(String(id || ''));

// Alguns edges simplesmente não existem para o app/token em uso (ex.:
// assigned_pages costuma responder "#3 Application does not have the
// capability"). Depois de falhar em 3 unidades, o edge é dado como morto e
// não é mais tentado nesta sessão — isso corta dezenas de requisições inúteis.
const igEdgeFails = {};
const igEdgeDead = e => (igEdgeFails[e] || 0) >= 3;
function igEdgeFailed(edge, diag, msg) {
  igEdgeFails[edge] = (igEdgeFails[edge] || 0) + 1;
  diag.push({ step: edge, ok: false, msg });
}

function igNorm(ig, source) {
  return {
    igid: ig.id || null,
    username: ig.username || null,
    followers: ig.followers_count != null ? Number(ig.followers_count)
             : ig.followed_by_count != null ? Number(ig.followed_by_count) : null,
    media: ig.media_count != null ? Number(ig.media_count) : null,
    source,
    canInsights: igIsIgUser(ig.id),
  };
}

// Se o edge devolveu a conta mas sem o nº de seguidores, consulta o nó direto.
async function igEnrich(accId, cand, diag) {
  if (!cand || cand.followers != null || !cand.igid) return cand;
  for (const fields of ['username,followers_count,follows_count,media_count', 'username,followers_count']) {
    try {
      const d = await apiFetch(accId, '', { node: cand.igid, fields });
      if (d.followers_count != null) {
        cand.followers = Number(d.followers_count);
        if (d.media_count != null) cand.media = Number(d.media_count);
        if (!cand.username) cand.username = d.username || null;
        diag.push({ step: 'nó ' + cand.igid, ok: true, msg: 'seguidores lidos direto do nó' });
      }
      return cand;
    } catch (e) { diag.push({ step: 'nó ' + cand.igid, ok: false, msg: e.message }); }
  }
  return cand;
}

async function igResolveIg(acc, diag) {
  // a) act_<id>/connected_instagram_accounts → IGUser (caminho preferido)
  for (const fields of ['id,username,followers_count,follows_count,media_count',
                        'id,username,followers_count']) {
    if (igEdgeDead('connected_instagram_accounts')) break;
    try {
      const j = await apiFetch(acc.id, 'connected_instagram_accounts', { fields });
      const ig = (j.data || [])[0];
      diag.push({ step: 'connected_instagram_accounts', ok: true,
                  msg: ig ? '@' + (ig.username || ig.id) : 'nenhuma conta vinculada' });
      if (ig) return await igEnrich(acc.id, igNorm(ig, 'connected_instagram_accounts'), diag);
      break; // respondeu certo, só não tem conta: não adianta tentar menos campos
    } catch (e) { igEdgeFailed('connected_instagram_accounts', diag, e.message); }
  }

  // b) páginas da conta de anúncio → instagram_business_account (também IGUser)
  for (const edge of ['promote_pages', 'assigned_pages']) {
    if (igEdgeDead(edge)) continue;
    try {
      const j = await apiFetch(acc.id, edge, {
        fields: 'id,name,instagram_business_account{id,username,followers_count,follows_count,media_count}',
        limit: 25,
      });
      const page = (j.data || []).find(p => p.instagram_business_account);
      diag.push({ step: edge, ok: true,
                  msg: page ? 'IG pela página "' + page.name + '"' : `${(j.data || []).length} página(s), nenhuma com IG` });
      if (page) return await igEnrich(acc.id, igNorm(page.instagram_business_account, edge), diag);
    } catch (e) { igEdgeFailed(edge, diag, e.message); }
  }

  // c) instagram_accounts (nó antigo): traz seguidores, mas NÃO aceita insights
  for (const fields of ['id,username,followed_by_count', 'id,username']) {
    if (igEdgeDead('instagram_accounts')) break;
    try {
      const j = await apiFetch(acc.id, 'instagram_accounts', { fields });
      const ig = (j.data || [])[0];
      diag.push({ step: 'instagram_accounts', ok: true,
                  msg: ig ? '@' + (ig.username || ig.id) + ' — nó antigo, sem insights' : 'vazio' });
      if (ig) return igNorm(ig, 'instagram_accounts');
      break;
    } catch (e) { igEdgeFailed('instagram_accounts', diag, e.message); }
  }

  return null;
}

// ── 2. Insights do perfil ───────────────────────────────────────────────────
// Mesmos números da tela "Insights → Público → Tendências" do Business Suite.
// Cada bloco é independente: se a Meta recusar uma métrica, as outras
// continuam vindo (e o motivo fica registrado no diagnóstico).

// Métricas de total no período. Vão numa chamada só pra economizar requisição;
// se a Meta recusar UMA delas a chamada inteira falha, então tem fallback
// métrica a métrica. "views" é o nome novo (v22) do antigo "impressions".
const IG_TOTAL_METRICS = ['reach', 'views', 'profile_views', 'total_interactions'];

const igInsightCall = (accId, igid, params) =>
  apiFetch(accId, '', { node: igid + '/insights', ...params });

function igReadTotals(j, out) {
  (j.data || []).forEach(m => {
    const v = m.total_value ? m.total_value.value : null;
    if (v != null) out[m.name] = Number(v) || 0;
  });
}

async function igFetchTotals(accId, igid, since, until, diag) {
  const out = {};
  try {
    igReadTotals(await igInsightCall(accId, igid, {
      metric: IG_TOTAL_METRICS.join(','), metric_type: 'total_value', period: 'day', since, until,
    }), out);
    diag.push({ step: 'insights totais', ok: true, msg: Object.keys(out).join(', ') || 'sem valores' });
    return out;
  } catch (e) {
    diag.push({ step: 'insights totais (lote)', ok: false, msg: e.message });
  }
  // fallback: uma métrica de cada vez, pra uma inválida não derrubar as outras
  for (const m of IG_TOTAL_METRICS) {
    try {
      igReadTotals(await igInsightCall(accId, igid, {
        metric: m, metric_type: 'total_value', period: 'day', since, until,
      }), out);
    } catch (e) { diag.push({ step: 'insights ' + m, ok: false, msg: e.message }); }
  }
  if (Object.keys(out).length) diag.push({ step: 'insights totais (individual)', ok: true, msg: Object.keys(out).join(', ') });
  return out;
}

async function igFetchInsights(accId, igid, diag) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - IG_WINDOW_DAYS * 86400;
  const out = {};

  // a) série diária de novos seguidores → gráfico "Seguidores" do Business Suite
  try {
    const j = await igInsightCall(accId, igid, { metric: 'follower_count', period: 'day', since, until });
    const vals = ((j.data || [])[0]?.values || []).map(v => Number(v.value) || 0);
    if (vals.length) out.daily = vals;
    diag.push({ step: 'insights follower_count', ok: true, msg: vals.length + ' dia(s)' });
  } catch (e) { diag.push({ step: 'insights follower_count', ok: false, msg: e.message }); }

  // b) seguiram / deixaram de seguir no período
  try {
    const j = await igInsightCall(accId, igid, {
      metric: 'follows_and_unfollows', metric_type: 'total_value',
      breakdown: 'follow_type', period: 'day', since, until,
    });
    const tv = (j.data || [])[0]?.total_value;
    const res = tv?.breakdowns?.[0]?.results || [];
    res.forEach(r => {
      const k = String((r.dimension_values || [])[0] || '');
      if (/unfollow/i.test(k)) out.unfollows = (out.unfollows || 0) + (Number(r.value) || 0);
      else if (/follow/i.test(k)) out.newFollows = (out.newFollows || 0) + (Number(r.value) || 0);
    });
    if (out.newFollows == null && tv?.value != null) out.newFollows = Number(tv.value) || 0;
    diag.push({ step: 'insights follows_and_unfollows', ok: true,
                msg: `+${out.newFollows ?? '?'} / -${out.unfollows ?? '?'}` });
  } catch (e) { diag.push({ step: 'insights follows_and_unfollows', ok: false, msg: e.message }); }

  // c) alcance, visualizações, visitas ao perfil, contas engajadas, interações
  Object.assign(out, await igFetchTotals(accId, igid, since, until, diag));

  // fallback: sem follows_and_unfollows, soma a série diária de novos seguidores
  if (out.newFollows == null && out.daily) out.newFollows = out.daily.reduce((a, b) => a + b, 0);
  return out;
}

// ── 3. Investimento em Ads na MESMA janela dos insights ─────────────────────
// É o que permite o cruzamento orgânico × pago (custo por novo seguidor etc.).
async function igFetchAdSpend(accId, diag) {
  try {
    const j = await apiFetch(accId, 'insights', {
      fields: 'spend,reach,impressions', preset: 'last_28d',
    });
    const d = (j.data || [])[0] || {};
    return {
      spend: parseFloat(d.spend) || 0,
      adReach: parseInt(d.reach) || 0,
      adImpr: parseInt(d.impressions) || 0,
    };
  } catch (e) {
    diag.push({ step: 'insights de Ads (28d)', ok: false, msg: e.message });
    return {};
  }
}

// ── Histórico próprio (snapshots diários) ───────────────────────────────────

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

// ── Render ──────────────────────────────────────────────────────────────────

function igDeltaPill(delta, base) {
  if (delta == null) return '<span class="ig-delta na" title="histórico ainda insuficiente">—</span>';
  const pct = base > 0 ? ` (${(delta / base * 100).toFixed(1)}%)` : '';
  if (delta > 0) return `<span class="ig-delta up">▲ +${fmtN(delta)}${pct}</span>`;
  if (delta < 0) return `<span class="ig-delta down">▼ ${fmtN(delta)}${pct}</span>`;
  return '<span class="ig-delta flat">= 0</span>';
}

const igNA = title => `<span class="ig-delta na"${title ? ` title="${title}"` : ''}>—</span>`;

// Sparkline SVG a partir de uma lista de valores.
function igSparkVals(vals, title) {
  if (!vals || vals.length < 2) return '<span style="color:#ccc;font-size:11px;font-weight:700;">acumulando…</span>';
  const min = Math.min(...vals), max = Math.max(...vals), range = (max - min) || 1;
  const w = 90, h = 24;
  const pts = vals.map((v, i) =>
    `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - (v - min) / range * (h - 4)).toFixed(1)}`
  ).join(' ');
  return `<svg class="ig-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${title ? ` title="${title}"` : ''}>` +
    `<polyline points="${pts}" fill="none" stroke="#c13584" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// Tendência da unidade: usa a série diária de novos seguidores dos insights
// da Meta (28 dias, igual ao gráfico do Business Suite); se indisponível,
// cai para o histórico de snapshots do painel.
function igSpark(history, daily) {
  if (daily && daily.length >= 2) return igSparkVals(daily);
  const entries = Object.entries(history || {}).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-30);
  return igSparkVals(entries.map(e => e[1]));
}

// Painel de diagnóstico: mostra, unidade a unidade, qual caminho da API
// funcionou e o erro exato de cada tentativa que falhou. É o que permite
// descobrir rápido se o problema é permissão do token, conta sem IG
// vinculado ou métrica que a Meta não expõe mais.
function igRenderDiag() {
  const box = document.getElementById('ig-diag-body');
  if (!box) return;
  box.innerHTML = igLastResults.map(r => {
    const head = `<div class="ig-diag-unit">${r.name}` +
      (r.igid ? ` <span class="ig-diag-id">${r.source} · ${r.igid}${r.canInsights ? '' : ' · sem suporte a insights'}</span>` : '') +
      `</div>`;
    const lines = (r.diag || []).map(d =>
      `<div class="ig-diag-line ${d.ok ? 'ok' : 'bad'}">${d.ok ? '✓' : '✕'} ${d.step}${d.msg ? ' — ' + d.msg : ''}</div>`
    ).join('') || '<div class="ig-diag-line">sem registros</div>';
    return head + lines;
  }).join('');
}

function igToggleDiag() {
  const box = document.getElementById('ig-diag');
  if (!box) return;
  const open = box.classList.toggle('open');
  if (open) igRenderDiag();
  const btn = document.getElementById('ig-diag-btn');
  if (btn) btn.textContent = open ? '🔧 Ocultar diagnóstico' : '🔧 Diagnóstico da API';
}

async function igRefresh() {
  const tbody = document.getElementById('ig-tbody');
  const xbody = document.getElementById('ig-cross-tbody');
  const errEl = document.getElementById('ig-err');
  errEl.classList.remove('show');
  tbody.innerHTML = '<tr><td colspan="9" style="padding:40px;text-align:center;color:#bbb;font-weight:700;"><span class="spin"></span> Carregando contas de Instagram…</td></tr>';
  xbody.innerHTML = '<tr><td colspan="9" style="padding:40px;text-align:center;color:#bbb;font-weight:700;"><span class="spin"></span> Cruzando com o investimento…</td></tr>';

  // cada "Atualizar" recomeça do zero: se o token foi corrigido no meio do
  // caminho, os edges dados como mortos voltam a ser tentados.
  Object.keys(igEdgeFails).forEach(k => delete igEdgeFails[k]);

  // 1. histórico salvo (não é fatal se falhar — só perde os deltas)
  try { igStoreState = await storeGet(IG_FILE); } catch (e) { /* segue sem histórico */ }
  const hist = igStoreState.data || {};

  // 2. dados ao vivo, em lotes de 4 (mesmo padrão do Acompanhamento)
  const valid = ACCOUNTS.filter(a => a.id);
  const results = [];
  for (let i = 0; i < valid.length; i += 4) {
    const chunk = await Promise.all(valid.slice(i, i + 4).map(async acc => {
      const diag = [];
      const row = { ...acc, diag };
      try {
        const base = await igResolveIg(acc, diag);
        if (!base) throw new Error('nenhuma conta de Instagram vinculada a esta conta de anúncio');
        Object.assign(row, base);
        const [ins, ads] = await Promise.all([
          base.canInsights ? igFetchInsights(acc.id, base.igid, diag)
                           : Promise.resolve((diag.push({ step: 'insights', ok: false, msg: 'o nó antigo de Instagram não aceita /insights' }), {})),
          igFetchAdSpend(acc.id, diag),
        ]);
        Object.assign(row, ins, ads);
      } catch (e) {
        row.err = e.message;
        // mesmo sem IG, o investimento serve pro cruzamento
        Object.assign(row, await igFetchAdSpend(acc.id, diag));
      }
      return row;
    }));
    results.push(...chunk);
  }
  igLastResults = results;

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

  // 4. tabela de perfis + crescimento
  const d7 = igDaysAgo(7), d30 = igDaysAgo(30);
  let total = 0, count = 0, g7 = 0, g7n = 0, g30 = 0, g30n = 0;
  let tNew = 0, tNewN = 0, tUnf = 0, tUnfN = 0, tReach = 0, tReachN = 0;
  tbody.innerHTML = '';
  results.forEach(r => {
    const tr = document.createElement('tr');
    if (r.followers == null) {
      tr.innerHTML = `<td><span class="sname">${r.name}</span></td>
        <td colspan="8" class="cell-na" style="text-align:left;">${r.err || 'sem dados'}</td>`;
      tbody.appendChild(tr);
      return;
    }
    total += r.followers; count++;
    if (r.newFollows != null) { tNew += r.newFollows; tNewN++; }
    if (r.unfollows  != null) { tUnf += r.unfollows;  tUnfN++; }
    if (r.reach      != null) { tReach += r.reach;    tReachN++; }
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
      : igNA('primeiro registro é de hoje');
    const userLink = r.username
      ? `<a class="ig-user" href="https://instagram.com/${r.username}" target="_blank">@${r.username}</a>` : '';
    const insNA = r.canInsights ? 'insights indisponíveis para esta conta (ver diagnóstico)'
                                : 'esta conta usa o nó antigo de Instagram, que não expõe insights';
    const newLbl = r.newFollows != null
      ? `<span class="ig-delta up">▲ +${fmtN(r.newFollows)}</span>` : igNA(insNA);
    const unfLbl = r.unfollows != null
      ? `<span class="ig-delta down">▼ -${fmtN(r.unfollows)}</span>` : igNA(insNA);
    const net = (r.newFollows != null && r.unfollows != null) ? r.newFollows - r.unfollows : null;
    tr.innerHTML = `<td><span class="sname">${r.name}</span>${userLink}</td>
      <td class="num">${fmtN(r.followers)}</td>
      <td class="num">${newLbl}</td>
      <td class="num">${unfLbl}</td>
      <td class="num">${net != null ? igDeltaPill(net, r.followers - net) : igNA(insNA)}</td>
      <td class="num">${igDeltaPill(delta7, v7)}</td>
      <td class="num">${igDeltaPill(delta30, v30)}</td>
      <td>${igSpark(h, r.daily)}</td>
      <td class="num">${fmtN(r.media)}</td>`;
    tbody.appendChild(tr);
  });
  if (!tbody.children.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="padding:40px;text-align:center;color:#bbb;font-weight:700;">Nenhuma conta de Instagram encontrada.</td></tr>';
  }

  // 5. tabela de cruzamento: investimento × resultado orgânico (28d)
  let xSpend = 0, xNew = 0, xReach = 0, xVisits = 0, xInter = 0;
  xbody.innerHTML = '';
  results.forEach(r => {
    if (!r.spend && r.newFollows == null && r.reach == null) return;
    const spend = r.spend || 0;
    xSpend += spend;
    if (r.newFollows != null) xNew += r.newFollows;
    if (r.reach      != null) xReach += r.reach;
    if (r.profile_views    != null) xVisits += r.profile_views;
    if (r.total_interactions != null) xInter += r.total_interactions;
    const cpf = (spend > 0 && r.newFollows) ? spend / r.newFollows : null;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span class="sname">${r.name}</span>${r.username ? `<a class="ig-user" href="https://instagram.com/${r.username}" target="_blank">@${r.username}</a>` : ''}</td>
      <td class="num spend">${spend ? fmt(spend) : '—'}</td>
      <td class="num">${r.adReach != null ? fmtN(r.adReach) : '—'}</td>
      <td class="num">${r.reach != null ? fmtN(r.reach) : igNA('alcance do perfil indisponível')}</td>
      <td class="num">${r.views != null ? fmtN(r.views) : igNA('visualizações indisponíveis')}</td>
      <td class="num">${r.profile_views != null ? fmtN(r.profile_views) : igNA('visitas ao perfil indisponíveis')}</td>
      <td class="num">${r.total_interactions != null ? fmtN(r.total_interactions) : igNA('interações indisponíveis')}</td>
      <td class="num">${r.newFollows != null ? '<span class="ig-delta up">▲ +' + fmtN(r.newFollows) + '</span>' : igNA('novos seguidores indisponíveis')}</td>
      <td class="num">${cpf != null ? fmt(cpf) : '—'}</td>`;
    xbody.appendChild(tr);
  });
  if (!xbody.children.length) {
    xbody.innerHTML = '<tr><td colspan="9" style="padding:40px;text-align:center;color:#bbb;font-weight:700;">Sem investimento nem insights nos últimos 28 dias.</td></tr>';
  }

  // 6. cards
  document.getElementById('ig-total').textContent = fmtN(total);
  document.getElementById('ig-count').textContent = fmtN(count) + ' / ' + valid.length;
  document.getElementById('ig-new28').textContent = tNewN ? '+' + fmtN(tNew) : '—';
  document.getElementById('ig-unf28').textContent = tUnfN ? '-' + fmtN(tUnf) : '—';
  document.getElementById('ig-reach28').textContent = tReachN ? fmtN(tReach) : '—';
  document.getElementById('ig-new28-sub').textContent = tNewN ? `${tNewN} unidade${tNewN > 1 ? 's' : ''} com insights` : 'insights indisponíveis';
  document.getElementById('ig-unf28-sub').textContent = tUnfN ? `${tUnfN} unidade${tUnfN > 1 ? 's' : ''} com insights` : 'insights indisponíveis';
  document.getElementById('ig-reach28-sub').textContent = tReachN ? `${tReachN} unidade${tReachN > 1 ? 's' : ''} com insights` : 'insights indisponíveis';
  document.getElementById('ig-g7').textContent  = g7n  ? (g7  >= 0 ? '+' : '') + fmtN(g7)  : '—';
  document.getElementById('ig-g30').textContent = g30n ? (g30 >= 0 ? '+' : '') + fmtN(g30) : '—';
  document.getElementById('ig-g7-sub').textContent  = g7n  ? `${g7n} unidade${g7n > 1 ? 's' : ''} com histórico` : 'histórico em construção';
  document.getElementById('ig-g30-sub').textContent = g30n ? `${g30n} unidade${g30n > 1 ? 's' : ''} com histórico` : 'histórico em construção';

  document.getElementById('igx-spend').textContent  = fmt(xSpend);
  document.getElementById('igx-new').textContent    = xNew ? '+' + fmtN(xNew) : '—';
  document.getElementById('igx-cpf').textContent    = xNew ? fmt(xSpend / xNew) : '—';
  document.getElementById('igx-visits').textContent = xVisits ? fmtN(xVisits) : '—';

  // 7. aviso quando NENHUMA unidade conseguiu insights — quase sempre é o
  // token sem as permissões de Instagram.
  const withIg = results.filter(r => r.igid).length;
  if (withIg && !tNewN && !tReachN) {
    errEl.innerHTML = '⚠️ <b>Nenhuma unidade retornou Insights do Instagram.</b> ' +
      'Os seguidores ao vivo funcionam, mas as métricas de Insights exigem que o <code>META_TOKEN</code> ' +
      'tenha as permissões <code>instagram_basic</code>, <code>instagram_manage_insights</code> e ' +
      '<code>pages_read_engagement</code>, e que a conta de Instagram seja Profissional/Comercial. ' +
      'Abra o <b>Diagnóstico da API</b> abaixo pra ver o erro exato de cada unidade.';
    errEl.classList.add('show');
  }

  if (document.getElementById('ig-diag').classList.contains('open')) igRenderDiag();
  document.getElementById('ig-last-up').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
}

// ── Campanhas de Seguidores (Meta Ads) ──────────────────────────────────────
// Usa os helpers globais de objectives.js: fetchRelCampaigns, classifyObjective,
// getAct e A_ENG. Considera "campanha de seguidores" a que tem objetivo de
// engajamento OU nome com seguidor/perfil/follow, e soma as ações de follow
// reportadas pelos insights da Meta no período escolhido.

function igIsFollowerCampaign(c) {
  if (/seguidor|perfil|follow/i.test(c.name || '')) return true;
  return classifyObjective(c) === 'engaj';
}

// "Seguidores no Instagram" do Gerenciador: métrica lançada pela Meta em
// jul/2025 que (até a última verificação) NÃO é exposta na Marketing API —
// diagnóstico real mostrou que não existe nenhum action_type de follow nas
// respostas. Estratégia: tenta o campo dedicado instagram_follows (se a Meta
// liberar na API, passa a funcionar sozinho) e aceita action types com
// "follow" explícito. Curtidas de página (like/page_like) NÃO contam — são
// seguidores da página do Facebook, não do Instagram.
function igCampFollows(ins) {
  if (ins.instagram_follows != null) return Number(ins.instagram_follows) || 0;
  const acts = Array.isArray(ins.actions) ? ins.actions : [];
  return acts.filter(a => /follow/i.test(a.action_type || '') && !/unfollow/i.test(a.action_type || ''))
             .reduce((s, a) => s + (parseFloat(a.value) || 0), 0);
}

// Busca campanhas tentando incluir instagram_follows; a API v22 rejeita o
// campo ("is not valid for fields param" — verificado em produção), então o
// resultado do primeiro probe vale pro carregamento inteiro: se falhar, as
// demais contas vão direto pro fetcher padrão (objectives.js), sem ele.
let igFollowsFieldOk = null; // null = ainda não testado nesta sessão
async function igFetchCampaigns(id, preset) {
  if (igFollowsFieldOk !== false) {
    try {
      const j = await apiFetch(id, 'campaigns', {
        fields: 'name,status,objective,insights{spend,reach,actions,instagram_follows}',
        limit: 50, preset,
      });
      igFollowsFieldOk = true;
      return j.data || [];
    } catch (e) { igFollowsFieldOk = false; }
  }
  return fetchRelCampaigns(id, { preset });
}

async function igCampFetch() {
  const preset = document.getElementById('ig-camp-preset').value;
  const tbody = document.getElementById('ig-camp-tbody');
  tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:#bbb;font-weight:700;"><span class="spin"></span> Carregando campanhas…</td></tr>';

  const valid = ACCOUNTS.filter(a => a.id);
  const results = [];
  for (let i = 0; i < valid.length; i += 4) {
    const chunk = await Promise.all(valid.slice(i, i + 4).map(async acc => {
      try {
        const camps = (await igFetchCampaigns(acc.id, preset))
          .filter(igIsFollowerCampaign)
          .map(c => {
            const ins = c.insights?.data?.[0] || {};
            return {
              name: c.name,
              spend: parseFloat(ins.spend) || 0,
              follows: igCampFollows(ins),
              engagement: getAct(ins.actions, A_ENG),
              reach: parseInt(ins.reach) || 0,
            };
          })
          .filter(c => c.spend > 0);
        return { ...acc, camps };
      } catch (e) { return { ...acc, err: e.message, camps: [] }; }
    }));
    results.push(...chunk);
  }

  let tSpend = 0, tFollows = 0, tCount = 0;
  tbody.innerHTML = '';
  results.forEach(r => {
    if (!r.camps.length) return;
    const spend = r.camps.reduce((s, c) => s + c.spend, 0);
    const follows = r.camps.reduce((s, c) => s + c.follows, 0);
    const engagement = r.camps.reduce((s, c) => s + c.engagement, 0);
    const reach = r.camps.reduce((s, c) => s + c.reach, 0);
    tSpend += spend; tFollows += follows; tCount++;
    const names = r.camps.map(c =>
      `<div style="font-size:11px;color:#888;font-weight:600;">• ${c.name}</div>`).join('');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span class="sname">${r.name}</span></td>
      <td>${names}</td>
      <td class="num spend">${fmt(spend)}</td>
      <td class="num">${follows ? '<span class="ig-delta up">▲ +' + fmtN(follows) + '</span>' : '<span class="ig-delta na" title="a métrica \'Seguidores no Instagram\' existe no Gerenciador, mas a Meta ainda não a expõe na API">—</span>'}</td>
      <td class="num">${follows ? fmt(spend / follows) : '—'}</td>
      <td class="num">${fmtN(reach)}</td>
      <td class="num">${fmtN(engagement)}</td>`;
    tbody.appendChild(tr);
  });
  if (!tbody.children.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:#bbb;font-weight:700;">Nenhuma campanha de seguidores com investimento no período.</td></tr>';
  }

  document.getElementById('igc-spend').textContent   = fmt(tSpend);
  document.getElementById('igc-follows').textContent = tFollows ? '+' + fmtN(tFollows) : '—';
  document.getElementById('igc-cpf').textContent     = tFollows ? fmt(tSpend / tFollows) : '—';
  document.getElementById('igc-count').textContent   = fmtN(tCount) + ' / ' + valid.length;
  document.getElementById('ig-camp-last-up').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
}

function init_instagram() {
  paintTodayDate('ig-date');
  igRefresh().then(igCampFetch);
}
