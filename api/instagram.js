// api/instagram.js — proxy para o Graph API "business discovery", usado pela
// aba Cronograma IG (tabs/cronograma.js) para ler posts públicos do Instagram
// de QUALQUER unidade a partir do @, sem precisar de login/token dela.
//
// Como funciona: o Graph API só deixa consultar posts de uma conta pública
// de terceiros através do campo "business_discovery", pedido a partir de uma
// conta Instagram profissional que o nosso token já controla. Usamos a conta
// da Berry's MOC (SELF_IG_ID) só como essa "ponta" de consulta — os dados
// retornados são sempre os da conta pedida em ?username=, não os da MOC.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.META_TOKEN;
  if (!token) {
    res.status(500).json({ error: { message: 'META_TOKEN não configurado no servidor.' } });
    return;
  }

  const { username } = req.query;
  if (!username) {
    res.status(400).json({ error: { message: 'Parâmetro username obrigatório.' } });
    return;
  }

  const SELF_IG_ID = '17841411587761934'; // IG da Berry's MOC — usado só como ponta de consulta
  const BASE = 'https://graph.facebook.com/v22.0';
  const fields = `business_discovery.username(${username}){media_count,media.limit(50){media_type,media_product_type,timestamp,permalink}}`;
  const params = new URLSearchParams({ access_token: token, fields });

  try {
    const r = await fetch(`${BASE}/${SELF_IG_ID}?${params}`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
}
