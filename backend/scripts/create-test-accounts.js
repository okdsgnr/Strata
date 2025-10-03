const { supabase } = require('../lib/supabase');

async function createTestAccounts() {
  console.log('Creating test accounts...');

  try {
    // Create free user account
    const { data: freeUser, error: freeError } = await supabase.auth.admin.createUser({
      email: 'free@test.com',
      password: 'test123',
      email_confirm: true
    });

    if (freeError) {
      console.error('Error creating free user:', freeError);
    } else {
      console.log('✅ Free user created:', freeUser.user.email);
      
      // Add free subscription
      const { error: freeSubError } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: freeUser.user.id,
          plan: 'free',
          status: 'active',
          expires_at: null
        });

      if (freeSubError) {
        console.error('Error creating free subscription:', freeSubError);
      } else {
        console.log('✅ Free subscription created');
      }

      // Update user profile (should be auto-created by trigger, but let's be safe)
      const { error: freeProfileError } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: freeUser.user.id,
          role: 'free',
          subscription_status: 'active'
        });

      if (freeProfileError) {
        console.error('Error updating free user profile:', freeProfileError);
      } else {
        console.log('✅ Free user profile updated');
      }
    }

    // Create premium user account
    const { data: premiumUser, error: premiumError } = await supabase.auth.admin.createUser({
      email: 'premium@test.com',
      password: 'test123',
      email_confirm: true
    });

    if (premiumError) {
      console.error('Error creating premium user:', premiumError);
    } else {
      console.log('✅ Premium user created:', premiumUser.user.email);
      
      // Add premium subscription
      const { error: premiumSubError } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: premiumUser.user.id,
          plan: 'premium',
          status: 'active',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
        });

      if (premiumSubError) {
        console.error('Error creating premium subscription:', premiumSubError);
      } else {
        console.log('✅ Premium subscription created');
      }

      // Update user profile
      const { error: premiumProfileError } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: premiumUser.user.id,
          role: 'paid',
          subscription_status: 'active',
          subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });

      if (premiumProfileError) {
        console.error('Error updating premium user profile:', premiumProfileError);
      } else {
        console.log('✅ Premium user profile updated');
      }
    }

    console.log('\n🎉 Test accounts created successfully!');
    console.log('Free account: free@test.com / test123');
    console.log('Premium account: premium@test.com / test123');
    console.log('\n📧 Email authentication only - no OAuth setup needed!');

  } catch (error) {
    console.error('Error:', error);
  }
}

createTestAccounts();
