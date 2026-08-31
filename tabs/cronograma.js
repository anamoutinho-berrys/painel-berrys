// ============================================================================
// tabs/cronograma.js — aba "Cronograma IG": aderência dos franqueados ao
// cronograma de postagens (4 reels + 3 estáticos por semana, liberados pela
// franqueadora). Aba independente — não compartilha lógica com relatorio.js
// nem brasil.js, só usa apiFetch/fmtN de core.js.
//
// Fonte dos dados: a própria API da Meta, através da conta de anúncios de
// cada unidade (igual à extinta aba "Instagram" — ver histórico do git em
// tabs/instagram.js). NÃO usamos o campo "business_discovery" do Graph API
// (que deixaria puxar qualquer @ público direto) porque ele exige a
// permissão "Instagram Public Content Access", que nosso app não tem — dá
// erro "(#10) Application does not have permission for this action".
// Em vez disso, descobrimos a conta de Instagram vinculada à conta de
// anúncios (cgResolveIg) e lemos os posts dela — só funciona pra unidades
// que já têm conta de anúncios cadastrada em ACCOUNTS (assets/core.js).
// ============================================================================

// Meta semanal liberada pela franqueadora. Para períodos maiores que 7 dias
// (30 dias, mês) a meta usada na tabela é proporcional a esses valores —
// ver cgGoalsFor().
const CG_WEEKLY_REELS_GOAL = 4;
const CG_WEEKLY_POSTS_GOAL = 3;

// Unidade → id da conta de anúncios (mesmos ids de ACCOUNTS em core.js), que
// é o que permite descobrir a conta de Instagram vinculada. Unidades sem
// conta de anúncios ainda (adAccountId vazio) não dá pra monitorar por aqui
// — o @ conhecido (repassado pela Ana) fica só de referência na tabela.
// "Berry's Conquista" tem conta de anúncios própria (diferente da
// Contagem), então o @ dela é descoberto automaticamente pela API — não
// depende de nenhum @ digitado à mão.
const CG_UNITS = [
  { name: "Berry's MOC",                          adAccountId: '980007099641939' },
  { name: "Berry's Guanambi",                     adAccountId: '3413870375457406' },
  { name: "Berry's Salvador",                     adAccountId: '1228370282243542' },
  { name: "Berry's Savassi",                      adAccountId: '2571185629974578' },
  { name: "Berry's Maceió",                       adAccountId: '3407509682745878' },
  { name: "Berry's Campinas",                     adAccountId: '815737430504184' },
  { name: "Berry's Luiz Eduardo Magalhães",       adAccountId: '1302436505232971' },
  { name: "Berry's Januária",                     adAccountId: '1185830483132999' },
  { name: "Berry's Anápolis",                     adAccountId: '547206184401772' },
  { name: "Berry's Balneário",                    adAccountId: '364524186711060' },
  { name: "Berry's Aracaju",                      adAccountId: '855614106933266' },
  { name: "Berry's Bocaiuva",                     adAccountId: '1945459296360552' },
  { name: "Berry's Lauro de Freitas",             adAccountId: '930248282851717' },
  { name: "Berry's Pirapora",                     adAccountId: '898087053113777' },
  { name: "Berry's Recife",                       adAccountId: '1320841319338526' },
  { name: "Berry's Salinas",                      adAccountId: '1675046163715555' },
  { name: "Berry's Janaúba",                      adAccountId: '988118436916274' },
  { name: "Berry's Contagem",                     adAccountId: '1512851600567325' },
  { name: "Berry's Conquista",                    adAccountId: '718790137924927' },
  { name: "Berry's Feira de Santana",             adAccountId: '1715718849282094' },
  { name: "Berry's Águas Claras",                 adAccountId: '477466964832908' },
  { name: "Berry's Porto Seguro",                 adAccountId: '505755245757325' },
  { name: "Berry's Goiânia Alto da Glória",       adAccountId: '1572310324316523' },
  { name: "Berry's Uberaba",                      adAccountId: '2056137371779479' },
  { name: "Berry's Praia do Francês",             adAccountId: '973653235719636' },
  { name: "Berry's BH Castelo",                   adAccountId: '1665359047899564' },
  { name: "Berry's Governador Valadares",         adAccountId: '807970628972520' },
  { name: "Berry's ParkShopping Campo Grande",    adAccountId: '1462162855666666' },
  { name: "Berry's Shopping Jardins Aracaju",     adAccountId: '1299333372282697' },
  { name: "Berry's Shopping Riomar Aracaju",      adAccountId: '', knownUser: 'berrysriomararacaju' },
  { name: "Berry's Shopping Tacaruna",            adAccountId: '', knownUser: 'berrysshoppingtacaruna' },
  { name: "Berry's RibeirãoShopping",             adAccountId: '', knownUser: 'berrys.ribeiraoshopping' },
];

