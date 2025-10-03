require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { supabase } = require('./lib/supabase');

console.log("Starting server setup...");

const app = express();

console.log("Setting up middleware...");
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware - temporarily disabled due to console hijacking issue
// app.use((req, res, next) => {
//   console.log(`Request:`, {
//     method: req.method,
//     path: req.path,
//     baseUrl: req.baseUrl,
//     originalUrl: req.originalUrl
//   });
//   next();
// });

// Test route on main app
app.get('/test', (req, res) => {
  console.log("Test route hit");
  res.json({ ok: true });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// API routes
const router = express.Router();

// Import route handlers
const subscriptionStatus = require('./routes/subscription/status');
const helioWebhook = require('./routes/webhooks/helio');
const { supabase: sbAdmin } = require('./lib/supabase');
const fetch = global.fetch || require('node-fetch');
const auditHandler = require('./routes/audit').default;
const compareHandler = require('./routes/compare').default;
const auditCachedHandler = require('./routes/audit-cached').handler;
const auditLiveHandler = require('./routes/audit-live').handler;
const analyticsHandler = require('./routes/analytics').handler;

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

router.post('/webhooks/helio', async (req, res) => {
  console.log("Webhook route hit:", {
    body: req.body,
    signature: req.headers['x-helio-signature']
  });

  // Verify signature
  if (!verifySignature(req.body, req.headers['x-helio-signature'])) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook
  try {
    const { event, data } = req.body || {};

    if (event === 'payment.completed') {
      const md = data?.metadata || {};
      const expiresAt = data?.expires_at || data?.expiry_date || null;

      // Prefer signed metadata from our upgrade flow
      let userId = md.user_id || null;
      const mdPlan = md.plan || null;
      const mdTs = Number(md.ts || 0);
      const mdSig = md.sig || null;
      const nowTs = Math.floor(Date.now() / 1000);

      const metadataSecret = process.env.HELIO_METADATA_SECRET || '';
      const withinWindow = mdTs > 0 && Math.abs(nowTs - mdTs) <= 15 * 60; // 15 minutes
      if (userId && mdPlan && mdSig && withinWindow && metadataSecret) {
        const h = crypto.createHmac('sha256', metadataSecret)
          .update(`${userId}|${mdPlan}|${mdTs}`)
          .digest('hex');
        if (h !== mdSig) {
          console.warn('Invalid metadata signature for helio payment');
          userId = null; // fall back to other methods
        }
      } else {
        userId = null; // invalid/incomplete metadata
      }

      if (!userId) {
        // Fallbacks: attempt to resolve by email if provided
        const email = data?.customer_email || data?.email || null;
        if (!email) {
          console.warn('payment.completed missing user identification');
          return res.status(400).json({ error: 'missing_user_identity' });
        }
        try {
          // Resolve Supabase user by email
          const { data: users, error: userErr } = await sbAdmin
            .from('auth.users')
            .select('id, email')
            .ilike('email', email)
            .limit(1);
          if (userErr) throw userErr;
          if (!users || users.length === 0) {
            console.warn('No Supabase user found for email:', email);
            return res.status(400).json({ error: 'user_not_found_for_email' });
          }
          userId = users[0].id;
        } catch (e) {
          console.error('Error resolving user by email:', e);
          return res.status(500).json({ error: 'user_resolution_failed' });
        }
      }

      const payload = {
        user_id: userId,
        status: 'active',
        start_date: new Date().toISOString(),
        expiry_date: expiresAt || null
      };

      const { error } = await supabase
        .from('user_subscriptions')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) {
        console.error('Subscription upsert error:', error);
        return res.status(500).json({ error: 'subscription_upsert_failed' });
      }

      // Update user profile in auth.users table
      const { error: profileError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          role: 'paid',
          subscription_status: 'active',
          subscription_expires_at: expiresAt
        }
      });

      if (profileError) {
        console.error('Error updating user profile:', profileError);
        // Don't fail the webhook, subscription was updated
      }

      console.log('✅ Subscription and user profile updated for user:', userId);
      return res.json({ ok: true });
    }

    if (event === 'subscription.cancelled' || event === 'payment.failed') {
      const userId = data?.user_id || data?.userId || data?.customer_id || null;
      if (!userId) {
        console.warn('cancel event missing user_id');
        return res.status(400).json({ error: 'missing_user_id' });
      }

      const { error } = await supabase
        .from('user_subscriptions')
        .update({ status: 'canceled' })
        .eq('user_id', userId);

      if (error) {
        console.error('Subscription cancel error:', error);
        return res.status(500).json({ error: 'subscription_cancel_failed' });
      }

      // Update user profile in auth.users table
      const { error: profileError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          role: 'free',
          subscription_status: 'inactive',
          subscription_expires_at: null
        }
      });

      if (profileError) {
        console.error('Error updating user profile on cancellation:', profileError);
        // Don't fail the webhook, subscription was cancelled
      }

      console.log('❌ Subscription cancelled for user:', userId);
      return res.json({ ok: true });
    }

    // Unhandled event: acknowledge
    return res.json({ ok: true, ignored: true });
  } catch (e) {
    console.error('Webhook processing error:', e);
    return res.status(500).json({ error: 'webhook_processing_failed' });
  }
});

