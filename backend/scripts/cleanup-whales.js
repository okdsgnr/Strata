const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Cleanup old whale duration data (older than 90 days)
 */
async function cleanupOldWhaleData() {
  try {
    console.log('Starting whale data cleanup...');
    
    const result = await pool.query(`
      DELETE FROM whale_durations 
      WHERE last_seen < NOW() - interval '90 days'
    `);
    
    console.log(`Cleaned up ${result.rowCount} old whale duration records`);
    
    // Also cleanup old token profiles that haven't been active
    const profileResult = await pool.query(`
      DELETE FROM token_profiles 
      WHERE last_activity < NOW() - interval '180 days'
    `);
    
    console.log(`Cleaned up ${profileResult.rowCount} inactive token profiles`);
    
  } catch (error) {
    console.error('Error during whale data cleanup:', error);
    throw error;
  }
}

/**
 * Get whale data statistics
 */
async function getWhaleDataStats() {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_whale_records,
        COUNT(DISTINCT token_address) as unique_tokens,
        COUNT(DISTINCT address) as unique_whales,
        MIN(last_seen) as oldest_record,
        MAX(last_seen) as newest_record
      FROM whale_durations
    `);
    
    const tokenStats = await pool.query(`
      SELECT 
        COUNT(*) as total_token_profiles,
        COUNT(CASE WHEN last_activity > NOW() - interval '7 days' THEN 1 END) as active_last_week,
        COUNT(CASE WHEN last_activity > NOW() - interval '30 days' THEN 1 END) as active_last_month
      FROM token_profiles
    `);
    
    console.log('Whale Data Statistics:');
    console.log(JSON.stringify(stats.rows[0], null, 2));
    console.log('Token Profile Statistics:');
    console.log(JSON.stringify(tokenStats.rows[0], null, 2));
    
  } catch (error) {
    console.error('Error getting whale data stats:', error);
    throw error;
  }
}

// Run cleanup if called directly
if (require.main === module) {
  (async () => {
    try {
      await getWhaleDataStats();
      await cleanupOldWhaleData();
      console.log('Whale data cleanup completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Cleanup failed:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  cleanupOldWhaleData,
  getWhaleDataStats
};
