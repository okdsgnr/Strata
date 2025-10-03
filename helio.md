# Subscription Gating & Helio Webhook Implementation Handoff

## Overview
This document outlines the complete implementation plan for subscription-based feature gating and Helio payment webhook integration. The system supports two tiers: **Free** (limited access) and **Paid** (full access).

## Current State
- ✅ Minimal `user_subscriptions` table created with schema: `user_id`, `status`, `start_date`, `expiry_date`
- ✅ Basic webhook endpoint exists at `/api/webhooks/helio` with signature verification
- ✅ Cloudflare tunnel configured (waiting for DNS propagation)
- ❌ DEV_BYPASS still active (needs removal)
- ❌ Subscription gating not implemented
- ❌ Paywall UI not implemented

## Database Schema

### `user_subscriptions` Table
```sql
CREATE TABLE public.user_subscriptions (
  user_id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('active','canceled','expired')),
  start_date timestamptz NOT NULL DEFAULT now(),
  expiry_date timestamptz NULL
);
```

### `user_access` View (for quick paid checks)
```sql
CREATE OR REPLACE VIEW public.user_access AS
SELECT
  user_id,
  status,
  start_date,
  expiry_date,
  (status = 'active' AND (expiry_date IS NULL OR expiry_date > now())) AS is_paid
FROM public.user_subscriptions;
```

## Access Control Model

### User Tiers
- **Free**: Default tier, limited features
- **Paid**: Active subscription with `status='active'` AND `expiry_date > now()`

### Feature Access Matrix
| Feature | Free Users | Paid Users |
|---------|------------|------------|
| Index page (holder mapping) | ✅ Cached data only | ✅ Live + cached data |
| Overlap analysis | ❌ Paywall | ✅ Full access |
| Trending searches | ❌ Paywall | ✅ Full access |
| Profile page | ✅ Basic (logged in) | ✅ Full (logged in) |
| Live audit API | ❌ 401/403 | ✅ Full access |
| Cached audit API | ✅ Open | ✅ Open |

## Implementation Tasks

### 1. Remove DEV_BYPASS (Priority: High)

**Files to update:**
- `frontend/app/page.js` (lines 40, 45, 90, 105)
- `frontend/components/TopNav.js` (line 2) 
- `backend/routes/audit-live.js` (line 24)

**Changes needed:**
- Remove all `DEV_BYPASS_AUTH` conditionals
- Remove DEV pill from TopNav
- Remove `.env` variables: `DEV_BYPASS_AUTH`, `NEXT_PUBLIC_DEV_BYPASS_AUTH`
- Ensure all routes require real authentication

### 2. Backend Access Helper (Priority: High)

**Create:** `backend/lib/access.js`
```javascript
const { sb } = require('./db.js');

async function getUserAccessLevel(userId) {
  if (!userId) return 'free';
  
  const { data, error } = await sb
    .from('user_access')
    .select('is_paid')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) return 'free';
  return data.is_paid ? 'paid' : 'free';
}

async function requirePaidAccess(req, res, next) {
  const userId = req.user?.id; // Assuming JWT middleware sets req.user
  const accessLevel = await getUserAccessLevel(userId);
  
  if (accessLevel !== 'paid') {
    return res.status(403).json({ 
      error: 'Subscription required',
      accessLevel: 'free',
      upgradeRequired: true 
    });
  }
  
  next();
}

module.exports = { getUserAccessLevel, requirePaidAccess };
```

### 3. API Route Gating (Priority: High)

**Update routes to require paid access:**
- `backend/routes/audit.js` - Add `requirePaidAccess` middleware
- `backend/routes/compare.js` - Add `requirePaidAccess` middleware
- `backend/routes/analytics.js` - Add `requirePaidAccess` middleware

**Keep open:**
- `backend/routes/audit-cached.js` - Allow all users
- `backend/routes/health.js` - Allow all users

**Example implementation:**
```javascript
// In audit.js
const { requirePaidAccess } = require('../lib/access.js');

// Add middleware before handler
router.post('/audit', requirePaidAccess, auditHandler);
```

### 4. Frontend Subscription Hook (Priority: High)

