// ============================================================================
// tabs/inauguracoes.js — Próximas Inaugurações
// A lista fica salva em data/inauguracoes.json (via api/store.js, mesmo
// mecanismo usado pelo histórico de boletos). INAUGURACOES_SEED abaixo só
// serve de valor inicial da primeira vez que ninguém salvou nada ainda —
// depois disso a fonte de verdade é o arquivo salvo, editável pelo botão
// "Editar" da própria aba (contagem regressiva, agrupamento por mês,
// destaque da próxima) é calculado sozinho a partir da data de hoje.
// ============================================================================

// data: 'AAAA-MM-DD' quando confirmada. Sem data → usar previsao (texto livre).
// ref:  data aproximada, só para ordenar as previsões entre si.
const INAUGURACOES_SEED = [
  { cidade: "Arraial d'Ajuda",   data: '2026-08-25' },
  { cidade: 'Caldas Novas',      data: '2026-09-03' },
  { cidade: 'Juiz de Fora',      data: '2026-09-10' },
  { cidade: 'Diamantina',        data: '2026-09-24' },
  { cidade: 'Sete Lagoas',       ref: '2026-10-01', previsao: 'Previsto para a semana seguinte à Diamantina' },
  { cidade: 'Porto de Galinhas', ref: '2026-10-05', previsao: 'Previsto para o fim de setembro / início de outubro' },
  { cidade: 'Natal',             ref: '2026-10-15', previsao: 'Previsto para outubro' },
];

const ING_MESES = ['janeiro','fevereiro','março','abril','maio','junho',
                   'julho','agosto','setembro','outubro','novembro','dezembro'];
const ING_MES_CURTO = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const ING_DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

