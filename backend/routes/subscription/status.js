const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const usageTracker = require('../../lib/usage-tracker');

router.get('/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    // Check if user is authenticated
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Authenticated user flow
      const token = authHeader.split(' ')[1];
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Check subscription for authenticated user
      const subscription = await usageTracker.checkAuthenticatedUser(user.id);
      
      res.json({
        authenticated: true,
        active: subscription.hasActiveSubscription,
        plan: subscription.plan,
        expires_at: subscription.expiresAt,
        user_id: user.id
      });
    } else {
      // Anonymous user flow
      const usage = await usageTracker.checkAnonymousUsage(req);
      
      res.json({
        authenticated: false,
        active: usage.canSearch,
        plan: 'free',
        remaining_searches: usage.remaining,
        total_searches: usage.total,
        fingerprint: usage.fingerprint
      });
    }
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;