**Create:** `frontend/lib/useSubscription.js`
```javascript
import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export function useSubscription() {
  const [accessLevel, setAccessLevel] = useState('free');
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function checkSubscription() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setAccessLevel('free');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/subscription/status', {
          headers: { 'Authorization': `Bearer ${user.access_token}` }
        });
        
        if (response.ok) {
          const { isPaid } = await response.json();
          setAccessLevel(isPaid ? 'paid' : 'free');
        } else {
          setAccessLevel('free');
        }
      } catch (error) {
        console.error('Subscription check failed:', error);
        setAccessLevel('free');
      }
      
      setLoading(false);
    }

    checkSubscription();
  }, [supabase]);

  return { accessLevel, isPaid: accessLevel === 'paid', loading };
}
```

### 5. Paywall Component (Priority: High)

**Create:** `frontend/components/PaywallModal.js`
```javascript
"use client";
import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function PaywallModal({ isOpen, onClose, feature = "this feature" }) {
  const [loading, setLoading] = useState(false);
  const supabase = createClientComponentClient();

  const handleSubscribe = async () => {
    setLoading(true);
    // Redirect to Helio checkout
    window.location.href = 'https://your-helio-checkout-url.com';
  };

  const handleLogin = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-2xl p-8 max-w-md mx-4">
        <h2 className="text-xl font-bold text-white mb-4">Upgrade Required</h2>
        <p className="text-gray-300 mb-6">
          You need a paid subscription to access {feature}.
        </p>
        
        <div className="space-y-3">
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full bg-brand text-white py-3 px-4 rounded-lg font-medium hover:bg-brand/90 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Subscribe Now'}
          </button>
          
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-gray-700 text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-600 disabled:opacity-50"
          >
            Sign In
          </button>
        </div>
        
        <button
          onClick={onClose}
          className="mt-4 text-gray-400 hover:text-white text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

### 6. Page-Level Gating (Priority: High)

**Update:** `frontend/app/overlap/page.js`
```javascript
"use client";
import { useSubscription } from '../../lib/useSubscription';
import PaywallModal from '../../components/PaywallModal';
import { useState } from 'react';

