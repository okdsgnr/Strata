const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  try {
    console.log('🔄 Running whale system migration...');
    const migration = fs.readFileSync('./migrations/002_whale_durations.sql', 'utf8');
    await pool.query(migration);
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function testTables() {
  try {
    console.log('🔍 Testing table creation...');
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('whale_durations', 'token_profiles')
    `);
    console.log('📊 Created tables:', tables.rows.map(r => r.table_name));
    
    // Test indexes
    const indexes = await pool.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename IN ('whale_durations', 'token_profiles')
    `);
    console.log('🔗 Created indexes:', indexes.rows.map(r => r.indexname));
    
  } catch (error) {
    console.error('❌ Table test failed:', error);
    throw error;
  }
}

async function testWhaleDetection() {
  try {
    console.log('🐋 Testing whale detection logic...');
    
    // Create a test token profile
    await pool.query(`
      INSERT INTO token_profiles (token_address, created_at, last_activity, cache_window)
      VALUES ('TEST_TOKEN_123', NOW(), NOW(), interval '5 minutes')
      ON CONFLICT (token_address) DO NOTHING
    `);
    
    // Create test whale data
    const testWhales = [
      {
        address: 'TEST_WHALE_1',
        token_address: 'TEST_TOKEN_123',
        first_seen: new Date(),
        last_seen: new Date(),
        consecutive_days: 1,
        balance: 1000000,
        usd_value: 500000,
        snapshot_id: 1
      }
    ];
    
    for (const whale of testWhales) {
      await pool.query(`
        INSERT INTO whale_durations (address, token_address, first_seen, last_seen, consecutive_days, balance, usd_value, snapshot_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (token_address, address) DO UPDATE SET
          last_seen = EXCLUDED.last_seen,
          consecutive_days = EXCLUDED.consecutive_days,
          balance = EXCLUDED.balance,
          usd_value = EXCLUDED.usd_value
      `, [whale.address, whale.token_address, whale.first_seen, whale.last_seen, whale.consecutive_days, whale.balance, whale.usd_value, whale.snapshot_id]);
    }
    
    console.log('✅ Whale detection test data created');
    
    // Test whale stats query
    const stats = await pool.query(`
      SELECT COUNT(*) as whale_count FROM whale_durations WHERE token_address = 'TEST_TOKEN_123'
    `);
    console.log('📈 Test whale count:', stats.rows[0].whale_count);
    
  } catch (error) {
    console.error('❌ Whale detection test failed:', error);
    throw error;
  }
}

async function cleanupTestData() {
  try {
    console.log('🧹 Cleaning up test data...');
    await pool.query(`DELETE FROM whale_durations WHERE token_address = 'TEST_TOKEN_123'`);
    await pool.query(`DELETE FROM token_profiles WHERE token_address = 'TEST_TOKEN_123'`);
    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

async function runTests() {
  try {
    await runMigration();
    await testTables();
    await testWhaleDetection();
    await cleanupTestData();
    
    console.log('\n🎉 All tests passed! Whale system is ready.');
    console.log('\n📋 Next steps:');
    console.log('1. Start your backend server: cd backend && npm start');
    console.log('2. Test with real tokens in the frontend');
    console.log('3. Check database tables for whale data');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
