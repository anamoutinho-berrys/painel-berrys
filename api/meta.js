export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.META_TOKEN;
  if (!token) {
    res.status(500).json({ error: { message: 'META_TOKEN não configurado no servidor.' } });
    return;
  }

  const { account, path, preset, ...rest } = req.query;
  if (!account) {
    res.status(400).json({ error: { message: 'Parâmetro account obrigatório.' } });
    return;
  }

  const BASE = 'https://graph.facebook.com/v21.0';
  const endpoint = path ? `act_${account}/${path}` : `act_${account}`;
  const params = new URLSearchParams({ access_token: token });
  if (preset) params.set('date_preset', preset);
  for (const [k, v] of Object.entries(rest)) params.set(k, v);

  try {
    const r = await fetch(`${BASE}/${endpoint}?${params}`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
}
