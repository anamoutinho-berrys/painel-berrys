// ============================================================================
// tabs/instagram.js — lógica exclusiva da aba "Instagram".
// Depende de: core.js (ACCOUNTS, apiFetch, storeGet/storeSet, fmt/fmtN,
// paintTodayDate) e objectives.js (classifyObjective, getAct, A_ENG).
//
// Como funciona:
// 1. Para cada conta de anúncio, descobre a conta de Instagram vinculada
//    (igResolveIg) — de preferência o nó IGUser, que é o único que aceita
//    /insights.
// 2. Puxa os Insights do perfil (igFetchInsights) e os posts recentes
//    (igFetchRecentMedia): novos seguidores, deixaram de seguir, alcance,
//    visualizações, visitas ao perfil, interações, cliques no link e
//    postagens na janela — os mesmos números da tela "Insights → Público →
//    Tendências" do Business Suite. A API só disponibiliza os últimos 30
//    dias, então a janela (7/14/28 dias) é escolhida no painel.
// 3. VÁRIAS contas de anúncio podem promover o MESMO perfil de Instagram
//    (ex.: MOC Avenida/Centro/Shopping compartilham @berrysmoc) — pra não
//    contar os mesmos seguidores/alcance várias vezes, os agregados "de
//    rede" (cards do topo, ranking de crescimento, distribuição por região)
//    usam um registro por PERFIL (igUniqueProfiles); a tabela principal e as
//    campanhas continuam por CONTA DE ANÚNCIO, porque é isso que se cruza
//    com o investimento de cada uma.
// 4. Como a Meta NÃO fornece histórico retroativo de seguidores, a aba grava
//    um snapshot diário em data/instagram.json (via api/store.js) e calcula
//    o crescimento comparando com os snapshots anteriores.
// ============================================================================

const IG_FILE = 'instagram';
let IG_WINDOW_DAYS = 28;     // janela dos insights, escolhida no painel (máx. 30 — limite da API)
let igStoreState = { data: null, sha: null };
let igLastResults = [];      // linhas por CONTA DE ANÚNCIO da última atualização
let igLastHist = {};         // histórico de snapshots (chave = id da conta de anúncio)
let igRankExpanded = false;
let igCampSummary = { spend: 0, follows: 0, count: 0 };

function igDateStr(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function igDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return igDateStr(d); }

// ── Regiões (Norte/Nordeste/Centro-Oeste/Sudeste/Sul) ───────────────────────
// Classificação geográfica de cada UNIDADE (não vem da API da Meta — é
// inferida a partir da cidade/shopping no nome da conta de anúncio). Serve só
// pra agrupar visualmente (filtro e gráfico de distribuição por região).
// "Balneário" confirmado como Balneário Camboriú/SC (username
// berrysbalneariocamboriu); "ParkShopping Campo Grande" assume o shopping do
// Rio de Janeiro/RJ — vale confirmar com a Ana se algum desses bater errado.
const IG_REGION = {
  '980007099641939':   'Sudeste',      // MOC Avenida
  '26769229962779082': 'Sudeste',      // MOC Centro
  '3794589237361601':  'Sudeste',      // MOC Shopping
  '1572310324316523':  'Centro-Oeste', // Goiânia Alto da Glória
  '3413870375457406':  'Nordeste',     // Guanambi
  '3407509682745878':  'Nordeste',     // Maceió
  '2571185629974578':  'Sudeste',      // Savassi (BH)
  '1302436505232971':  'Nordeste',     // Luiz Eduardo Magalhães
  '1320841319338526':  'Nordeste',     // Recife
  '1945459296360552':  'Sudeste',      // Bocaiuva
  '815737430504184':   'Sudeste',      // Campinas
  '898087053113777':   'Sudeste',      // Pirapora
  '2056137371779479':  'Sudeste',      // Uberaba
  '1185830483132999':  'Sudeste',      // Januária
  '855614106933266':   'Nordeste',     // Aracaju
  '1675046163715555':  'Sudeste',      // Salinas
  '1512851600567325':  'Sudeste',      // Contagem
  '988118436916274':   'Sudeste',      // Janauba
  '547206184401772':   'Centro-Oeste', // Anápolis
  '718790137924927':   'Nordeste',     // Conquista
  '1715718849282094':  'Nordeste',     // Feira de Santana
  '505755245757325':   'Nordeste',     // Porto Seguro
  '930248282851717':   'Nordeste',     // Lauro de Freitas
  '1228370282243542':  'Nordeste',     // Salvador
  '364524186711060':   'Sul',          // Balneário (Camboriú, SC)
  '477466964832908':   'Centro-Oeste', // Águas Claras (DF)
  '973653235719636':   'Nordeste',     // Praia do Francês
  '1665359047899564':  'Sudeste',      // BH Castelo
  '807970628972520':   'Sudeste',      // Governador Valadares
  '1462162855666666':  'Sudeste',      // ParkShopping Campo Grande (RJ)
  '1299333372282697':  'Nordeste',     // Shopping Jardins Aracaju
};
function igRegionOf(id) { return IG_REGION[id] || 'Outras'; }
const igPerfilPlural = n => n === 1 ? 'perfil' : 'perfis';

