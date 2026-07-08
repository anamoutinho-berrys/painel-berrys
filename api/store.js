// ============================================================================
// api/store.js — persistência simples e compartilhada (sem banco de dados):
// lê/grava um arquivo JSON em data/<file>.json no próprio repositório GitHub,
// usando a Contents API. Usado por Saldos (histórico de boletos) e
// Planejamento de Criativos.
//
// Variáveis de ambiente necessárias na Vercel:
//   GITHUB_TOKEN  — Personal Access Token com permissão de escrita no repo
//   GITHUB_REPO   — "owner/repo", ex.: "anamoutinho-berrys/painel-berrys"
//   GITHUB_BRANCH — opcional, default "main"
// ============================================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token  = process.env.GITHUB_TOKEN;
  const repo   = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token || !repo) {
    res.status(500).json({ error: 'GITHUB_TOKEN/GITHUB_REPO não configurados no servidor.' });
    return;
  }

  const { file } = req.query;
  if (!file || !/^[a-z0-9_-]+$/i.test(file)) {
    res.status(400).json({ error: 'Parâmetro file inválido.' });
    return;
  }
  const path = `data/${file}.json`;
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'painel-berrys',
    Accept: 'application/vnd.github+json',
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${apiUrl}?ref=${branch}`, { headers: ghHeaders });
      if (r.status === 404) { res.status(200).json({ data: null, sha: null }); return; }
      if (!r.ok) { res.status(r.status).json({ error: 'Falha ao ler ' + path }); return; }
      const j = await r.json();
      const content = Buffer.from(j.content, 'base64').toString('utf8');
      res.status(200).json({ data: JSON.parse(content), sha: j.sha });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      const { data, sha } = body || {};
      const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `atualiza ${path} via painel`,
          content, branch,
          ...(sha ? { sha } : {}),
        }),
      });
      const j = await putRes.json();
      if (!putRes.ok) { res.status(putRes.status).json({ error: j.message || 'erro ao salvar' }); return; }
      res.status(200).json({ ok: true, sha: j.content?.sha });
      return;
    }

    res.status(405).json({ error: 'Método não suportado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
