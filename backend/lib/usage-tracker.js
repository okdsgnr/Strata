const { supabase } = require('./supabase');

class UsageTracker {
  constructor() {
    this.dailyLimit = 3; // Free users get 3 searches per day
  }

  // Generate a unique fingerprint for anonymous users
  generateFingerprint(req) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    
    // Create a simple hash of the browser fingerprint
    const fingerprint = `${ip}-${userAgent}-${acceptLanguage}`;
    return Buffer.from(fingerprint).toString('base64').slice(0, 16);
  }

  // Check if anonymous user has remaining searches
  async checkAnonymousUsage(req) {
    const fingerprint = this.generateFingerprint(req);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `anon_usage_${fingerprint}_${today}`;

    try {
      // Check current usage from Supabase KV or Redis
      const { data, error } = await supabase
        .from('usage_tracking')
        .select('count')
        .eq('key', key)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        throw error;
      }

      const currentUsage = data?.count || 0;
      const remaining = Math.max(0, this.dailyLimit - currentUsage);

      return {
        canSearch: remaining > 0,
        remaining,
        total: this.dailyLimit,
        fingerprint
      };
    } catch (error) {
      console.error('Error checking anonymous usage:', error);
      return {
        canSearch: false,
        remaining: 0,
        total: this.dailyLimit,
        fingerprint
      };
    }
  }

  // Increment anonymous usage
  async incrementAnonymousUsage(req) {
    const fingerprint = this.generateFingerprint(req);
    const today = new Date().toISOString().split('T')[0];
    const key = `anon_usage_${fingerprint}_${today}`;

    try {
      // Upsert usage count
      const { error } = await supabase
        .from('usage_tracking')
        .upsert({
          key,
          count: 1,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours TTL
        }, {
          onConflict: 'key',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('Error incrementing usage:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error incrementing anonymous usage:', error);
      return false;
    }
  }

  // Check authenticated user subscription
  async checkAuthenticatedUser(userId) {
    try {
      // First check user profile for role and subscription status
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      // If user has active subscription status, they're good
      if (profile?.subscription_status === 'active') {
        // Check if subscription hasn't expired
        const isExpired = profile.subscription_expires_at && 
          new Date(profile.subscription_expires_at) <= new Date();
        
        if (!isExpired) {
          return {
            hasActiveSubscription: true,
            plan: profile.role === 'paid' ? 'premium' : 'free',
            expiresAt: profile.subscription_expires_at
          };
        }
      }

      // Prefer user_access view (single source of truth)
      const { data: access, error: accessError } = await supabase
        .from('user_access')
        .select('is_paid, start_date, expiry_date')
        .eq('user_id', userId)
        .maybeSingle();

      if (accessError && accessError.code !== 'PGRST116') {
        throw accessError;
      }

      return {
        hasActiveSubscription: !!access?.is_paid,
        plan: access?.is_paid ? 'paid' : 'free',
        expiresAt: access?.expiry_date || null
      };
    } catch (error) {
      console.error('Error checking authenticated user:', error);
      return {
        hasActiveSubscription: false,
        plan: 'free',
        expiresAt: null
      };
    }
  }
}

module.exports = new UsageTracker();