const IG_STATUS_LABEL = {
  saudavel: { label: 'Saudável', cls: 'st-saudavel' },
  atencao:  { label: 'Atenção',  cls: 'st-atencao' },
  critico:  { label: 'Crítico',  cls: 'st-critico' },
  'sem-ig': { label: 'Sem IG',   cls: 'st-semig' },
};

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
// "website_clicks" (cliques no link do perfil) pode não estar mais exposto —
// se a Meta recusar, a coluna some com "—" como as outras métricas recusadas.
const IG_TOTAL_METRICS = ['reach', 'views', 'profile_views', 'total_interactions', 'website_clicks'];

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

async function igFetchInsights(accId, igid, since, until, diag) {
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

  // c) alcance, visualizações, visitas ao perfil, interações, cliques no link
  Object.assign(out, await igFetchTotals(accId, igid, since, until, diag));

  // fallback: sem follows_and_unfollows, soma a série diária de novos seguidores
  if (out.newFollows == null && out.daily) out.newFollows = out.daily.reduce((a, b) => a + b, 0);
  return out;
}

// Últimos posts do perfil, pra saber se está "parado" (sem postar há mais de
// 7 dias) e quantos posts entraram na janela escolhida. Limitado aos 12 mais
// recentes: suficiente pra flagrar unidade parada, mas subestima a contagem
// de quem posta com muita frequência.
async function igFetchRecentMedia(accId, igid, sinceTs, diag) {
  try {
    const j = await apiFetch(accId, '', { node: igid + '/media', fields: 'timestamp', limit: 12 });
    const stamps = (j.data || [])
      .map(m => Math.floor(new Date(m.timestamp).getTime() / 1000))
      .filter(t => !isNaN(t));
    const lastPostAt = stamps.length ? Math.max(...stamps) : null;
    const postsInWindow = stamps.filter(t => t >= sinceTs).length;
    diag.push({ step: 'media recente', ok: true, msg: `${stamps.length} post(s) lidos, ${postsInWindow} na janela` });
    return { lastPostAt, postsInWindow };
  } catch (e) {
    diag.push({ step: 'media recente', ok: false, msg: e.message });
    return {};
  }
}

