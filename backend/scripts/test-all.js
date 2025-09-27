require('dotenv').config();
const { killExistingServer, startServer } = require('./test-server');
const { testRoute, runTests: runRouteTests } = require('./test-routes');
const { validateSubscriptionData, calculateExpiryDate, formatSubscriptionData } = require('../lib/subscription-validator');
const { getPriceUSD } = require('../lib/price');
const { supabase } = require('../lib/supabase');

async function testSubscriptionValidation() {
  console.log('\nTesting Subscription Validation');
  console.log('==============================');

  const testCases = [
    {
      name: 'Valid monthly subscription',
      data: {
        user_id: '123e4567-e89b-42d3-a456-556642440000',
        plan: 'monthly',
        status: 'active'
      },
      expectValid: true
    },
    {
      name: 'Invalid plan',
      data: {
        user_id: '123e4567-e89b-42d3-a456-556642440000',
        plan: 'invalid',
        status: 'active'
      },
      expectValid: false
    },
    {
      name: 'Invalid status',
      data: {
        user_id: '123e4567-e89b-42d3-a456-556642440000',
        plan: 'monthly',
        status: 'invalid'
      },
      expectValid: false
    },
    {
      name: 'Invalid UUID',
      data: {
        user_id: 'not-a-uuid',
        plan: 'monthly',
        status: 'active'
      },
      expectValid: false
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    console.log(`\nTest: ${test.name}`);
    const result = validateSubscriptionData(test.data);
    console.log('Result:', result);

    if (result.isValid === test.expectValid) {
      console.log('✅ Test passed');
      passed++;
    } else {
      console.log('❌ Test failed');
      failed++;
    }
  }

  return { passed, failed };
}

async function testPriceFetching() {
  console.log('\nTesting Price Fetching');
  console.log('=====================');

  const testTokens = [
    // Known Solana tokens
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'So11111111111111111111111111111111111111112',   // Wrapped SOL
  ];

  let passed = 0;
  let failed = 0;

  for (const token of testTokens) {
    console.log(`\nFetching price for ${token}`);
    try {
      const price = await getPriceUSD(token);
      console.log('Price:', price);
      
      if (typeof price === 'number' && !isNaN(price) && price > 0) {
        console.log('✅ Test passed');
        passed++;
      } else {
        console.log('❌ Test failed - Invalid price');
        failed++;
      }
    } catch (error) {
      console.error('Error:', error);
      console.log('❌ Test failed - Error fetching price');
      failed++;
    }
  }

  return { passed, failed };
}

async function testDatabaseOperations() {
  console.log('\nTesting Database Operations');
  console.log('==========================');

  let passed = 0;
  let failed = 0;

  // Test user subscription operations
  console.log('\nTesting subscription operations');
  try {
    // Create test user first
    const { data: { user }, error: userError } = await supabase.auth.admin.createUser({
      email: `test+${Date.now()}@example.com`,
      password: 'testpassword123',
      email_confirm: true
    });

    if (userError) throw userError;
    console.log('✅ Test user created:', user.id);
    passed++;

    const testSub = formatSubscriptionData({
      user_id: user.id,
      plan: 'monthly',
      status: 'active',
      tx_signature: `test_tx_${Date.now()}`
    });

    // Insert
    const { data: inserted, error: insertError } = await supabase
      .from('user_subscriptions')
      .upsert(testSub);

    if (insertError) throw insertError;
    console.log('✅ Insert passed');
    passed++;

    // Read
    const { data: read, error: readError } = await supabase
      .from('user_subscriptions')
      .select()
      .eq('user_id', testSub.user_id)
      .single();

    if (readError) throw readError;
    if (read.plan === testSub.plan) {
      console.log('✅ Read passed');
      passed++;
    } else {
      throw new Error('Read data mismatch');
    }

    // Update
    const { error: updateError } = await supabase
      .from('user_subscriptions')
      .update({ status: 'canceled' })
      .eq('user_id', testSub.user_id);

    if (updateError) throw updateError;
    console.log('✅ Update passed');
    passed++;

    // Delete subscription
    const { error: deleteSubError } = await supabase
      .from('user_subscriptions')
      .delete()
      .eq('user_id', testSub.user_id);

    if (deleteSubError) throw deleteSubError;
    console.log('✅ Delete subscription passed');
    passed++;

    // Delete test user
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteUserError) throw deleteUserError;
    console.log('✅ Delete user passed');
    passed++;

  } catch (error) {
    console.error('Database test failed:', error);
    failed++;
  }

  return { passed, failed };
}

async function runAllTests() {
  try {
    console.log('Starting All Tests');
    console.log('=================\n');

    let totalPassed = 0;
    let totalFailed = 0;

    // Kill any existing server
    await killExistingServer();

    // Start server
    const server = await startServer();
    console.log('Server started\n');

    try {
      // Run route tests
      console.log('Running Route Tests...');
      const routeResults = await runRouteTests();
      if (routeResults) totalPassed += 6; // We know there are 6 route tests

      // Run subscription validation tests
      const validationResults = await testSubscriptionValidation();
      totalPassed += validationResults.passed;
      totalFailed += validationResults.failed;

      // Run price fetching tests
      const priceResults = await testPriceFetching();
      totalPassed += priceResults.passed;
      totalFailed += priceResults.failed;

      // Run database tests
      const dbResults = await testDatabaseOperations();
      totalPassed += dbResults.passed;
      totalFailed += dbResults.failed;

    } finally {
      // Cleanup
      server.kill();
    }

    console.log('\nFinal Results');
    console.log('=============');
    console.log(`Total Passed: ${totalPassed}`);
    console.log(`Total Failed: ${totalFailed}`);

    return totalFailed === 0;
  } catch (error) {
    console.error('Test runner failed:', error);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  runAllTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Tests failed:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests };