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

// Busca a conta de IG de uma unidade. O caminho que funciona com o
// META_TOKEN atual é act_<id>/connected_instagram_accounts (retorna
// followers_count); instagram_accounts fica como fonte extra de candidatos
// (às vezes vem sem o nº de seguidores). Alguns campos (media_count) não
// existem em todas as combinações de edge/conta, então cada chamada tem
// fallback com menos campos, e por último consulta o nó do IG diretamente.
function igNorm(username, followers, media, igid) {
  return {
    username: username || null,
    followers: followers != null ? Number(followers) : null,
    media: media != null ? Number(media) : null,
    igid: igid || null,
  };
}
const igCount = ig => ig.followers_count != null ? ig.followers_count : ig.followed_by_count;

async function igFetchAccount(acc) {
  const errs = [];
  const candidates = [];
  const EDGES = [
    ['connected_instagram_accounts', ['username,followers_count,media_count', 'username,followers_count']],
    ['instagram_accounts',           ['username,followed_by_count,media_count', 'username,followed_by_count']],
  ];
  for (const [path, fieldsets] of EDGES) {
    for (const fields of fieldsets) {
      try {
        const j = await apiFetch(acc.id, path, { fields });
        (j.data || []).forEach(ig => candidates.push(ig));
        break; // esse fieldset funcionou; não precisa do reduzido
      } catch (e) { errs.push(e.message); }
    }
    const ok = candidates.find(ig => igCount(ig) != null);
    if (ok) return igNorm(ok.username, igCount(ok), ok.media_count, ok.id);
  }
  // achou a conta mas sem o nº de seguidores no edge: consulta o nó direto
  for (const ig of candidates) {
    if (!ig.id) continue;
    for (const fields of ['username,followers_count,media_count', 'username,followers_count']) {
      try {
        const d = await apiFetch(acc.id, '', { node: ig.id, fields });
        if (d.followers_count != null) return igNorm(d.username || ig.username, d.followers_count, d.media_count, ig.id);
        break;
      } catch (e) { errs.push(e.message); }
    }
  }
  if (candidates.length) return igNorm(candidates[0].username, null, candidates[0].media_count, candidates[0].id);
  // nada encontrado: mostra o erro da API se houve (ex.: permissão faltando
  // no token), senão a mensagem genérica
  throw new Error(errs.length ? errs[errs.length - 1] : 'sem Instagram vinculado');
}

// Insights do perfil (mesmos números da tela "Público → Tendências" do
// Business Suite), via /{ig-id}/insights. A API só disponibiliza os últimos
// 30 dias, então usa a janela de 28 dias como o Business Suite.
// - follower_count (period=day): novos seguidores por dia → série do gráfico
// - follows_and_unfollows (breakdown follow_type): total de "seguiram" e
//   "deixaram de seguir" na janela
async function igFetchInsights(acc, igid) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - 28 * 86400;
  const out = {};
  try {
    const j = await apiFetch(acc.id, '', {
      node: igid + '/insights', metric: 'follower_count', period: 'day', since, until,
    });
    const vals = (j.data?.[0]?.values || []).map(v => Number(v.value) || 0);
    if (vals.length) out.daily = vals;
  } catch (e) { /* segue sem a série diária */ }
  try {
    const j = await apiFetch(acc.id, '', {
      node: igid + '/insights', metric: 'follows_and_unfollows',
      metric_type: 'total_value', breakdown: 'follow_type', period: 'day', since, until,
    });
    const tv = j.data?.[0]?.total_value;
    const res = tv?.breakdowns?.[0]?.results || [];
    res.forEach(r => {
      const k = String((r.dimension_values || [])[0] || '');
      if (/unfollow/i.test(k)) out.unfollows = (out.unfollows || 0) + (Number(r.value) || 0);
      else if (/follow/i.test(k)) out.newFollows = (out.newFollows || 0) + (Number(r.value) || 0);
    });
    if (out.newFollows == null && tv?.value != null) out.newFollows = Number(tv.value) || 0;
  } catch (e) { /* segue sem follows/unfollows */ }
  // fallback: sem follows_and_unfollows, soma a série diária de novos seguidores
  if (out.newFollows == null && out.daily) out.newFollows = out.daily.reduce((a, b) => a + b, 0);
  return out;
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
      try {
        const base = await igFetchAccount(acc);
        const ins = base.igid ? await igFetchInsights(acc, base.igid) : {};
        return { ...acc, ...base, ...ins };
      }
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
  let tNew = 0, tNewN = 0, tUnf = 0, tUnfN = 0;
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
    const newLbl = r.newFollows != null
      ? `<span class="ig-delta up">▲ +${fmtN(r.newFollows)}</span>`
      : '<span class="ig-delta na" title="insights indisponíveis para esta conta">—</span>';
    const unfLbl = r.unfollows != null
      ? `<span class="ig-delta down">▼ -${fmtN(r.unfollows)}</span>`
      : '<span class="ig-delta na" title="insights indisponíveis para esta conta">—</span>';
    tr.innerHTML = `<td><span class="sname">${r.name}</span>${userLink}</td>
      <td class="num">${fmtN(r.followers)}</td>
      <td class="num">${newLbl}</td>
      <td class="num">${unfLbl}</td>
      <td class="num">${igDeltaPill(delta7, v7)}</td>
      <td class="num">${igDeltaPill(delta30, v30)}</td>
      <td class="num">${firstLbl}</td>
      <td>${igSpark(h, r.daily)}</td>
      <td class="num">${fmtN(r.media)}</td>`;
    tbody.appendChild(tr);
  });
  if (!tbody.children.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="padding:40px;text-align:center;color:#bbb;font-weight:700;">Nenhuma conta de Instagram encontrada.</td></tr>';
  }

  document.getElementById('ig-total').textContent = fmtN(total);
  document.getElementById('ig-count').textContent = fmtN(count) + ' / ' + valid.length;
  document.getElementById('ig-new28').textContent = tNewN ? '+' + fmtN(tNew) : '—';
  document.getElementById('ig-unf28').textContent = tUnfN ? '-' + fmtN(tUnf) : '—';
  document.getElementById('ig-new28-sub').textContent = tNewN ? `${tNewN} unidade${tNewN > 1 ? 's' : ''} com insights` : 'insights indisponíveis';
  document.getElementById('ig-unf28-sub').textContent = tUnfN ? `${tUnfN} unidade${tUnfN > 1 ? 's' : ''} com insights` : 'insights indisponíveis';
  document.getElementById('ig-g7').textContent  = g7n  ? (g7  >= 0 ? '+' : '') + fmtN(g7)  : '—';
  document.getElementById('ig-g30').textContent = g30n ? (g30 >= 0 ? '+' : '') + fmtN(g30) : '—';
  document.getElementById('ig-g7-sub').textContent  = g7n  ? `${g7n} unidade${g7n > 1 ? 's' : ''} com histórico` : 'histórico em construção';
  document.getElementById('ig-g30-sub').textContent = g30n ? `${g30n} unidade${g30n > 1 ? 's' : ''} com histórico` : 'histórico em construção';
  document.getElementById('ig-last-up').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
}

// ── Campanhas de Seguidores (Meta Ads) ──────────────────────────────────────
// Usa os helpers globais de objectives.js: fetchRelCampaigns, classifyObjective,
// getAct e A_FOLLOW/A_ENG. Considera "campanha de seguidores" a que tem
// objetivo de engajamento OU nome com seguidor/perfil/follow, e soma as ações
// de follow reportadas pelos insights da Meta no período escolhido.

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