// ── Perfis únicos (dedup) ────────────────────────────────────────────────────
// Várias contas de anúncio podem promover o mesmo perfil de Instagram.
// Marca, em cada linha, com quais outras unidades ela compartilha o perfil
// (pra mostrar na tabela) e devolve uma lista com um registro por perfil
// (pra somar seguidores/alcance/etc. sem contar o mesmo perfil 2x).
function igAnnotateShared(results) {
  const byIgid = {};
  results.forEach(r => { if (r.igid) (byIgid[r.igid] = byIgid[r.igid] || []).push(r); });
  Object.values(byIgid).forEach(group => {
    if (group.length > 1) group.forEach(r => { r.sharedWith = group.filter(x => x !== r).map(x => x.name); });
  });
}
function igUniqueProfiles(results) {
  const seen = new Map();
  results.forEach(r => {
    if (!r.igid || r.followers == null) return;
    if (!seen.has(r.igid)) seen.set(r.igid, { ...r, units: [r.name] });
    else seen.get(r.igid).units.push(r.name);
  });
  return Array.from(seen.values());
}
const igStripName = n => (n || '').replace(/^Berry's\s*/, '');
function igProfileLabel(p) {
  return (p.units && p.units.length > 1 ? p.units : [p.name]).map(igStripName).join(' / ');
}

// ── Crescimento e status calculados pelo painel ─────────────────────────────
// Não são métricas da Meta: são um critério do painel pra dar uma leitura
// rápida de saúde da unidade, a partir dos números reais já coletados.
function igComputeGrowthPct(r, delta30, v30) {
  if (delta30 != null && v30 > 0) return delta30 / v30 * 100;
  if (r.newFollows != null || r.unfollows != null) {
    const net = (r.newFollows || 0) - (r.unfollows || 0);
    if (!r.followers) return null;
    // sem histórico de 30 dias, isso é uma ESTIMATIVA (ações de follow do
    // período ÷ seguidores atuais) — sem uma base real ela pode passar de
    // 100% numa conta pequena com um pico de seguir/deixar de seguir, então
    // o valor fica limitado a ±100% pra não exibir um crescimento absurdo.
    return Math.max(-100, Math.min(100, net / r.followers * 100));
  }
  return null;
}
function igComputeStatus(r) {
  if (r.followers == null) return 'sem-ig';
  const g = r.growthPct;
  const stale = r.daysSincePost != null && r.daysSincePost > 7;
  if (g != null && g <= -5) return 'critico';
  if ((g != null && g < 2) || stale) return 'atencao';
  return 'saudavel';
}

// Valor do snapshot mais recente que seja <= data alvo (ou null se o
// histórico ainda não alcança essa data).
function igValueAt(history, targetDate) {
  let best = null;
  for (const d in history) if (d <= targetDate && (best === null || d > best)) best = d;
  return best !== null ? history[best] : null;
}

// ── Render: pills, sparkline, avisos ────────────────────────────────────────

function igPctPill(pct) {
  if (pct == null) return igNA('histórico insuficiente');
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const sign = pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : '= ';
  return `<span class="ig-delta ${cls}">${sign}${Math.abs(pct).toFixed(1)}%</span>`;
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
// da Meta; se indisponível, cai para o histórico de snapshots do painel.
function igSpark(history, daily) {
  if (daily && daily.length >= 2) return igSparkVals(daily);
  const entries = Object.entries(history || {}).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-30);
  return igSparkVals(entries.map(e => e[1]));
}

// Painel de diagnóstico: mostra, unidade a unidade, qual caminho da API
// funcionou e o erro exato de cada tentativa que falhou.
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

// ── Refresh principal ────────────────────────────────────────────────────────

async function igRefresh() {
  const winSel = document.getElementById('ig-window');
  IG_WINDOW_DAYS = winSel ? parseInt(winSel.value, 10) || 28 : 28;
  document.querySelectorAll('.ig-win-lbl').forEach(el => { el.textContent = IG_WINDOW_DAYS + 'd'; });

  const tbody = document.getElementById('ig-rank-tbody');
  const errEl = document.getElementById('ig-err');
  errEl.classList.remove('show');
  tbody.innerHTML = '<tr><td colspan="12" style="padding:40px;text-align:center;color:#bbb;font-weight:700;"><span class="spin"></span> Carregando contas de Instagram…</td></tr>';

  // cada "Atualizar" recomeça do zero: se o token foi corrigido no meio do
  // caminho, os edges dados como mortos voltam a ser tentados.
  Object.keys(igEdgeFails).forEach(k => delete igEdgeFails[k]);

  // histórico salvo (não é fatal se falhar — só perde os deltas)
  try { igStoreState = await storeGet(IG_FILE); } catch (e) { /* segue sem histórico */ }
  const hist = igStoreState.data || {};
  igLastHist = hist;

  const until = Math.floor(Date.now() / 1000);
  const since = until - IG_WINDOW_DAYS * 86400;

  // dados ao vivo, em lotes de 4 (mesmo padrão do Acompanhamento). Perfis
  // compartilhados por várias contas (ex.: MOC Avenida/Centro/Shopping) só
  // são buscados na Meta uma vez por atualização — as demais reaproveitam.
  const igDataCache = new Map(); // igid -> { ...insights, ...media }
  async function igFetchProfileData(accId, igid, diag) {
    if (igDataCache.has(igid)) {
      diag.push({ step: 'perfil compartilhado', ok: true, msg: 'reaproveitado de outra unidade com o mesmo Instagram' });
      return igDataCache.get(igid);
    }
    const [ins, media] = await Promise.all([
      igFetchInsights(accId, igid, since, until, diag),
      igFetchRecentMedia(accId, igid, since, diag),
    ]);
    const data = { ...ins, ...media };
    igDataCache.set(igid, data);
    return data;
  }

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
        if (base.canInsights) Object.assign(row, await igFetchProfileData(acc.id, base.igid, diag));
        else diag.push({ step: 'insights', ok: false, msg: 'o nó antigo de Instagram não aceita /insights' });
      } catch (e) { row.err = e.message; }
      return row;
    }));
    results.push(...chunk);
  }
  igAnnotateShared(results);

  // grava o snapshot de hoje (1 por dia por conta) se algo mudou
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

  // anota cada linha com dias desde o último post, crescimento e status
  const d30 = igDaysAgo(30);
  results.forEach(r => {
    if (r.followers == null) { r.status = 'sem-ig'; return; }
    r.daysSincePost = r.lastPostAt != null ? Math.floor((until - r.lastPostAt) / 86400) : null;
    const h = (hist[r.id] && hist[r.id].history) || {};
    const v30 = igValueAt(h, d30);
    r.v30 = v30;
    r.delta30 = v30 != null ? r.followers - v30 : null;
    r.growthPct = igComputeGrowthPct(r, r.delta30, v30);
    r.status = igComputeStatus(r);
  });

  igLastResults = results;
  const profiles = igUniqueProfiles(results);

  // KPIs de rede: somados por PERFIL único, não por conta de anúncio
  const d7 = igDaysAgo(7);
  let tFollowers = 0, tNew = 0, tNewN = 0, tUnf = 0, tUnfN = 0;
  let tReach = 0, tReachN = 0, tVisits = 0, tVisitsN = 0, tInter = 0, tInterN = 0, tClicks = 0, tClicksN = 0;
  profiles.forEach(r => {
    tFollowers += r.followers;
    if (r.newFollows != null) { tNew += r.newFollows; tNewN++; }
    if (r.unfollows  != null) { tUnf += r.unfollows;  tUnfN++; }
    if (r.reach      != null) { tReach += r.reach; tReachN++; }
    if (r.profile_views != null) { tVisits += r.profile_views; tVisitsN++; }
    if (r.total_interactions != null) { tInter += r.total_interactions; tInterN++; }
    if (r.website_clicks != null) { tClicks += r.website_clicks; tClicksN++; }
  });

  document.getElementById('ig-total').textContent = fmtN(tFollowers);
  document.getElementById('ig-count').textContent = fmtN(results.filter(r => r.followers != null).length) + ' / ' + valid.length;
  document.getElementById('ig-count-sub').textContent = `${profiles.length} ${igPerfilPlural(profiles.length)} único${profiles.length !== 1 ? 's' : ''} de Instagram`;
  document.getElementById('ig-new28').textContent = tNewN ? '+' + fmtN(tNew) : '—';
  document.getElementById('ig-unf28').textContent = tUnfN ? '-' + fmtN(tUnf) : '—';
  document.getElementById('ig-reach28').textContent = tReachN ? fmtN(tReach) : '—';
  document.getElementById('ig-inter28').textContent = tInterN ? fmtN(tInter) : '—';
  document.getElementById('ig-clicks28').textContent = tClicksN ? fmtN(tClicks) : '—';
  document.getElementById('ig-visits28').textContent = tVisitsN ? fmtN(tVisits) : '—';
  document.getElementById('ig-new28-sub').textContent = tNewN ? `${tNewN} ${igPerfilPlural(tNewN)} com insights` : 'insights indisponíveis';
  document.getElementById('ig-unf28-sub').textContent = tUnfN ? `${tUnfN} ${igPerfilPlural(tUnfN)} com insights` : 'insights indisponíveis';
  document.getElementById('ig-reach28-sub').textContent = tReachN ? `${tReachN} ${igPerfilPlural(tReachN)} com insights` : 'insights indisponíveis';
  document.getElementById('ig-inter28-sub').textContent = tInterN ? `${tInterN} ${igPerfilPlural(tInterN)} com insights` : 'insights indisponíveis';
  document.getElementById('ig-clicks28-sub').textContent = tClicksN ? `${tClicksN} ${igPerfilPlural(tClicksN)} com a métrica` : 'a Meta pode não expor esse clique';
  document.getElementById('ig-visits28-sub').textContent = tVisitsN ? `${tVisitsN} ${igPerfilPlural(tVisitsN)} com insights` : 'insights indisponíveis';
  document.getElementById('ig-last-up').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');

  // aviso quando NENHUM perfil retorna insights — quase sempre é o token
  // sem as permissões de Instagram.
  const withIg = results.filter(r => r.igid).length;
  if (withIg && !tNewN && !tReachN) {
    errEl.innerHTML = '⚠️ <b>Nenhum perfil retornou Insights do Instagram.</b> ' +
      'Os seguidores ao vivo funcionam, mas as métricas de Insights exigem que o <code>META_TOKEN</code> ' +
      'tenha as permissões <code>instagram_basic</code>, <code>instagram_manage_insights</code> e ' +
      '<code>pages_read_engagement</code>, e que a conta de Instagram seja Profissional/Comercial. ' +
      'Abra o <b>Diagnóstico da API</b> pra ver o erro exato de cada unidade.';
    errEl.classList.add('show');
  }

  igRenderRanking();
  igRenderAlerts();
  igRenderAnalysis();
  igRenderControlChips();
  if (document.getElementById('ig-diag').classList.contains('open')) igRenderDiag();
}

