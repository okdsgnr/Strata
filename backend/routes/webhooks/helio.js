const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const crypto = require('crypto');

// Verify Helio webhook signature
function verifyHelioSignature(payload, signature, secret) {
  if (!signature) return false;
  
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

// Handle Helio payment webhooks
router.post('/helio', async (req, res) => {
  try {
    const signature = req.headers['x-helio-signature'];
    const secret = process.env.HELIO_WEBHOOK_SECRET || 'test-secret';
    
    // Verify webhook signature
    if (!verifyHelioSignature(req.body, signature, secret)) {
      console.log('Invalid Helio webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    console.log('Helio webhook received:', { event, data });

    if (event === 'payment.completed') {
      const { 
        payment_id, 
        user_id, 
        amount, 
        currency,
        subscription_id,
        expires_at 
      } = data;

      // Update user subscription in database
      const { error } = await supabase
        .from('user_subscriptions')
        .upsert({
          user_id: user_id,
          status: 'active',
          expiry_date: expires_at
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error updating subscription:', error);
        return res.status(500).json({ error: 'Failed to update subscription' });
      }

      // Update user profile in auth.users table
      const { error: profileError } = await supabase.auth.admin.updateUserById(user_id, {
        user_metadata: {
          role: 'paid',
          subscription_status: 'active',
          subscription_expires_at: expires_at
        }
      });

      if (profileError) {
        console.error('Error updating user profile:', profileError);
        // Don't fail the webhook, subscription was updated
      }

      console.log('✅ Subscription updated for user:', user_id);
      res.json({ success: true });
    } else if (event === 'payment.failed' || event === 'subscription.cancelled') {
      // Handle subscription cancellation
      const { user_id } = data;

      // Update user_subscriptions table
      const { error: subError } = await supabase
        .from('user_subscriptions')
        .update({ status: 'canceled' })
        .eq('user_id', user_id);

      if (subError) {
        console.error('Error cancelling subscription:', subError);
        return res.status(500).json({ error: 'Failed to cancel subscription' });
      }

      // Update user profile in auth.users table
      const { error: profileError } = await supabase.auth.admin.updateUserById(user_id, {
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

      console.log('❌ Subscription cancelled for user:', user_id);
      res.json({ success: true });
    } else {
      console.log('Unhandled Helio event:', event);
      res.json({ success: true });
    }

  } catch (error) {
    console.error('Helio webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;