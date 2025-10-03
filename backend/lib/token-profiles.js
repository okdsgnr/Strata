const { supabase } = require('./supabase');

/**
 * Get or create token profile
 */
async function getOrCreateTokenProfile(tokenAddress) {
  try {
    // Check if profile exists
    const { data: existing, error: existingErr } = await supabase
      .from('token_profiles')
      .select('*')
      .eq('token_address', tokenAddress)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) return existing;

    // Create new profile
    const created_at = await getTokenCreationDate(tokenAddress);
    const { data: inserted, error: insertErr } = await supabase
      .from('token_profiles')
      .insert({
        token_address: tokenAddress,
        created_at,
        last_activity: new Date().toISOString(),
        cache_window: '10 minutes'
      })
      .select('*')
      .single();
    if (insertErr) throw insertErr;
    return inserted;

  } catch (error) {
    console.error('Error getting/creating token profile:', error);
    throw error;
  }
}

/**
 * Get token creation date from Helius DAS
 */
async function getTokenCreationDate(tokenAddress) {
  try {
    // This would integrate with Helius DAS API
    // For now, return current time as fallback
    return new Date();
  } catch (error) {
    console.error('Error fetching token creation date:', error);
    return new Date();
  }
}

/**
 * Update token profile activity and cache window
 */
async function updateTokenProfile(tokenAddress) {
  try {
    const profile = await getOrCreateTokenProfile(tokenAddress);
    
    // Update last activity
    await supabase
      .from('token_profiles')
      .update({ last_activity: new Date().toISOString() })
      .eq('token_address', tokenAddress);

    // Determine new cache window based on token classification
    const newCacheWindow = await determineCacheWindow(tokenAddress, profile);
    
    if (newCacheWindow !== profile.cache_window) {
      await supabase
        .from('token_profiles')
        .update({ cache_window: newCacheWindow })
        .eq('token_address', tokenAddress);
      
      console.log(`Updated cache window for ${tokenAddress} to ${newCacheWindow}`);
    }

  } catch (error) {
    console.error('Error updating token profile:', error);
    throw error;
  }
}

/**
 * Determine appropriate cache window for token
 */
async function determineCacheWindow(tokenAddress, profile) {
  try {
    const now = new Date();
    const created_at = new Date(profile.created_at);
    const age_days = (now - created_at) / (1000 * 60 * 60 * 24);

    // New token (≤ 7 days)
    if (age_days <= 7) {
      return '5 minutes';
    }

    // Check if token is active (high volume or search frequency)
    const isActive = await checkTokenActivity(tokenAddress);
    
    if (isActive) {
      return '15 minutes';
    }

    // Established token (> 30 days, low activity)
    if (age_days > 30) {
      return '1 hour';
    }

    // Default for tokens 7-30 days old
    return '30 minutes';

  } catch (error) {
    console.error('Error determining cache window:', error);
    return '10 minutes'; // Safe default
  }
}

/**
 * Check if token is active (high volume or search frequency)
 */
async function checkTokenActivity(tokenAddress) {
  try {
    // Check search frequency (last 24h)
    const { data: searchCount, error } = await supabase
      .from('token_searches')
      .select('id', { count: 'exact', head: true })
      .eq('token_address', tokenAddress)
      .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString());
    if (error) throw error;
    const searchFrequency = searchCount?.length === 0 && typeof searchCount.count === 'number'
      ? searchCount.count
      : (searchCount?.length || 0);
    
    // Check trading volume (would integrate with Dexscreener API)
    // For now, just use search frequency
    const isHighActivity = searchFrequency >= 5;
    
    console.log(`Token ${tokenAddress} activity: ${searchFrequency} searches/24h, active: ${isHighActivity}`);
    return isHighActivity;

  } catch (error) {
    console.error('Error checking token activity:', error);
    return false;
  }
}

/**
 * Get token profile for cache window calculation
 */
async function getTokenProfile(tokenAddress) {
  try {
    const { data, error } = await supabase
      .from('token_profiles')
      .select('*')
      .eq('token_address', tokenAddress)
      .maybeSingle();
    if (error) throw error;
    return data || null;

  } catch (error) {
    console.error('Error getting token profile:', error);
    return null;
  }
}

module.exports = {
  getOrCreateTokenProfile,
  updateTokenProfile,
  getTokenProfile
};