// ── Ranking e desempenho por unidade (por CONTA DE ANÚNCIO) ─────────────────

function igMatchesFilters(r) {
  const fRegion = document.getElementById('ig-f-region').value;
  if (fRegion !== 'todas' && igRegionOf(r.id) !== fRegion) return false;
  const pr = document.getElementById('ig-f-priority').value;
  if (pr === 'queda' && r.status !== 'critico') return false;
  if (pr === 'stale' && !(r.daysSincePost != null && r.daysSincePost > 7)) return false;
  if (pr === 'sem-ig' && r.followers != null) return false;
  if (pr === 'alto-crescimento' && !(r.growthPct != null && r.growthPct >= 15)) return false;
  if (pr === 'insights-indisp' && !(r.followers != null && r.newFollows == null && r.reach == null)) return false;
  const q = document.getElementById('ig-f-search').value.trim().toLowerCase();
  if (q && !(r.name.toLowerCase().includes(q) || (r.username || '').toLowerCase().includes(q))) return false;
  return true;
}

function igRankRow(r, rank) {
  const tr = document.createElement('tr');
  if (r.followers == null) {
    tr.innerHTML = `<td class="num">${rank}</td><td><span class="sname">${r.name}</span></td>
      <td colspan="10" class="cell-na" style="text-align:left;">${r.err || 'sem dados'}</td>`;
    return tr;
  }
  const userLink = r.username
    ? `<a class="ig-user" href="https://instagram.com/${r.username}" target="_blank">@${r.username}</a>` : '';
  const sharedBadge = r.sharedWith && r.sharedWith.length
    ? `<span class="ig-shared" title="mesmo perfil de Instagram de: ${r.sharedWith.join(', ')}">🔗 perfil compartilhado</span>` : '';
  const st = IG_STATUS_LABEL[r.status] || IG_STATUS_LABEL['sem-ig'];
  const hRec = (igLastHist[r.id] && igLastHist[r.id].history) || {};
  const postsLbl = r.postsInWindow != null
    ? fmtN(r.postsInWindow)
    : (r.media != null ? `<span title="total histórico da conta, sem dados da janela">${fmtN(r.media)}*</span>` : '—');
  tr.innerHTML = `
    <td class="num">${rank}</td>
    <td><span class="sname">${r.name}</span>${userLink}${sharedBadge}</td>
    <td>${igRegionOf(r.id)}</td>
    <td class="num">${fmtN(r.followers)}</td>
    <td class="num" title="compara com o snapshot de ~30 dias atrás (ou estimativa via Insights quando não há histórico)">${igPctPill(r.growthPct)}</td>
    <td class="num">${r.total_interactions != null ? fmtN(r.total_interactions) : igNA('indisponível')}</td>
    <td class="num">${r.reach != null ? fmtN(r.reach) : igNA('indisponível')}</td>
    <td class="num">${r.profile_views != null ? fmtN(r.profile_views) : igNA('indisponível')}</td>
    <td class="num">${r.website_clicks != null ? fmtN(r.website_clicks) : igNA('a Meta pode não expor esse clique')}</td>
    <td class="num">${postsLbl}</td>
    <td><span class="ig-pill ${st.cls}">${st.label}</span></td>
    <td>${igSpark(hRec, r.daily)}</td>`;
  return tr;
}