// Auth-required redirect to Helio checkout with plan
router.get('/billing/upgrade', async (req, res) => {
  try {
    const plan = (req.query.plan || '').toString().toLowerCase();
    if (!['monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({ error: 'invalid_plan' });
    }

    // Accept token via Authorization header or query param (for browser redirects)
    let token = null;
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token.toString();
    }
    if (!token) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Validate user session via Supabase
    const { data: { user }, error } = await require('./lib/supabase').supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'invalid_session' });
    }

    // Create a Helio checkout server-side with signed metadata
    const apiBase = process.env.HELIO_API_BASE || 'https://api.hel.io/v1';
    const apiKey = process.env.HELIO_API_KEY;
    const walletId = process.env.HELIO_WALLET_ID; // from Helio dashboard
    const currencyId = process.env.HELIO_CURRENCY_ID; // Helio currency id (e.g., USDC on Solana)
    const priceUsd = plan === 'monthly' ? (process.env.HELIO_MONTHLY_PRICE_USD || '10.00') : (process.env.HELIO_YEARLY_PRICE_USD || '100.00');
    if (!apiKey || !walletId || !currencyId) {
      console.error('Helio env missing: HELIO_API_KEY, HELIO_WALLET_ID, HELIO_CURRENCY_ID');
      return res.status(500).json({ error: 'helio_not_configured' });
    }

    const mdSecret = process.env.HELIO_METADATA_SECRET || '';
    const ts = Math.floor(Date.now() / 1000);
    const sig = mdSecret ? crypto.createHmac('sha256', mdSecret).update(`${user.id}|${plan}|${ts}`).digest('hex') : null;

    const title = plan === 'monthly' ? 'Strata Subscription (Monthly)' : 'Strata Subscription (Yearly)';
    const body = {
      title,
      recipients: [
        { walletId, currencyId }
      ],
      price: { amount: priceUsd, currency: 'USD' },
      metadata: {
        user_id: user.id,
        email: user.email || null,
        plan,
        ts,
        sig
      }
    };

    const resp = await fetch(`${apiBase}/pay-links`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const txt = await resp.text();
      console.error('Helio create pay-link failed:', resp.status, txt);
      return res.status(502).json({ error: 'helio_create_failed' });
    }
    const data = await resp.json();
    const redirectUrl = data?.url || data?.link || data?.payLinkUrl;
    if (!redirectUrl) {
      console.error('Helio response missing redirect URL');
      return res.status(502).json({ error: 'helio_no_url' });
    }
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, redirectUrl);
  } catch (e) {
    console.error('upgrade redirect error:', e);
    return res.status(500).json({ error: 'upgrade_failed' });
  }
});

// Register routes
router.use('/subscription', subscriptionStatus);
router.use('/webhooks', helioWebhook);
router.post('/audit', auditHandler);
router.post('/audit/cached', auditCachedHandler);
router.post('/audit/live', auditLiveHandler);
router.post('/compare', compareHandler);
router.get('/analytics', analyticsHandler);

app.use('/api', router);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on :${port}`);
});