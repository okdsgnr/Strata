const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        column_default,
        is_nullable,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'user_subscriptions'
      ORDER BY ordinal_position;
    `);

    console.log('Table Schema:');
    console.table(result.rows);

    const constraints = await pool.query(`
      SELECT
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        cc.check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_name = 'user_subscriptions';
    `);

    console.log('\nConstraints:');
    console.table(constraints.rows);

    const indexes = await pool.query(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'user_subscriptions';
    `);

    console.log('\nIndexes:');
    console.table(indexes.rows);

  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    await pool.end();
  }
}

checkSchema();
