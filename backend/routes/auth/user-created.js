const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');

// This endpoint is called when a new user signs up
// It automatically creates a "free" subscription for them
router.post('/user-created', async (req, res) => {
  try {
    const { user_id, email } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    console.log('Creating free subscription for new user:', email);

    // Create a free subscription for the new user
    const { error } = await supabase
      .from('user_subscriptions')
      .insert({
        user_id: user_id,
        plan: 'free',
        status: 'active',
        expires_at: null // Free accounts don't expire
      });

    if (error) {
      console.error('Error creating free subscription:', error);
      return res.status(500).json({ error: 'Failed to create subscription' });
    }

    console.log('✅ Free subscription created for user:', email);
    res.json({ success: true, plan: 'free' });

  } catch (error) {
    console.error('User creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
