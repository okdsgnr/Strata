const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const WHALE_THRESHOLD_USD = 250000; // $250k minimum for whale status

/**
 * Process whale detection for a snapshot
 * @param {string} tokenAddress - The token mint address
 * @param {Array} holders - Array of holder objects with {address, balance, usd_value}
 * @param {number} snapshotId - The snapshot ID
 * @param {Date} snapshotTime - The snapshot timestamp
 */
async function processWhaleDetection(tokenAddress, holders, snapshotId, snapshotTime) {
  try {
    // Filter whales (≥ $250k USD value)
    const whales = holders.filter(holder => holder.usd_value >= WHALE_THRESHOLD_USD);
    
    if (whales.length === 0) {
      console.log(`No whales found for token ${tokenAddress}`);
      return { whaleCount: 0, processed: 0 };
    }

    console.log(`Processing ${whales.length} whales for token ${tokenAddress}`);

    // Get existing whale records for this token
    const existingWhales = await getExistingWhales(tokenAddress);
    const existingWhaleMap = new Map(existingWhales.map(w => [w.address, w]));

    let processed = 0;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const whale of whales) {
        const existing = existingWhaleMap.get(whale.address);
        
        if (existing) {
          // Update existing whale
          const isConsecutive = isConsecutiveDay(existing.last_seen, snapshotTime);
          const newConsecutiveDays = isConsecutive ? existing.consecutive_days + 1 : 1;
          
          await client.query(`
            UPDATE whale_durations 
            SET last_seen = $1, consecutive_days = $2, balance = $3, usd_value = $4, snapshot_id = $5
            WHERE token_address = $6 AND address = $7
          `, [snapshotTime, newConsecutiveDays, whale.balance, whale.usd_value, snapshotId, tokenAddress, whale.address]);
          
        } else {
          // Insert new whale
          await client.query(`
            INSERT INTO whale_durations (address, token_address, first_seen, last_seen, consecutive_days, balance, usd_value, snapshot_id)
            VALUES ($1, $2, $3, $4, 1, $5, $6, $7)
          `, [whale.address, tokenAddress, snapshotTime, snapshotTime, whale.balance, whale.usd_value, snapshotId]);
        }
        
        processed++;
      }

      await client.query('COMMIT');
      console.log(`Successfully processed ${processed} whales for token ${tokenAddress}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { whaleCount: whales.length, processed };

  } catch (error) {
    console.error('Error in whale detection:', error);
    throw error;
  }
}

/**
 * Get existing whale records for a token
 */
async function getExistingWhales(tokenAddress) {
  const result = await pool.query(`
    SELECT address, last_seen, consecutive_days
    FROM whale_durations 
    WHERE token_address = $1
  `, [tokenAddress]);
  
  return result.rows;
}

/**
 * Check if the new snapshot is consecutive to the last seen date
 */
function isConsecutiveDay(lastSeen, newSnapshotTime) {
  if (!lastSeen) return false;
  
  const lastSeenDate = new Date(lastSeen);
  const newSnapshotDate = new Date(newSnapshotTime);
  
  // Check if new snapshot is exactly 1 day after last seen
  const oneDayMs = 24 * 60 * 60 * 1000;
  const timeDiff = newSnapshotDate.getTime() - lastSeenDate.getTime();
  
  // Allow for some tolerance (within 25 hours to account for timing variations)
  return timeDiff >= oneDayMs && timeDiff <= (25 * 60 * 60 * 1000);
}

/**
 * Get whale statistics for a token
 */
async function getWhaleStats(tokenAddress, snapshotId) {
  try {
    // Get current snapshot whales
    const currentWhales = await pool.query(`
      SELECT wd.address, wd.usd_value, wd.consecutive_days, wd.balance
      FROM whale_durations wd
      WHERE wd.token_address = $1 AND wd.snapshot_id = $2
      ORDER BY wd.usd_value DESC
      LIMIT 10
    `, [tokenAddress, snapshotId]);

    // Get retention stats
    const retentionStats = await pool.query(`
      WITH current_whales AS (
        SELECT address FROM whale_durations 
        WHERE token_address = $1 AND snapshot_id = $2
      ),
      whales_7d_ago AS (
        SELECT DISTINCT address FROM whale_durations 
        WHERE token_address = $1 AND last_seen >= $3 - interval '7 days'
      ),
      whales_30d_ago AS (
        SELECT DISTINCT address FROM whale_durations 
        WHERE token_address = $1 AND last_seen >= $3 - interval '30 days'
      ),
      whales_90d_ago AS (
        SELECT DISTINCT address FROM whale_durations 
        WHERE token_address = $1 AND last_seen >= $3 - interval '90 days'
      )
      SELECT 
        (SELECT COUNT(*) FROM current_whales) as total_whales,
        (SELECT COUNT(*) FROM current_whales cw JOIN whales_7d_ago w7 ON cw.address = w7.address) as retained_7d,
        (SELECT COUNT(*) FROM current_whales cw JOIN whales_30d_ago w30 ON cw.address = w30.address) as retained_30d,
        (SELECT COUNT(*) FROM current_whales cw JOIN whales_90d_ago w90 ON cw.address = w90.address) as retained_90d
    `, [tokenAddress, snapshotId, new Date()]);

    const stats = retentionStats.rows[0];
    const totalWhales = parseInt(stats.total_whales) || 0;
    
    return {
      count: totalWhales,
      retention: {
        '7d': totalWhales > 0 ? Math.round((parseInt(stats.retained_7d) / totalWhales) * 100) : 0,
        '30d': totalWhales > 0 ? Math.round((parseInt(stats.retained_30d) / totalWhales) * 100) : 0,
        '90d': totalWhales > 0 ? Math.round((parseInt(stats.retained_90d) / totalWhales) * 100) : 0
      },
      top: currentWhales.rows.map(whale => ({
        address: whale.address,
        usd_value: parseFloat(whale.usd_value),
        days_held: whale.consecutive_days
      }))
    };

  } catch (error) {
    console.error('Error getting whale stats:', error);
    return {
      count: 0,
      retention: { '7d': 0, '30d': 0, '90d': 0 },
      top: []
    };
  }
}

module.exports = {
  processWhaleDetection,
  getWhaleStats
};
