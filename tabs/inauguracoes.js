// ============================================================================
// tabs/inauguracoes.js — Próximas Inaugurações
// Aba estática: a lista abaixo é a única fonte de dados. Para atualizar,
// edite INAUGURACOES — o resto (contagem regressiva, agrupamento por mês,
// destaque da próxima) é calculado sozinho a partir da data de hoje.
// ============================================================================

// data: 'AAAA-MM-DD' quando confirmada. Sem data → usar previsao (texto livre).
// ref:  data aproximada, só para ordenar as previsões entre si.
const INAUGURACOES = [
  { cidade: "Arraial d'Ajuda",   data: '2026-08-25' },
  { cidade: 'Caldas Novas',      data: '2026-09-03' },
  { cidade: 'Juiz de Fora',      data: '2026-09-10' },
  { cidade: 'Diamantina',        data: '2026-09-17' },
  { cidade: 'Sete Lagoas',       ref: '2026-09-24', previsao: 'Previsto para a semana seguinte à Diamantina' },
  { cidade: 'Porto de Galinhas', ref: '2026-09-30', previsao: 'Previsto para o fim de setembro / início de outubro' },
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

function init_inauguracoes() {
  const hoje = ingHoje();

  // Enriquece cada item com data resolvida + dias restantes
  const itens = INAUGURACOES.map(u => {
    const confirmada = !!u.data;
    const dt = ingParse(u.data || u.ref);
    return { ...u, confirmada, dt, dias: ingDiasAte(dt) };
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