function igRenderRanking() {
  const tbody = document.getElementById('ig-rank-tbody');
  if (!tbody || !igLastResults.length) return;
  const fRegion = document.getElementById('ig-f-region').value;
  const pr = document.getElementById('ig-f-priority').value;
  const q = document.getElementById('ig-f-search').value.trim();
  const filtersActive = fRegion !== 'todas' || pr !== 'todas' || q !== '';

  let list = igLastResults.filter(igMatchesFilters)
    .sort((a, b) => (b.followers == null ? -1 : b.followers) - (a.followers == null ? -1 : a.followers));
  const total = list.length;
  if (!filtersActive && !igRankExpanded) list = list.slice(0, 10);

  tbody.innerHTML = '';
  list.forEach((r, i) => tbody.appendChild(igRankRow(r, i + 1)));
  if (!tbody.children.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="padding:40px;text-align:center;color:#bbb;font-weight:700;">Nenhuma unidade encontrada com esses filtros.</td></tr>';
  }

  const moreEl = document.getElementById('ig-rank-more');
  if (!filtersActive && total > 10) {
    moreEl.style.display = 'block';
    moreEl.textContent = igRankExpanded ? '↑ Mostrar só as 10 primeiras' : `↓ Ver todas as ${total} unidades`;
  } else {
    moreEl.style.display = 'none';
  }
  document.getElementById('ig-rank-count').textContent = filtersActive
    ? `${total} unidade${total !== 1 ? 's' : ''} (filtrado)`
    : `${total} unidade${total !== 1 ? 's' : ''}`;
}

