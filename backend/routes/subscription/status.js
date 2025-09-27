const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');

router.get('/status', async (req, res) => {
  try {
    // Get user ID from Supabase auth
    const { user } = await supabase.auth.getUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get subscription
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) throw error;

    // Check if subscription is active
    const active = data?.status === 'active' && 
      (!data.expiry_date || new Date(data.expiry_date) > new Date());

    res.json({
      active,
      plan: data?.plan,
      expires_at: data?.expiry_date
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;