const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { validateSubscriptionData, formatSubscriptionData, calculateExpiryDate } = require('./subscription-validator');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

const HELIO_SECRET = process.env.HELIO_WEBHOOK_SECRET;

/**
 * Verify Helio webhook signature
 */
function verifyHelioSignature(payload, signature) {
  if (!HELIO_SECRET) throw new Error('HELIO_WEBHOOK_SECRET not configured');
  
  const hmac = crypto.createHmac('sha256', HELIO_SECRET);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

/**
 * Process subscription webhook
 */
async function processSubscriptionWebhook(payload) {
  try {
    const {
      user_id,
      subscription_id,
      tx_id,
      plan,
      status = 'active',  // Default to active
      expires_at
    } = payload;

    // Validate webhook data
    const validation = validateSubscriptionData({
      user_id,
      plan,
      status,
      tx_signature: tx_id || subscription_id,
      expiry_date: expires_at
    });

    if (!validation.isValid) {
      throw new Error(`Invalid webhook data: ${validation.errors.join(', ')}`);
    }

    // Calculate dates
    console.log('Webhook payload:', { user_id, plan, status, expires_at });
    
    const start_date = new Date();
    let expiry_date;
    
    if (expires_at) {
      expiry_date = new Date(expires_at);
      console.log('Using provided expiry date:', expiry_date);
    } else {
      expiry_date = calculateExpiryDate(plan, start_date);
      console.log('Calculated expiry date:', expiry_date);
    }

    console.log('Processing subscription for user:', user_id);
    
    // First try to get existing subscription
    const { data: existing } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user_id)
      .single();

    let result;
    console.log('Existing subscription:', existing);
    
    if (existing) {
      // Format update data
      const updateData = formatSubscriptionData({
        user_id,
        plan,
        status,
        tx_signature: tx_id || subscription_id,
        expiry_date,
        start_date: existing.status === 'expired' ? start_date : existing.start_date
      }, false);

      // Update existing subscription
      result = await supabase
        .from('user_subscriptions')
        .update(updateData)
        .eq('user_id', user_id);
    } else {
      // Format insert data
      const insertData = formatSubscriptionData({
        user_id,
        plan,
        status,
        tx_signature: tx_id || subscription_id,
        expiry_date,
        start_date
      }, true);

      // Insert new subscription
      result = await supabase
        .from('user_subscriptions')
        .insert(insertData);
    }

    const { error } = result;
    if (error) throw error;

    // Get the updated subscription
    const { data, error: fetchError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (fetchError) throw fetchError;

    console.log(`Subscription processed for user ${user_id}:`, {
      plan,
      status,
      start_date: start_date.toISOString()
    });

    return data;

  } catch (error) {
    console.error('Error processing subscription webhook:', error);
    throw error;
  }
}

/**
 * Get subscription status for user
 */
async function getSubscriptionStatus(userId) {
  try {
    if (!userId) throw new Error('User ID required');

    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select('status, plan, start_date')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      throw error;
    }

    if (!subscription) {
      return {
        active: false,
        plan: null,
        expires_at: null
      };
    }
    const now = new Date();
    
    // Calculate expiration based on plan
    let isActive = subscription.status === 'active';
    if (subscription.plan !== 'lifetime' && subscription.expires_at) {
      isActive = isActive && new Date(subscription.expires_at) > now;
    }

    return {
      active: isActive,
      plan: subscription.plan,
      expires_at: subscription.expires_at
    };

  } catch (error) {
    console.error('Error getting subscription status:', error);
    throw error;
  }
}

module.exports = {
  verifyHelioSignature,
  processSubscriptionWebhook,
  getSubscriptionStatus
};