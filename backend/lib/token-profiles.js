const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Get or create token profile
 */
async function getOrCreateTokenProfile(tokenAddress) {
  try {
    // Check if profile exists
    const existing = await pool.query(`
      SELECT * FROM token_profiles WHERE token_address = $1
    `, [tokenAddress]);

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Create new profile
    const created_at = await getTokenCreationDate(tokenAddress);
    const result = await pool.query(`
      INSERT INTO token_profiles (token_address, created_at, last_activity, cache_window)
      VALUES ($1, $2, NOW(), interval '10 minutes')
      RETURNING *
    `, [tokenAddress, created_at]);

    console.log(`Created new token profile for ${tokenAddress}`);
    return result.rows[0];

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
    await pool.query(`
      UPDATE token_profiles 
      SET last_activity = NOW()
      WHERE token_address = $1
    `, [tokenAddress]);

    // Determine new cache window based on token classification
    const newCacheWindow = await determineCacheWindow(tokenAddress, profile);
    
    if (newCacheWindow !== profile.cache_window) {
      await pool.query(`
        UPDATE token_profiles 
        SET cache_window = $1
        WHERE token_address = $2
      `, [newCacheWindow, tokenAddress]);
      
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
    const searchCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM token_searches 
      WHERE token_address = $1 AND created_at >= NOW() - interval '24 hours'
    `, [tokenAddress]);

    const searchFrequency = parseInt(searchCount.rows[0].count) || 0;
    
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
    const result = await pool.query(`
      SELECT * FROM token_profiles WHERE token_address = $1
    `, [tokenAddress]);

    return result.rows[0] || null;

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