let cgData = [];
let cgSortKey = null;
let cgSortDesc = true;
let cgGoals = { reels: CG_WEEKLY_REELS_GOAL, posts: CG_WEEKLY_POSTS_GOAL };

// Alguns edges simplesmente não existem para o app/token em uso. Depois de
// falhar em 3 unidades, o edge é dado como morto e não é mais tentado nesta
// sessão — evita dezenas de requisições inúteis (mesma ideia da extinta
// aba Instagram).
const cgEdgeFails = {};
const cgEdgeDead = e => (cgEdgeFails[e] || 0) >= 3;
function cgEdgeFailed(edge) { cgEdgeFails[edge] = (cgEdgeFails[edge] || 0) + 1; }

function init_cronograma() {
  paintTodayDate('cg-date-display');
  cgFetch();
}

// Busca com concorrência limitada — várias contas de uma vez bate em limite
// de rate da Graph API.
async function cgPool(items, worker, concurrency = 4, onProgress) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

// Intervalo [since, until] (ambos com hora zerada) de acordo com o preset
// escolhido no seletor de período.
function cgRange(preset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let since, until = today;
  if (preset === 'last_30d') {
    since = new Date(today); since.setDate(since.getDate() - 29);
  } else if (preset === 'this_month') {
    since = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (preset === 'last_month') {
    since = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    until = new Date(today.getFullYear(), today.getMonth(), 0);
  } else { // last_7d (padrão)
    since = new Date(today); since.setDate(since.getDate() - 6);
  }
  const days = Math.round((until - since) / 86400000) + 1;
  return { since, until, days };
}

// Meta proporcional ao período: a meta oficial é semanal (4 reels + 3
// estáticos), então para janelas maiores multiplicamos pelo número de
// semanas equivalentes.
function cgGoalsFor(days) {
  const weeks = days / 7;
  return {
    reels: Math.max(1, Math.round(CG_WEEKLY_REELS_GOAL * weeks)),
    posts: Math.max(1, Math.round(CG_WEEKLY_POSTS_GOAL * weeks)),
  };
}

// Descobre a conta de Instagram vinculada à conta de anúncios, na mesma
// ordem de tentativas da extinta aba Instagram: (a) connected_instagram_accounts
// [nó IGUser, caminho preferido], (b) páginas → instagram_business_account,
// (c) instagram_accounts [nó antigo, último recurso].
async function cgResolveIg(adAccountId) {
  if (!cgEdgeDead('connected_instagram_accounts')) {
    try {
      const j = await apiFetch(adAccountId, 'connected_instagram_accounts', { fields: 'id,username' });
      const ig = (j.data || [])[0];
      if (ig) return ig;
    } catch (e) { cgEdgeFailed('connected_instagram_accounts'); }
  }

  for (const edge of ['promote_pages', 'assigned_pages']) {
    if (cgEdgeDead(edge)) continue;
    try {
      const j = await apiFetch(adAccountId, edge, {
        fields: 'id,name,instagram_business_account{id,username}', limit: 25,
      });
      const page = (j.data || []).find(p => p.instagram_business_account);
      if (page) return page.instagram_business_account;
    } catch (e) { cgEdgeFailed(edge); }
  }

  if (!cgEdgeDead('instagram_accounts')) {
    try {
      const j = await apiFetch(adAccountId, 'instagram_accounts', { fields: 'id,username' });
      const ig = (j.data || [])[0];
      if (ig) return ig;
    } catch (e) { cgEdgeFailed('instagram_accounts'); }
  }

  return null;
}

async function cgFetchUnit(unit, since) {
  if (!unit.adAccountId) {
    return { ...unit, ok: false, error: 'sem conta de anúncios cadastrada' + (unit.knownUser ? ` (@ conhecido: ${unit.knownUser})` : '') };
  }
  try {
    const ig = await cgResolveIg(unit.adAccountId);
    if (!ig) throw new Error('nenhuma conta de Instagram vinculada a essa conta de anúncios');
    const j = await apiFetch(unit.adAccountId, '', {
      node: ig.id + '/media', fields: 'media_type,media_product_type,timestamp', limit: 50,
    });
    const media = j.data || [];
    let reels = 0, posts = 0;
    for (const m of media) {
      const ts = new Date(m.timestamp);
      if (ts < since) continue;
      if (m.media_product_type === 'REELS') reels++;
      else if (m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM') posts++;
    }
    return { ...unit, username: ig.username, reels, posts, ok: true };
  } catch (e) {
    return { ...unit, ok: false, error: e.message };
  }
}

async function cgFetch() {
  document.getElementById('cg-err-banner').style.display = 'none';
  document.getElementById('cg-prog-wrap').style.display = 'block';
  const lbl = document.getElementById('cg-prog-lbl');
  const fill = document.getElementById('cg-prog-fill');
  fill.style.width = '0%';

  const preset = document.getElementById('cg-preset').value;
  const { since, until, days } = cgRange(preset);
  cgGoals = cgGoalsFor(days);

  document.getElementById('cg-window-lbl').textContent =
    `${since.toLocaleDateString('pt-BR')} a ${until.toLocaleDateString('pt-BR')} (${days} dias)`;
  document.getElementById('cg-goal-lbl').textContent = `${cgGoals.reels} reels + ${cgGoals.posts} estáticos`;
  document.getElementById('cg-goal-note').textContent =
    preset === 'last_7d' ? '' : '(proporcional à meta semanal de 4 reels + 3 estáticos)';
  document.getElementById('cg-ok-reels-sub').textContent = `≥ ${cgGoals.reels} reels no período`;
  document.getElementById('cg-ok-posts-sub').textContent = `≥ ${cgGoals.posts} estáticos no período`;

  try {
    cgData = await cgPool(CG_UNITS, u => cgFetchUnit(u, since), 4, (done, total) => {
      fill.style.width = Math.round((done / total) * 100) + '%';
      lbl.textContent = `Buscando dados… ${done}/${total} unidades`;
    });
  } catch (e) {
    document.getElementById('cg-err-banner').style.display = 'block';
    document.getElementById('cg-err-banner').textContent = '⚠️ ' + e.message;
  }

  document.getElementById('cg-prog-wrap').style.display = 'none';
  document.getElementById('cg-last-up').textContent =
    'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
  cgRender();
}

function cgSort(key) {
  if (cgSortKey === key) cgSortDesc = !cgSortDesc;
  else { cgSortKey = key; cgSortDesc = false; }
  cgRender();
}

function cgRender() {
  const ok = cgData.filter(u => u.ok);
  document.getElementById('cg-total-units').textContent = fmtN(cgData.length);
  document.getElementById('cg-ok-reels').textContent = fmtN(ok.filter(u => u.reels >= cgGoals.reels).length);
  document.getElementById('cg-ok-posts').textContent = fmtN(ok.filter(u => u.posts >= cgGoals.posts).length);
  document.getElementById('cg-no-handle').textContent = fmtN(cgData.filter(u => !u.ok).length);

  let rows = cgData.slice();
  ['arrow-reels', 'arrow-posts'].forEach(id => { const el = document.getElementById('cg-' + id); if (el) el.textContent = ''; });
  if (cgSortKey) {
    rows.sort((a, b) => {
      const av = a.ok ? a[cgSortKey] : -1, bv = b.ok ? b[cgSortKey] : -1;
      return cgSortDesc ? bv - av : av - bv;
    });
    const arrow = document.getElementById('cg-arrow-' + cgSortKey);
    if (arrow) arrow.textContent = cgSortDesc ? ' ▼' : ' ▲';
  }

  document.getElementById('cg-tbl-body').innerHTML = rows.map(u => {
    if (!u.ok) {
      return `<tr>
        <td class="sname">${u.name}</td>
        <td>${u.knownUser ? '@' + u.knownUser : '—'}</td>
        <td class="r" colspan="2" style="color:var(--muted);">⚠️ ${u.error}</td>
        <td><span class="pill pill-unk">erro</span></td>
      </tr>`;
    }
    const reelsOk = u.reels >= cgGoals.reels;
    const postsOk = u.posts >= cgGoals.posts;
    const bothOk = reelsOk && postsOk;
    return `<tr>
      <td class="sname">${u.name}</td>
      <td><a class="slink" href="https://instagram.com/${u.username}" target="_blank" rel="noopener">@${u.username}</a></td>
      <td class="r num ${reelsOk ? '' : 'spend-warn'}">${fmtN(u.reels)}</td>
      <td class="r num ${postsOk ? '' : 'spend-warn'}">${fmtN(u.posts)}</td>
      <td><span class="pill ${bothOk ? 'pill-card' : 'pill-unk'}" style="${bothOk ? 'background:var(--green);color:#fff;' : 'background:#FDECEC;color:#C5364C;'}">${bothOk ? '✓ em dia' : '⚠️ abaixo da meta'}</span></td>
    </tr>`;
  }).join('');
}
