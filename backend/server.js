require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

console.log("Starting server setup...");

const app = express();

console.log("Setting up middleware...");
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`Request:`, {
    method: req.method,
    path: req.path,
    baseUrl: req.baseUrl,
    originalUrl: req.originalUrl
  });
  next();
});

// Test route on main app
app.get('/test', (req, res) => {
  console.log("Test route hit");
  res.json({ ok: true });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// API routes
const router = express.Router();

router.get('/test', (req, res) => {
  console.log("API test route hit");
  res.json({ ok: true });
});

function verifySignature(payload, signature) {
  if (!signature) {
    console.log('No signature provided');
    return false;
  }

  const secret = process.env.HELIO_WEBHOOK_SECRET || 'test-secret';
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  
  console.log('Signature verification:', {
    received: signature,
    expected: digest
  });

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

router.post('/webhooks/helio', (req, res) => {
  console.log("Webhook route hit:", {
    body: req.body,
    signature: req.headers['x-helio-signature']
  });

  // Verify signature
  if (!verifySignature(req.body, req.headers['x-helio-signature'])) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook
  res.json({ ok: true });
});

app.use('/api', router);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on :${port}`);
});