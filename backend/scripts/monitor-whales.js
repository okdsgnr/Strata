const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function monitorWhaleSystem() {
  try {
    console.log('🐋 Whale System Monitor');
    console.log('====================\n');

    // Check whale_durations table
    const whaleStats = await pool.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT token_address) as unique_tokens,
        COUNT(DISTINCT address) as unique_whales,
        MIN(last_seen) as oldest_record,
        MAX(last_seen) as newest_record,
        AVG(consecutive_days) as avg_days_held,
        MAX(consecutive_days) as max_days_held
      FROM whale_durations
    `);

    console.log('📊 Whale Durations Stats:');
    console.log(JSON.stringify(whaleStats.rows[0], null, 2));

    // Check token_profiles table
    const profileStats = await pool.query(`
      SELECT 
        COUNT(*) as total_profiles,
        COUNT(CASE WHEN last_activity > NOW() - interval '24 hours' THEN 1 END) as active_today,
        COUNT(CASE WHEN last_activity > NOW() - interval '7 days' THEN 1 END) as active_week,
        COUNT(CASE WHEN cache_window = interval '5 minutes' THEN 1 END) as new_tokens,
        COUNT(CASE WHEN cache_window = interval '15 minutes' THEN 1 END) as active_tokens,
        COUNT(CASE WHEN cache_window = interval '1 hour' THEN 1 END) as established_tokens
      FROM token_profiles
    `);

    console.log('\n🏷️ Token Profiles Stats:');
    console.log(JSON.stringify(profileStats.rows[0], null, 2));

    // Show recent whale activity
    const recentWhales = await pool.query(`
      SELECT 
        wd.token_address,
        wd.address,
        wd.consecutive_days,
        wd.usd_value,
        wd.last_seen,
        tp.cache_window
      FROM whale_durations wd
      JOIN token_profiles tp ON wd.token_address = tp.token_address
      WHERE wd.last_seen > NOW() - interval '24 hours'
      ORDER BY wd.last_seen DESC
      LIMIT 10
    `);

    console.log('\n🔄 Recent Whale Activity (last 24h):');
    recentWhales.rows.forEach(whale => {
      console.log(`  ${whale.token_address.slice(0,8)}... | ${whale.address.slice(0,8)}... | ${whale.consecutive_days}d | $${(whale.usd_value/1000).toFixed(0)}k | ${whale.last_seen.toISOString().slice(0,19)}`);
    });

    // Show top tokens by whale count
    const topTokens = await pool.query(`
      SELECT 
        token_address,
        COUNT(*) as whale_count,
        MAX(last_seen) as last_activity
      FROM whale_durations 
      WHERE last_seen > NOW() - interval '7 days'
      GROUP BY token_address
      ORDER BY whale_count DESC
      LIMIT 5
    `);

    console.log('\n🏆 Top Tokens by Whale Count (last 7 days):');
    topTokens.rows.forEach(token => {
      console.log(`  ${token.token_address.slice(0,8)}... | ${token.whale_count} whales | ${token.last_activity.toISOString().slice(0,19)}`);
    });

  } catch (error) {
    console.error('❌ Monitor failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run monitor if called directly
if (require.main === module) {
  monitorWhaleSystem().catch(console.error);
}

module.exports = { monitorWhaleSystem };
