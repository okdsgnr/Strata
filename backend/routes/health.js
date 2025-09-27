async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  
  res.json({ ok: true });
}

module.exports = { default: handler };
