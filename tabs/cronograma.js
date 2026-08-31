// ============================================================================
// tabs/cronograma.js — aba "Cronograma IG": aderência dos franqueados ao
// cronograma de postagens (4 reels + 3 estáticos por semana, liberados pela
// franqueadora). Aba independente — não compartilha lógica com relatorio.js
// nem brasil.js, só usa fmtN de core.js.
//
// Fonte dos dados: api/instagram.js (business_discovery do Graph API), lido
// a partir do @ de cada unidade. Não depende de conta de anúncios (ACCOUNTS),
// então cobre também unidades que ainda não têm conta Meta Ads configurada.
// ============================================================================

const CG_REELS_GOAL = 4;
const CG_POSTS_GOAL = 3;

// Lista de unidades x @ do Instagram, repassada pela Ana. Algumas observações:
// - "Berry's Conquista" foi informado com o mesmo @ de "Berry's Contagem"
//   (berryscontagem) — provavelmente um erro de preenchimento da planilha
//   original; mantido como veio, mas os dois vão aparecer com os MESMOS
//   números aqui até a Ana confirmar o @ correto da Conquista.
// - Unidades sem @ informado (Savassi antigo duplicado, Capim Dourado
//   Shopping) ficam de fora da lista e contam em "Sem cadastro de @".
const CG_UNITS = [
  { name: "Berry's MOC",                          user: 'berrysmoc' },
  { name: "Berry's Guanambi",                     user: 'berrysguanambi' },
  { name: "Berry's Salvador",                     user: 'berryssalvador' },
  { name: "Berry's Savassi",                      user: 'berryssavassi' },
  { name: "Berry's Maceió",                       user: 'berrysmaceio' },
  { name: "Berry's Campinas",                     user: 'berryscampinas' },
  { name: "Berry's Luiz Eduardo Magalhães",       user: 'berryslem' },
  { name: "Berry's Januária",                     user: 'berrysjanuaria' },
  { name: "Berry's Anápolis",                     user: 'berrysanapolis' },
  { name: "Berry's Balneário",                    user: 'berrysbalneariocamboriu' },
  { name: "Berry's Aracaju",                      user: 'berrysaracaju' },
  { name: "Berry's Bocaiuva",                     user: 'berrysbocaiuva' },
  { name: "Berry's Lauro de Freitas",             user: 'berryslaurodefreitas' },
  { name: "Berry's Pirapora",                     user: 'berryspirapora' },
  { name: "Berry's Recife",                       user: 'berrys.recife' },
  { name: "Berry's Salinas",                      user: 'berryssalinas' },
  { name: "Berry's Janaúba",                      user: 'berrys.janauba' },
  { name: "Berry's Contagem",                     user: 'berryscontagem' },
  { name: "Berry's Conquista",                    user: 'berryscontagem' }, // ver nota acima
  { name: "Berry's Feira de Santana",             user: 'berrysfeiradesantana' },
  { name: "Berry's Águas Claras",                 user: 'berrysaguasclaras' },
  { name: "Berry's Porto Seguro",                 user: 'berrysportoseguro' },
  { name: "Berry's Goiânia Alto da Glória",       user: 'berrysaltodagloria' },
  { name: "Berry's Uberaba",                      user: 'berrysuberaba' },
  { name: "Berry's Praia do Francês",             user: 'berryspraiadofrances' },
  { name: "Berry's BH Castelo",                   user: 'berrysbhcastelo' },
  { name: "Berry's Governador Valadares",         user: 'berrysvaladares' },
  { name: "Berry's ParkShopping Campo Grande",    user: 'berryscampogranderj' },
  { name: "Berry's Shopping Jardins Aracaju",     user: 'berrysjardinsaracaju' },
  { name: "Berry's Shopping Riomar Aracaju",      user: 'berrysriomararacaju' },
  { name: "Berry's Shopping Tacaruna",            user: 'berrysshoppingtacaruna' },
  { name: "Berry's RibeirãoShopping",             user: 'berrys.ribeiraoshopping' },
];

let cgData = [];
let cgSortKey = null;
let cgSortDesc = true;

function init_cronograma() {
  paintTodayDate('cg-date-display');
  cgFetch();
}

// Busca com concorrência limitada — 30 contas de uma vez bate em limite de
// rate do Graph API (business_discovery é ~200 chamadas/hora por conta).
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

function cgWindowStart() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function cgFetchUnit(unit) {
  try {
    const r = await fetch(`/api/instagram?username=${encodeURIComponent(unit.user)}`);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    const disc = j.business_discovery;
    if (!disc) throw new Error('conta não encontrada');
    const since = cgWindowStart();
    const media = disc.media?.data || [];
    let reels = 0, posts = 0;
    for (const m of media) {
      const ts = new Date(m.timestamp);
      if (ts < since) continue;
      if (m.media_product_type === 'REELS') reels++;
      else if (m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM') posts++;
    }
    return { ...unit, reels, posts, ok: true };
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

  const since = cgWindowStart();
  const until = new Date();
  document.getElementById('cg-window-lbl').textContent =
    `últimos 7 dias (${since.toLocaleDateString('pt-BR')} a ${until.toLocaleDateString('pt-BR')})`;

  try {
    cgData = await cgPool(CG_UNITS, cgFetchUnit, 4, (done, total) => {
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
  document.getElementById('cg-ok-reels').textContent = fmtN(ok.filter(u => u.reels >= CG_REELS_GOAL).length);
  document.getElementById('cg-ok-posts').textContent = fmtN(ok.filter(u => u.posts >= CG_POSTS_GOAL).length);
  document.getElementById('cg-no-handle').textContent = fmtN(ok.filter(u => !u.ok).length);

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
        <td>@${u.user}</td>
        <td class="r" colspan="2" style="color:var(--muted);">⚠️ ${u.error}</td>
        <td><span class="pill pill-unk">erro</span></td>
      </tr>`;
    }
    const reelsOk = u.reels >= CG_REELS_GOAL;
    const postsOk = u.posts >= CG_POSTS_GOAL;
    const bothOk = reelsOk && postsOk;
    return `<tr>
      <td class="sname">${u.name}</td>
      <td><a class="slink" href="https://instagram.com/${u.user}" target="_blank" rel="noopener">@${u.user}</a></td>
      <td class="r num ${reelsOk ? '' : 'spend-warn'}">${fmtN(u.reels)}</td>
      <td class="r num ${postsOk ? '' : 'spend-warn'}">${fmtN(u.posts)}</td>
      <td><span class="pill ${bothOk ? 'pill-card' : 'pill-unk'}" style="${bothOk ? 'background:var(--green);color:#fff;' : 'background:#FDECEC;color:#C5364C;'}">${bothOk ? '✓ em dia' : '⚠️ abaixo da meta'}</span></td>
    </tr>`;
  }).join('');
}
