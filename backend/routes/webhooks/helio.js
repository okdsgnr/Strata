// Minimal stub handler to verify routing
module.exports = async function helioWebhookHandler(req, res) {
  console.log("Webhook hit:", req.body);
  return res.status(200).json({ ok: true });
};