// ============================================================================
// core.js — dados e utilitários COMPARTILHADOS por todas as abas.
// Só mexa aqui se a mudança precisa valer para o painel inteiro
// (lista de contas, autenticação com a API, formatação de número/moeda,
// ou os fetchers genéricos usados por Saldos + Acompanhamento + Campanhas).
// Qualquer coisa específica de UMA aba deve morar em tabs/<aba>.js.
// ============================================================================

const ACCOUNTS = [
  { name:"Berry's MOC Avenida",           id:"980007099641939",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=980007099641939", mensal:5000 },
  { name:"Berry's MOC Centro",             id:"26769229962779082", mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=26769229962779082", mensal:1000 },
  { name:"Berry's Goiânia Alto da Glória", id:"1572310324316523",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1572310324316523", mensal:1000 },
  { name:"Berry's Guanambi",               id:"3413870375457406",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=3413870375457406", mensal:1000 },
  { name:"Berry's Maceió",                 id:"3407509682745878",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=3407509682745878", mensal:1500 },
  { name:"Berry's Savassi",                id:"2571185629974578",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=2571185629974578", mensal:1500 }, // conta nova (boleto) — antiga: 385985127004742 (cartão)
{ name:"Berry's Luiz Eduardo Magalhães", id:"1302436505232971", mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1302436505232971", mensal:1000 },  { name:"Berry's Recife",                 id:"1320841319338526",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1320841319338526", card:true, mensal:1000 },
  { name:"Berry's Bocaiuva",               id:"1945459296360552",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1945459296360552", mensal:1000 },
  { name:"Berry's Campinas",               id:"815737430504184",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=815737430504184", mensal:1000 },
  { name:"Berry's Pirapora",               id:"898087053113777",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=898087053113777", mensal:1000 },
  { name:"Berry's Uberaba",                id:"2056137371779479",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=2056137371779479", mensal:1000 }, // conta nova — antiga: 5326782910767622
  { name:"Berry's Januária",               id:"1185830483132999",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1185830483132999", mensal:1000 },
  { name:"Berry's Aracaju",                id:"855614106933266",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=855614106933266", mensal:1000 },
  { name:"Berry's Salinas",                id:"1675046163715555",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1675046163715555", mensal:1000 },
  { name:"Berry's Contagem",               id:"1512851600567325",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1512851600567325", mensal:1000 },
  { name:"Berry's Janauba",                id:"988118436916274",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=988118436916274", mensal:1000 },
  { name:"Berry's MOC Shopping",           id:"3794589237361601",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=3794589237361601", mensal:1000 },
  { name:"Berry's Anápolis",               id:"547206184401772",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=547206184401772", mensal:1000 },
  { name:"Berry's Conquista",              id:"718790137924927",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=718790137924927", mensal:1000 },
  { name:"Berry's Feira de Santana",       id:"1715718849282094",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1715718849282094", mensal:1000 },
  { name:"Berry's Porto Seguro",           id:"505755245757325",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=505755245757325", mensal:600 },
  { name:"Berry's Lauro de Freitas",       id:"930248282851717",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=930248282851717", mensal:1000 },
  { name:"Berry's Salvador",               id:"1228370282243542",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1228370282243542", mensal:2000 },
  { name:"Berry's Balneário",              id:"364524186711060",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=364524186711060", mensal:1000 },
  { name:"Berry's Águas Claras",           id:"477466964832908",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=477466964832908", mensal:600 },
  { name:"Berry's Praia do Francês",       id:"973653235719636",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=973653235719636", mensal:2000 },
  { name:"Berry's BH Castelo",             id:"1665359047899564",  mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1665359047899564", mensal:2000 },
  { name:"Berry's Governador Valadares",   id:"807970628972520",   mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=807970628972520", mensal:2000 },
  { name:"Berry's ParkShopping Campo Grande", id:"1462162855666666", mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1462162855666666", mensal:1000 },
  { name:"Berry's Shopping Jardins Aracaju",  id:"1299333372282697", mgr:"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1299333372282697", mensal:1000 },
  // unidades novas ainda sem conta de anúncios criada — aparecem nos Saldos
  // como "sem conta"; assim que a conta sair, é só preencher id e mgr aqui.
  { name:"Berry's Shopping Riomar Aracaju", id:"", mensal:1000 },
  { name:"Berry's Shopping Tacaruna",       id:"", mensal:1000 },
  { name:"Berry's Capim Dourado Shopping",  id:"", mensal:1000 },
  { name:"Berry's RibeirãoShopping",        id:"", mensal:1000 },
  { name:"Berry's Divinópolis",             id:"" },
];


let fetchedData = {};

// Preenche qualquer elemento de "data de hoje" que exista na aba carregada
// (ids usados por diferentes abas: date-display, dash-date, rel-date-display)
function paintTodayDate(...ids) {
  const d = new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = d; });
}

const fmt   = (v,d=2) => v==null||isNaN(v) ? '—' : 'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtN  = v => v==null||isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR');
const fmtPct= v => v==null||isNaN(v) ? '—' : Number(v).toFixed(2)+'%';


async function apiFetch(account, path, params={}) {
  const qs = new URLSearchParams({ account, ...(path?{path}:{}), ...params });
  const r = await fetch(`/api/meta?${qs}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

// Persistência simples e compartilhada (sem banco): lê/grava data/<file>.json
// no repositório GitHub via api/store.js. Usado por Saldos (histórico de
// boletos) e Planejamento de Criativos.
async function storeGet(file) {
  const r = await fetch(`/api/store?file=${file}`);
  return r.json();
}
async function storeSet(file, data, sha) {
  const r = await fetch(`/api/store?file=${file}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, sha }),
  });
  return r.json();
}

// Extrai valor monetário de textos como "Saldo disponível (R$1.500,00)"
// ou "Available Balance (R$1,500.00)". Retorna null se não houver valor.

function parseMoney(str) {
  if (!str) return null;
  const m = String(str).match(/(?:R\$|BRL|US\$|\$)\s*([\d][\d.,]*)/);
  if (!m) return null;
  let s = m[1];
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > ld) s = s.replace(/\./g, '').replace(',', '.'); // formato pt-BR: 1.500,00
  else         s = s.replace(/,/g, '');                    // formato en-US: 1,500.00
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

// IMPORTANTE: a API da Meta NÃO tem campo numérico com o saldo pré-pago.
// - "balance" na conta = valor DEVIDO (fatura em aberto), não saldo disponível.
// - O nó funding_source não é acessível diretamente (erro de permissão).
// O saldo pré-pago (boletos pagos) só aparece em funding_source_details.display_string,
// ex.: "Saldo disponível (R$1.500,00)" — por isso lemos e interpretamos esse texto.
async function fetchBal(id) {
  const acct = await apiFetch(id, '', { fields: 'funding_source_details,is_prepay_account' });
  const fsd  = acct.funding_source_details || {};
  const v    = parseMoney(fsd.display_string);
  if (v != null) return { balance: v };
  if (acct.is_prepay_account === false) return { postpaid: true }; // conta pós-paga (cartão/fatura)
  if (!acct.funding_source_details) throw new Error('sem forma de pagamento');
  throw new Error('saldo não exposto: ' + (fsd.display_string || 'sem detalhe'));
}


async function fetchSpend(id, preset) {
  const params = { fields: 'spend' };
  if (preset === 'custom') {
    const s = document.getElementById('dt-since').value;
    const u = document.getElementById('dt-until').value;
    if (!s || !u) throw new Error('datas não preenchidas');
    params.time_range = JSON.stringify({since:s,until:u});
  } else {
    params.preset = preset;
  }
  const j = await apiFetch(id, 'insights', params);
  return j.data?.length ? (parseFloat(j.data[0].spend)||0) : 0;
}

async function fetchInsights(id, preset) {
  const j = await apiFetch(id, 'insights', { fields:'spend,impressions,reach,clicks,cpm,ctr,cpc', preset });
  if (!j.data?.length) return {};
  const d = j.data[0];
  return { spend:parseFloat(d.spend)||0, impressions:parseInt(d.impressions)||0, reach:parseInt(d.reach)||0,
           clicks:parseInt(d.clicks)||0, cpm:parseFloat(d.cpm)||0, ctr:parseFloat(d.ctr)||0, cpc:parseFloat(d.cpc)||0 };
}

async function fetchAccountData(id, preset, fields=[]) {
  const out = {};
  const proms = [];
  if (fields.includes('balance'))  proms.push(fetchBal(id).then(v=>Object.assign(out,v)).catch(e=>{out.balErr=e.message;}));
  if (fields.includes('spend'))    proms.push(fetchSpend(id,preset).then(v=>out.spend=v).catch(e=>out.spendErr=e.message));
  if (fields.includes('insights')) proms.push(fetchInsights(id,preset).then(v=>Object.assign(out,v)).catch(()=>{}));
  await Promise.all(proms);
  return out;
}