export default function OverlapPage() {
  const { isPaid, loading } = useSubscription();
  const [showPaywall, setShowPaywall] = useState(false);

  // Show paywall immediately for free users
  if (!loading && !isPaid) {
    return (
      <PaywallModal 
        isOpen={true}
        onClose={() => window.history.back()}
        feature="overlap analysis"
      />
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  // Render overlap analysis UI for paid users
  return (
    <div className="min-h-screen bg-night">
      {/* Existing overlap UI */}
    </div>
  );
}
```

**Update:** `frontend/app/trending/page.js`
```javascript
"use client";
import { useSubscription } from '../../lib/useSubscription';
import PaywallModal from '../../components/PaywallModal';

export default function TrendingPage() {
  const { isPaid, loading } = useSubscription();

  // Show paywall immediately for free users
  if (!loading && !isPaid) {
    return (
      <PaywallModal 
        isOpen={true}
        onClose={() => window.history.back()}
        feature="trending searches"
      />
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  // Render trending UI for paid users
  return (
    <div className="min-h-screen bg-night">
      {/* Existing trending UI */}
    </div>
  );
}
```

### 7. Index Page Updates (Priority: Medium)

**Update:** `frontend/app/page.js`
- Remove DEV_BYPASS conditionals
- Use `useSubscription` hook
- For free users: disable live audit button, show cached data only
- For paid users: allow live audit calls

```javascript
// Example button logic
<button
  onClick={handleAudit}
  disabled={!isPaid && !isCached}
  className={`w-full py-3 px-4 rounded-lg font-medium ${
    isPaid || isCached 
      ? 'bg-brand text-white hover:bg-brand/90' 
      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
  }`}
>
  {isPaid ? 'Run Live Audit' : 'View Cached Data'}
</button>
```

## Helio Webhook Implementation

### Current Status
- ✅ Webhook endpoint exists: `/api/webhooks/helio`
- ✅ Signature verification implemented
- ❌ Not tested (waiting for DNS)
- ❌ No database writes yet

### Webhook URL
- **Development**: `https://dev.usestrata.xyz/api/webhooks/helio` (when DNS resolves)
- **Temporary**: Use `cloudflared tunnel --url http://localhost:4000` for immediate testing

### Webhook Implementation Needed

**Update:** `backend/server.js` (webhook route)
```javascript
router.post('/webhooks/helio', async (req, res) => {
  console.log("Helio webhook received:", {
    body: req.body,
    signature: req.headers['x-helio-signature']
  });

  // Verify signature
  if (!verifySignature(req.body, req.headers['x-helio-signature'])) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, data } = req.body;
  
  try {
    if (event === 'payment.completed') {
      const { user_id, expires_at, product_id } = data;
      
      // Map Helio product_id to billing period
      const billingPeriod = product_id.includes('monthly') ? 'monthly' : 'yearly';
      
      // Upsert subscription
      const { error } = await sb
        .from('user_subscriptions')
        .upsert({
          user_id: user_id,
          status: 'active',
          start_date: new Date().toISOString(),
          expiry_date: expires_at
        }, { onConflict: 'user_id' });
      
      if (error) throw error;
      
      console.log('✅ Subscription activated for user:', user_id);
      
    } else if (event === 'subscription.cancelled' || event === 'payment.failed') {
      const { user_id } = data;
      
      // Cancel subscription
      const { error } = await sb
        .from('user_subscriptions')
        .update({ status: 'canceled' })
        .eq('user_id', user_id);
      
      if (error) throw error;
      
      console.log('❌ Subscription canceled for user:', user_id);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});
```

### Helio Configuration Needed
1. **Webhook URL**: Set to `https://dev.usestrata.xyz/api/webhooks/helio`
2. **Events**: Configure to send `payment.completed` and `subscription.cancelled`
3. **Signature**: Verify Helio uses `x-helio-signature` header with HMAC-SHA256
4. **Payload**: Confirm payload structure includes `user_id`, `expires_at`, `product_id`

## Testing Checklist

### DNS Resolution
- [ ] Verify `dev.usestrata.xyz` resolves and proxies to localhost:4000
- [ ] Test health endpoint: `curl https://dev.usestrata.xyz/health`
- [ ] Test webhook endpoint: `curl -X POST https://dev.usestrata.xyz/api/webhooks/helio`

### Subscription System
- [ ] Remove all DEV_BYPASS references
- [ ] Test free user access (should see paywalls on /overlap and /trending)
- [ ] Test paid user access (should see full features)
- [ ] Test index page behavior (cached vs live audit)

### Webhook Integration
- [ ] Configure Helio webhook URL
- [ ] Send test payment event from Helio
- [ ] Verify database writes to `user_subscriptions`
- [ ] Test subscription cancellation flow

## Environment Variables Needed

**Backend (.env):**
```
HELIO_WEBHOOK_SECRET=your_helio_webhook_secret
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE=your_service_role_key
```

**Frontend (.env.local):**
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## Security Considerations

1. **Webhook Security**: Always verify signatures before processing
2. **RLS Policies**: Ensure `user_subscriptions` has proper RLS (users can only read their own)
3. **API Gating**: Server-side validation is source of truth, not frontend
4. **Error Handling**: Don't expose sensitive subscription details in error messages

## Rollout Strategy

1. **Phase 1**: Remove DEV_BYPASS, implement basic gating
2. **Phase 2**: Test webhook with Helio sandbox
3. **Phase 3**: Deploy to production, configure live Helio webhook
4. **Phase 4**: Monitor webhook delivery and subscription status updates

## Troubleshooting

### Common Issues
- **401 on webhook**: Check signature verification (may need raw body verification)
- **DNS not resolving**: Wait for nameserver propagation or use temporary tunnel
- **Subscription not updating**: Check webhook payload structure and database writes
- **Paywall not showing**: Verify `useSubscription` hook and API responses

### Debug Commands
```bash
# Check DNS resolution
dig +short dev.usestrata.xyz

# Test webhook locally
curl -X POST http://localhost:4000/api/webhooks/helio \
  -H "Content-Type: application/json" \
  -H "x-helio-signature: test" \
  -d '{"event":"test","data":{}}'

# Check subscription status
psql $SUPABASE_DB_URL -c "SELECT * FROM user_access WHERE user_id = 'your-user-id';"
```

## Next Developer Notes

When DNS resolves and you're ready to continue:

1. **Test the webhook URL** first: `curl https://dev.usestrata.xyz/health`
2. **Configure Helio webhook** to point to your tunnel URL
3. **Send a test event** and verify it reaches your backend
4. **Implement the database writes** in the webhook handler
5. **Remove DEV_BYPASS** and implement the paywall UI
6. **Test the full flow**: free user → paywall → paid user → full access

The webhook signature verification may need adjustment based on how Helio formats their signatures (some providers sign the raw request body, not JSON.stringify).
