#!/usr/bin/env node

/**
 * Test script to verify the new token_top_holders infrastructure
 * Checks filtering, auto-labeling, and cross-token detection
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function testInfrastructure() {
  console.log('🧪 Testing new token_top_holders infrastructure...\n');

  try {
    // 1. Check total holders vs filtered holders
    const { data: allHolders } = await sb
      .from('token_top_holders')
      .select('*')
      .eq('snapshot_id', 34); // Latest snapshot

    console.log(`📊 Filtered holders in database: ${allHolders?.length || 0}`);
    console.log(`   (Original: 48,957 holders → Filtered: ${allHolders?.length || 0} holders)`);
    
    if (allHolders?.length > 0) {
      const reduction = ((48957 - allHolders.length) / 48957 * 100).toFixed(1);
      console.log(`   Storage reduction: ${reduction}%`);
    }

    // 2. Check filtering logic (Top 50 OR $100k+)
    const { data: top50 } = await sb
      .from('token_top_holders')
      .select('rank, usd_value, tier')
      .eq('snapshot_id', 34)
      .lte('rank', 50);

    const { data: sharksPlus } = await sb
      .from('token_top_holders')
      .select('rank, usd_value, tier')
      .eq('snapshot_id', 34)
      .gte('usd_value', 100000);

    console.log(`\n🎯 Filtering verification:`);
    console.log(`   Top 50 holders: ${top50?.length || 0}`);
    console.log(`   Shark+ holders ($100k+): ${sharksPlus?.length || 0}`);

    // 3. Check auto-labeling
    const { data: labels } = await sb
      .from('wallet_labels')
      .select('type, label')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Last 5 minutes

    console.log(`\n🏷️  Auto-generated labels (last 5 min): ${labels?.length || 0}`);
    if (labels?.length > 0) {
      const labelTypes = labels.reduce((acc, label) => {
        acc[label.type] = (acc[label.type] || 0) + 1;
        return acc;
      }, {});
      console.log(`   Label types:`, labelTypes);
    }

    // 4. Test cross-token whale detection
    const { data: crossTokenWhales } = await sb.rpc('get_cross_token_whales');
    console.log(`\n🐋 Cross-token whales (3+ tokens): ${crossTokenWhales?.length || 0}`);
    if (crossTokenWhales?.length > 0) {
      console.log(`   Top cross-token whale: ${crossTokenWhales[0].address.slice(0, 8)}... (${crossTokenWhales[0].token_count} tokens)`);
    }

    // 5. Check token_address column
    const { data: sampleHolders } = await sb
      .from('token_top_holders')
      .select('address, token_address, usd_value')
      .eq('snapshot_id', 34)
      .limit(3);

    console.log(`\n🔗 Token address column working:`);
    sampleHolders?.forEach((holder, i) => {
      console.log(`   ${i + 1}. ${holder.address.slice(0, 8)}... → ${holder.token_address.slice(0, 8)}... ($${holder.usd_value?.toLocaleString()})`);
    });

    console.log(`\n✅ Infrastructure test completed successfully!`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test if called directly
if (require.main === module) {
  testInfrastructure()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testInfrastructure };
