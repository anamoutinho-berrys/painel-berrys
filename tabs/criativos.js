// ============================================================================
// tabs/criativos.js — aba "Planejamento de Criativos".
// Board compartilhado, salvo em data/criativos.json no repo (via api/store.js
// + core.js: storeGet/storeSet). Sem login/permissão — qualquer um com o
// painel aberto pode editar e salvar.
// Depende de: core.js (ACCOUNTS, storeGet/storeSet, paintTodayDate)
// ============================================================================

const FORMATOS = ['Imagem', 'Vídeo', 'Carrossel', 'Reels/Stories'];
const STATUS   = ['Ideia', 'Em produção', 'Em aprovação', 'Aprovado', 'Publicado'];

let criativosStore = null; // { data: [...], sha }

function newCriativoId() {
  return 'c' + Math.random().toString(36).slice(2, 10);
}

function selectHTML(name, options, value) {
  return `<select class="sel" data-field="${name}">` +
    options.map(o => `<option value="${o}" ${o===value?'selected':''}>${o}</option>`).join('') +
    `</select>`;
}

function renderCriativos() {
  const tb = document.getElementById('criativos-body');
  if (!tb || !criativosStore) return;
  const items = criativosStore.data;
  if (!items.length) {
    tb.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#bbb;padding:24px;">Nenhum criativo planejado ainda. Clique em "Novo criativo".</td></tr>`;
    return;
  }
  tb.innerHTML = items.map(item => `
    <tr data-id="${item.id}">
      <td>${selectHTML('unidade', ['—', ...ACCOUNTS.map(a=>a.name)], item.unidade||'—')}</td>
      <td><input type="text" class="inp-m" style="width:160px;text-align:left;" data-field="nome" value="${(item.nome||'').replace(/"/g,'&quot;')}" placeholder="Nome do criativo"></td>
      <td>${selectHTML('formato', FORMATOS, item.formato||FORMATOS[0])}</td>
      <td>${selectHTML('status', STATUS, item.status||STATUS[0])}</td>
      <td><input type="date" data-field="data" value="${item.data||''}" style="padding:5px 8px;border:1.5px solid var(--b5);border-radius:7px;font-family:'Nunito',sans-serif;"></td>
      <td><input type="text" class="inp-m" style="width:110px;text-align:left;" data-field="resp" value="${(item.resp||'').replace(/"/g,'&quot;')}" placeholder="Quem"></td>
      <td><input type="text" class="inp-m" style="width:130px;text-align:left;" data-field="link" value="${(item.link||'').replace(/"/g,'&quot;')}" placeholder="URL"></td>
      <td><input type="text" class="inp-m" style="width:130px;text-align:left;" data-field="obs" value="${(item.obs||'').replace(/"/g,'&quot;')}" placeholder="Obs."></td>
      <td><button class="btn" style="background:#fff5f5;color:#e94560;padding:6px 10px;" onclick="removeCriativo('${item.id}')">🗑</button></td>
    </tr>
  `).join('');
  tb.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('change', onCriativoFieldChange);
  });
}

function onCriativoFieldChange(e) {
  const tr = e.target.closest('tr');
  const id = tr.dataset.id;
  const item = criativosStore.data.find(i => i.id === id);
  if (!item) return;
  item[e.target.dataset.field] = e.target.value;
}

function addCriativo() {
  if (!criativosStore) return;
  criativosStore.data.unshift({ id: newCriativoId(), unidade:'—', nome:'', formato:FORMATOS[0], status:STATUS[0], data:'', resp:'', link:'', obs:'' });
  renderCriativos();
}

function removeCriativo(id) {
  if (!criativosStore) return;
  criativosStore.data = criativosStore.data.filter(i => i.id !== id);
  renderCriativos();
}

async function saveCriativos() {
  if (!criativosStore) return;
  const eb = document.getElementById('criativos-err-banner');
  try {
    const r = await storeSet('criativos', criativosStore.data, criativosStore.sha);
    if (r.error) throw new Error(r.error);
    if (r.sha) criativosStore.sha = r.sha;
    document.getElementById('criativos-last-up').textContent = 'Salvo às ' + new Date().toLocaleTimeString('pt-BR');
    eb.classList.remove('show');
  } catch (e) {
    document.getElementById('criativos-err-msg').textContent = 'Não foi possível salvar: ' + e.message;
    eb.classList.add('show');
  }
}

async function loadCriativos() {
  const eb = document.getElementById('criativos-err-banner');
  try {
    const r = await storeGet('criativos');
    criativosStore = { data: r.data || [], sha: r.sha || null };
    eb.classList.remove('show');
  } catch (e) {
    criativosStore = { data: [], sha: null };
    document.getElementById('criativos-err-msg').textContent = 'Não foi possível carregar o histórico salvo: ' + e.message;
    eb.classList.add('show');
  }
  renderCriativos();
}

function init_criativos() {
  paintTodayDate('criativos-date-display');
  loadCriativos();
}