// 'AAAA-MM-DD' -> Date local à meia-noite (evita o deslocamento de fuso do
// construtor com string ISO, que interpreta como UTC)
function ingParse(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function ingHoje() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function ingDiasAte(dt) {
  return Math.round((dt - ingHoje()) / 86400000);
}

// { list: [...], sha: null|string } — lista carregada do backend (ou do seed
// enquanto nada foi carregado ainda) + sha do arquivo pra permitir salvar.
let ingState = null;
let ingEditing = false;

async function init_inauguracoes() {
  if (!ingState) {
    try {
      const r = await storeGet('inauguracoes');
      ingState = { list: (r.data && r.data.length) ? r.data : INAUGURACOES_SEED, sha: r.sha || null };
    } catch (e) {
      ingState = { list: INAUGURACOES_SEED, sha: null };
    }
  }
  ingRender();
}

function ingRender() {
  const hoje = ingHoje();

  // Enriquece cada item com data resolvida + dias restantes
  const itens = ingState.list.map((u, idx) => {
    const confirmada = !!u.data;
    const dt = ingParse(u.data || u.ref);
    return { ...u, idx, confirmada, dt, dias: ingDiasAte(dt) };
  }).sort((a, b) => a.dt - b.dt);

  // A "próxima" é a primeira confirmada que ainda não aconteceu
  const proxima = itens.find(u => u.confirmada && u.dias >= 0);

  // ── Estatísticas do hero ──
  const futuras = itens.filter(u => u.dias >= 0);
  const stats = [
    { val: futuras.length, lbl: 'unidades a caminho' },
    { val: itens.filter(u => u.confirmada && u.dias >= 0).length, lbl: 'com data confirmada' },
  ];
  if (proxima) {
    stats.unshift({
      val: proxima.dias === 0 ? 'Hoje!' : proxima.dias,
      lbl: proxima.dias === 0 ? proxima.cidade : (proxima.dias === 1 ? 'dia p/ a próxima' : 'dias p/ a próxima'),
    });
  }
  document.getElementById('ing-stats').innerHTML = stats.map(s => `
    <div class="ing-stat">
      <div class="st-val">${s.val}</div>
      <div class="st-lbl">${s.lbl}</div>
    </div>`).join('');

  if (ingEditing) { ingRenderEdit(); return; }

  const editBtn = document.getElementById('ing-edit-toggle');
  if (editBtn) editBtn.textContent = '✏️ Editar inaugurações';
  document.getElementById('ing-edit-panel').innerHTML = '';
  document.getElementById('ing-edit-panel').style.display = 'none';
  document.getElementById('ing-list').style.display = '';

  // ── Agrupamento: confirmadas por mês, previsões no fim ──
  const grupos = [];
  const porMes = new Map();
  itens.filter(u => u.confirmada).forEach(u => {
    const chave = `${u.dt.getFullYear()}-${u.dt.getMonth()}`;
    if (!porMes.has(chave)) {
      const g = { titulo: `${ING_MESES[u.dt.getMonth()]} ${u.dt.getFullYear()}`, itens: [] };
      porMes.set(chave, g);
      grupos.push(g);
    }
    porMes.get(chave).itens.push(u);
  });
  const previsoes = itens.filter(u => !u.confirmada);
  if (previsoes.length) grupos.push({ titulo: 'Datas a confirmar', itens: previsoes });

  if (!itens.length) {
    document.getElementById('ing-list').innerHTML = `
      <div class="ing-empty">Nenhuma inauguração cadastrada ainda. Clique em
      "Editar inaugurações" para adicionar a primeira.</div>`;
    return;
  }

  document.getElementById('ing-list').innerHTML = grupos.map(g => `
    <div class="ing-month">
      <div class="m-name">${g.titulo}</div>
      <div class="m-line"></div>
      <div class="m-count">${g.itens.length} ${g.itens.length === 1 ? 'unidade' : 'unidades'}</div>
    </div>
    <div class="ing-track">
      ${g.itens.map((u, i) => ingCard(u, u === proxima, i)).join('')}
    </div>`).join('');
}

function ingCard(u, ehProxima, i) {
  const cls = ['ing-card'];
  if (!u.confirmada) cls.push('tbd');
  if (ehProxima) cls.push('next');

  // Bloco da data (ou "a definir")
  const dataBox = u.confirmada ? `
    <div class="ing-date">
      <div class="d-day">${String(u.dt.getDate()).padStart(2, '0')}</div>
      <div class="d-mon">${ING_MES_CURTO[u.dt.getMonth()]}</div>
      <div class="d-wd">${ING_DIAS[u.dt.getDay()]}</div>
    </div>`
    : `<div class="ing-date tbd"><div class="d-day">A<br>definir</div></div>`;

  // Contagem regressiva / estado
  let contagem;
  if (!u.confirmada) {
    contagem = `<span class="c-badge tbd">Previsão</span>`;
  } else if (u.dias < 0) {
    contagem = `<span class="c-badge">✓ Inaugurada</span>`;
  } else if (u.dias === 0) {
    contagem = `<span class="c-badge">🎉 É hoje!</span>`;
  } else {
    contagem = `<div class="c-num">${u.dias}</div>
                <div class="c-lbl">${u.dias === 1 ? 'dia' : 'dias'}</div>`;
  }
  const contCls = 'ing-count' + (u.confirmada && u.dias >= 0 && u.dias <= 7 ? ' soon' : '');

  return `
    <div class="${cls.join(' ')}" style="animation-delay:${(i * .06).toFixed(2)}s">
      ${ehProxima ? '<div class="ing-next-tag">Próxima inauguração</div>' : ''}
      ${dataBox}
      <div class="ing-info">
        <div class="ing-city">${u.cidade}</div>
        ${u.previsao ? `<div class="ing-note">${u.previsao}</div>` : ''}
      </div>
      <div class="${contCls}">${contagem}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Edição — botão "Editar inaugurações" abre um formulário simples, direto
// na própria aba, pra adicionar/editar/remover cidades. Salvar grava em
// data/inauguracoes.json via api/store.js (mesmo mecanismo dos boletos).
// ─────────────────────────────────────────────────────────────────────────

function ingToggleEdit() {
  ingEditing = !ingEditing;
  const editBtn = document.getElementById('ing-edit-toggle');
  if (editBtn) editBtn.textContent = ingEditing ? '✕ Fechar edição' : '✏️ Editar inaugurações';
  ingRender();
}

function ingRenderEdit() {
  document.getElementById('ing-list').style.display = 'none';
  const panel = document.getElementById('ing-edit-panel');
  panel.style.display = '';

  const rows = ingState.list.map((u, idx) => `
    <div class="ing-erow" data-idx="${idx}">
      <input class="ing-ein cidade" type="text" placeholder="Cidade / unidade" value="${(u.cidade || '').replace(/"/g,'&quot;')}">
      <div class="ing-efield">
        <label>Data confirmada</label>
        <input class="ing-ein data" type="date" value="${u.data || ''}">
      </div>
      <div class="ing-efield">
        <label>Previsão (texto)</label>
        <input class="ing-ein previsao" type="text" placeholder="Ex.: previsto para outubro" value="${(u.previsao || '').replace(/"/g,'&quot;')}">
      </div>
      <div class="ing-efield">
        <label>Ref. p/ ordenar</label>
        <input class="ing-ein ref" type="date" value="${u.ref || ''}">
      </div>
      <button class="ing-erm" title="Remover" onclick="ingRemoveRow(${idx})">🗑️</button>
    </div>`).join('');

  panel.innerHTML = `
    <div class="ing-eform">
      <div class="ing-ehead">
        <span>Cidade</span><span>Data confirmada</span><span>Previsão</span><span>Ref. p/ ordenar</span><span></span>
      </div>
      ${rows || '<div class="ing-empty">Nenhuma inauguração cadastrada. Clique em "+ Adicionar" abaixo.</div>'}
      <div class="ing-eactions">
        <button class="ing-ebtn ghost" onclick="ingAddRow()">+ Adicionar inauguração</button>
        <div class="ing-eactions-right">
          <button class="ing-ebtn ghost" onclick="ingToggleEdit()">Cancelar</button>
          <button class="ing-ebtn primary" id="ing-save-btn" onclick="ingSaveEdits()">Salvar</button>
        </div>
      </div>
      <div class="ing-ehint">Preencha <strong>Data confirmada</strong> quando já houver data fechada, ou
      <strong>Previsão</strong> (texto livre) + <strong>Ref.</strong> (data aproximada, só pra ordenar) quando ainda não tiver data.</div>
    </div>`;
}

function ingAddRow() {
  ingState.list.push({ cidade: '', data: '', previsao: '', ref: '' });
  ingRenderEdit();
}

function ingRemoveRow(idx) {
  ingState.list.splice(idx, 1);
  ingRenderEdit();
}

function ingCollectRows() {
  return [...document.querySelectorAll('.ing-erow')].map(row => {
    const cidade   = row.querySelector('.cidade').value.trim();
    const data     = row.querySelector('.data').value.trim();
    const previsao = row.querySelector('.previsao').value.trim();
    const ref      = row.querySelector('.ref').value.trim();
    const item = { cidade };
    if (data) item.data = data;
    if (!data && ref) item.ref = ref;
    if (previsao) item.previsao = previsao;
    return item;
  }).filter(u => u.cidade && (u.data || u.ref));
}

async function ingSaveEdits() {
  const list = ingCollectRows();
  const btn = document.getElementById('ing-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
  try {
    const r = await storeSet('inauguracoes', list, ingState.sha);
    if (r.error) throw new Error(r.error);
    ingState = { list, sha: r.sha || ingState.sha };
    ingEditing = false;
    ingRender();
  } catch (e) {
    alert('Não foi possível salvar: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  }
}