function igToggleRankExpand() { igRankExpanded = !igRankExpanded; igRenderRanking(); }

function igExportCSV() {
  const rows = igLastResults.filter(igMatchesFilters);
  const header = ['Unidade', 'Usuario', 'Regiao', 'Seguidores', 'CrescPct', 'Interacoes', 'Alcance', 'VisitasPerfil', 'CliquesLink', 'Posts', 'Status'];
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [header.map(esc).join(';')];
  rows.forEach(r => {
    lines.push([
      r.name, r.username || '', igRegionOf(r.id), r.followers,
      r.growthPct != null ? r.growthPct.toFixed(1) : '',
      r.total_interactions, r.reach, r.profile_views, r.website_clicks,
      r.postsInWindow != null ? r.postsInWindow : r.media,
      (IG_STATUS_LABEL[r.status] || {}).label || '',
    ].map(esc).join(';'));
  });
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `instagram-berrys-${igDateStr(new Date())}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ── Controle das unidades (chips) ────────────────────────────────────────────

function igRenderControlChips() {
  if (!igLastResults.length) return;
  const profiles = igUniqueProfiles(igLastResults);
  const alto = profiles.filter(r => r.growthPct != null && r.growthPct >= 15).length;
  const critico = profiles.filter(r => r.status === 'critico').length;
  const semIg = igLastResults.filter(r => r.followers == null).length;
  const stale = profiles.filter(r => r.daysSincePost != null && r.daysSincePost > 7).length;
  const posts = profiles.reduce((s, r) => s + (r.postsInWindow || 0), 0);
  document.getElementById('igk-alto').textContent = fmtN(alto);
  document.getElementById('igk-queda').textContent = fmtN(critico);
  document.getElementById('igk-semig').textContent = fmtN(semIg);
  document.getElementById('igk-stale').textContent = fmtN(stale);
  document.getElementById('igk-posts').textContent = fmtN(posts);
  document.getElementById('igk-camp').textContent = fmtN(igCampSummary.count) + ' / ' + fmtN(igLastResults.length);
}

// ── Alertas e prioridades ────────────────────────────────────────────────────

function igBuildAlerts(results) {
  const profiles = igUniqueProfiles(results);
  const critico = profiles.filter(r => r.status === 'critico');
  const stale = profiles.filter(r => r.daysSincePost != null && r.daysSincePost > 7);
  const semIg = results.filter(r => r.followers == null);
  const alto = profiles.filter(r => r.growthPct != null && r.growthPct >= 15);
  const semInsights = profiles.filter(r => r.newFollows == null && r.reach == null);
  const items = [];
  if (critico.length) items.push({ type: 'queda', color: 'red', icon: '📉', title: 'Queda de seguidores',
    desc: `${critico.length} ${igPerfilPlural(critico.length)} com queda de 5% ou mais nos últimos ${IG_WINDOW_DAYS} dias.` });
  if (stale.length) items.push({ type: 'stale', color: 'orange', icon: '🗓️', title: 'Sem postagem recente',
    desc: `${stale.length} ${igPerfilPlural(stale.length)} sem postar há mais de 7 dias.` });
  if (semIg.length) items.push({ type: 'sem-ig', color: 'gray', icon: '🔗', title: 'Sem Instagram vinculado',
    desc: `${semIg.length} conta${semIg.length > 1 ? 's' : ''} de anúncio sem Instagram vinculado.` });
  if (semInsights.length) items.push({ type: 'insights-indisp', color: 'orange', icon: '⚠️', title: 'Insights indisponíveis',
    desc: `${semInsights.length} ${igPerfilPlural(semInsights.length)} com IG vinculado mas sem retorno de Insights — confira o Diagnóstico da API.` });
  if (alto.length) items.push({ type: 'alto-crescimento', color: 'green', icon: '🚀', title: 'Alto crescimento',
    desc: `${alto.length} ${igPerfilPlural(alto.length)} com crescimento acima de 15% — bons exemplos para a rede.` });
  return items;
}

function igRenderAlerts() {
  const box = document.getElementById('ig-alerts');
  if (!box) return;
  const items = igBuildAlerts(igLastResults);
  if (!items.length) { box.innerHTML = '<div class="ig-alert-ok">🎉 Nenhum alerta — tudo certo por aqui.</div>'; return; }
  box.innerHTML = items.map(it => `
    <div class="ig-alert ig-alert-${it.color}">
      <div class="ig-alert-ico">${it.icon}</div>
      <div class="ig-alert-body">
        <div class="ig-alert-title">${it.title}</div>
        <div class="ig-alert-desc">${it.desc}</div>
        <a href="#ig-rank-anchor" class="ig-alert-link" onclick="igApplyAlertFilter('${it.type}')">Ver unidades →</a>
      </div>
    </div>`).join('');
}

function igApplyAlertFilter(type) {
  document.getElementById('ig-f-priority').value = type;
  document.getElementById('ig-f-region').value = 'todas';
  document.getElementById('ig-f-search').value = '';
  igRankExpanded = true;
  igRenderRanking();
}

// ── Análise da rede: top 10 e distribuição por região ───────────────────────

function igTop10Html(sorted, getVal, fmtVal, allowNegativeWidth) {
  if (!sorted.length) return '<div class="ig-note" style="margin:0;">sem dados suficientes.</div>';
  const top5 = sorted.slice(0, 5);
  const max = Math.max(...top5.map(r => Math.abs(getVal(r))), 1);
  const row = (label, v, dim) => `<div class="i-bar-item">
      <div class="i-bar-label">${label}</div>
      <div class="i-bar-track"><div class="i-bar-fill" style="width:${Math.max(4, Math.abs(v) / max * 100)}%;${v < 0 && allowNegativeWidth ? 'background:var(--red);' : ''}${dim ? 'opacity:.6;' : ''}"></div></div>
      <div class="${allowNegativeWidth ? 'i-bar-pct' : 'i-bar-val'}">${fmtVal(v)}</div>
    </div>`;
  let html = top5.map((r, i) => row(`${i + 1}. ${igProfileLabel(r)}`, getVal(r), false)).join('');
  const rest = sorted.slice(5, 10);
  if (rest.length) {
    const aggVal = allowNegativeWidth
      ? rest.reduce((s, r) => s + getVal(r), 0) / rest.length
      : rest.reduce((s, r) => s + getVal(r), 0);
    html += row(`6-${5 + rest.length}. Outras unidades`, aggVal, true);
  }
  return html;
}

const IG_REGION_COLORS = { Nordeste: '#e94560', Sudeste: '#45B9E6', 'Centro-Oeste': '#f5a623', Sul: '#27ae60', Norte: '#9b59b6', Outras: '#bbb' };

function igDonutSvg(counts, total) {
  const R = 40, C = 2 * Math.PI * R;
  let offset = 0;
  const segs = Object.entries(counts).map(([region, n]) => {
    const dash = (n / total) * C;
    const seg = `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${IG_REGION_COLORS[region] || '#bbb'}"
      stroke-width="16" stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 50 50)"/>`;
    offset += dash;
    return seg;
  }).join('');
  return `<svg width="120" height="120" viewBox="0 0 100 100">${segs}
    <text x="50" y="47" text-anchor="middle" font-family="'Bebas Neue',cursive" font-size="20" fill="#0D2E3F">${total}</text>
    <text x="50" y="61" text-anchor="middle" font-size="7" fill="#999" font-weight="700">unidades</text>
  </svg>`;
}
function igDonutLegend(counts, total) {
  return '<div class="ig-donut-legend">' + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([region, n]) =>
    `<div class="ig-legend-row"><span class="ig-legend-dot" style="background:${IG_REGION_COLORS[region] || '#bbb'}"></span>
      ${region} <b>${n}</b> <span class="ig-legend-pct">(${(n / total * 100).toFixed(1)}%)</span></div>`
  ).join('') + '</div>';
}

