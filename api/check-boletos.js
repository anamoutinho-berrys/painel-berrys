// ============================================================================
// api/check-boletos.js — checagem diária automática de compensação de boleto.
//
// Roda sozinho todo dia via Vercel Cron (ver vercel.json), sem depender de
// alguém abrir o painel. Reproduz no servidor a mesma lógica de detecção que
// tabs/saldos.js faz no navegador (checkBoletoPayment): busca o "saldo
// disponível" de cada conta na Meta, compara com o último valor salvo em
// data/boleto-log.json e, se subir >= BOLETO_JUMP_MIN, registra a data de
// hoje como pagamento detectado.
//
// Variáveis de ambiente necessárias (Vercel), além das já usadas por
// api/meta.js e api/store.js:
//   CRON_SECRET — opcional; se definido, só aceita chamadas com header
//                 "Authorization: Bearer <CRON_SECRET>" (é isso que a
//                 Vercel envia automaticamente nas execuções de cron).
//
// IMPORTANTE: a lista ACCOUNT_IDS abaixo precisa ser mantida em sincronia
// com ACCOUNTS em assets/core.js (só as contas com id e sem `card:true`,
// já que contas "cartão" não têm saldo pré-pago pra monitorar).
// ============================================================================

const ACCOUNT_IDS = [
  '980007099641939', '26769229962779082', '1572310324316523', '3413870375457406',
  '3407509682745878', '1302436505232971', '1945459296360552', '815737430504184',
  '898087053113777', '5326782910767622', '1185830483132999', '855614106933266',
  '1675046163715555', '1512851600567325', '988118436916274', '3794589237361601',
  '547206184401772', '718790137924927', '1715718849282094', '505755245757325',
  '930248282851717', '1228370282243542', '364524186711060', '477466964832908',
];

const BOLETO_JUMP_MIN = 10; // R$ mínimo de aumento pra contar como pagamento (evita ruído)

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

async function fetchBalance(id, token) {
  const params = new URLSearchParams({ access_token: token, fields: 'funding_source_details,is_prepay_account' });
  const r = await fetch(`https://graph.facebook.com/v22.0/act_${id}?${params}`);
  const acct = await r.json();
  if (acct.error) throw new Error(acct.error.message);
  return parseMoney(acct.funding_source_details?.display_string); // null = sem saldo exposto / pós-pago
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      res.status(401).json({ error: 'não autorizado' });
      return;
    }
  }

  const metaToken = process.env.META_TOKEN;
  const ghToken   = process.env.GITHUB_TOKEN;
  const repo      = process.env.GITHUB_REPO;
  const branch    = process.env.GITHUB_BRANCH || 'main';
  if (!metaToken || !ghToken || !repo) {
    res.status(500).json({ error: 'META_TOKEN/GITHUB_TOKEN/GITHUB_REPO não configurados no servidor.' });
    return;
  }

  const ghHeaders = {
    Authorization: `Bearer ${ghToken}`,
    'User-Agent': 'painel-berrys',
    Accept: 'application/vnd.github+json',
  };
  const path = 'data/boleto-log.json';
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;

  let log = {}, sha = null;
  try {
    const r = await fetch(`${apiUrl}?ref=${branch}`, { headers: ghHeaders });
    if (r.ok) {
      const j = await r.json();
      log = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
      sha = j.sha;
    } else if (r.status !== 404) {
      throw new Error('status ' + r.status);
    }
  } catch (e) {
    res.status(500).json({ error: 'falha ao ler ' + path + ': ' + e.message });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  let changed = false;

  for (const id of ACCOUNT_IDS) {
    try {
      const bal = await fetchBalance(id, metaToken);
      if (bal == null) { results.push({ id, skipped: 'sem saldo exposto' }); continue; }

      const entry = log[id] || { lastBalance: null, lastCheckedDate: null, payments: [] };
      const prev = entry.lastBalance;
      let paymentDetected = false;
      if (prev != null && bal - prev >= BOLETO_JUMP_MIN) {
        entry.payments = [{ date: today, from: prev, to: bal }, ...(entry.payments || [])].slice(0, 50);
        paymentDetected = true;
      }
      if (prev !== bal) changed = true;
      entry.lastBalance = bal;
      entry.lastCheckedDate = today;
      log[id] = entry;
      results.push({ id, paymentDetected, balance: bal });
    } catch (e) {
      results.push({ id, error: e.message });
    }
  }

  if (changed) {
    const content = Buffer.from(JSON.stringify(log, null, 2)).toString('base64');
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...ghHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `boleto-log: checagem automática diária (${today})`,
        content, branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putRes.ok) {
      const j = await putRes.json().catch(() => ({}));
      res.status(500).json({ error: 'falha ao salvar ' + path + ': ' + (j.message || putRes.status), results });
      return;
    }
  }

  res.status(200).json({ ok: true, date: today, checked: ACCOUNT_IDS.length, changed, results });
}
