const { upsertWalletLabel } = require('../lib/db.js');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { address, type, label, expires_at } = req.body;
  
  // Validation
  if (!address || !type || !label) {
    return res.status(400).json({ error: 'address, type, and label are required' });
  }
  
  const validTypes = ['CEX', 'LP', 'SmartMoney', 'TopHolder', 'SNS'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ 
      error: 'Invalid type. Must be one of: ' + validTypes.join(', ') 
    });
  }

  try {
    await upsertWalletLabel(address, type, label, expires_at);
    res.json({ ok: true });
  } catch (e) {
    console.error('Label error:', e);
    res.status(500).json({ error: 'label_failed', message: e.message });
  }
}

module.exports = { default: handler };