function igRenderAnalysis() {
  const profiles = igUniqueProfiles(igLastResults);
  const byGrowth = profiles.filter(r => r.growthPct != null).sort((a, b) => b.growthPct - a.growthPct);
  const byInter = profiles.filter(r => r.total_interactions != null).sort((a, b) => b.total_interactions - a.total_interactions);

  const gEl = document.getElementById('ig-top-growth');
  if (gEl) gEl.innerHTML = igTop10Html(byGrowth, r => r.growthPct, v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%', true);
  const iEl = document.getElementById('ig-top-inter');
  if (iEl) iEl.innerHTML = igTop10Html(byInter, r => r.total_interactions, v => fmtN(v), false);

  const counts = {};
  profiles.forEach(r => { const g = igRegionOf(r.id); counts[g] = (counts[g] || 0) + 1; });
  const donutEl = document.getElementById('ig-region-donut');
  if (donutEl) {
    if (!profiles.length) donutEl.innerHTML = '<div class="ig-note" style="margin:0;">sem dados suficientes.</div>';
    else donutEl.innerHTML = `<div class="ig-donut-wrap">${igDonutSvg(counts, profiles.length)}${igDonutLegend(counts, profiles.length)}</div>`;
  }
}

// ── Dica do dia ──────────────────────────────────────────────────────────────

const IG_TIPS = [
  'Unidades que publicam pelo menos 4 vezes por semana costumam ter mais interações do que as que postam menos.',
  'Responder comentários rapidamente ajuda o Instagram a entender que o perfil está ativo, o que favorece o alcance orgânico.',
  'Stories com enquete ou caixinha de pergunta tendem a gerar mais visitas ao perfil.',
  'Cruze a coluna "Cresc." com o investimento nas campanhas de seguidores pra achar as unidades com melhor custo por seguidor.',
  'Unidades "sem postagem recente" tendem a perder alcance mesmo com Ads ativos — vale um lembrete pro time local.',
];
function igTipOfDay() {
  const day = Math.floor(Date.now() / 86400000);
  return IG_TIPS[day % IG_TIPS.length];
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

  igCampSummary = { spend: tSpend, follows: tFollows, count: tCount };
  document.getElementById('igc-spend').textContent   = fmt(tSpend);
  document.getElementById('igc-follows').textContent = tFollows ? '+' + fmtN(tFollows) : '—';
  document.getElementById('igc-cpf').textContent     = tFollows ? fmt(tSpend / tFollows) : '—';
  document.getElementById('igc-count').textContent   = fmtN(tCount) + ' / ' + valid.length;
  document.getElementById('ig-camp-last-up').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
  igRenderControlChips();
}

// ── Inicialização ────────────────────────────────────────────────────────────

async function igRefreshAll() {
  await igRefresh();
  await igCampFetch();
}

function init_instagram() {
  paintTodayDate('ig-date');
  const tipEl = document.getElementById('ig-tip');
  if (tipEl) tipEl.innerHTML = `<div class="tip-h">💡 Dica do dia</div>${igTipOfDay()}`;
  igRefreshAll();
}
