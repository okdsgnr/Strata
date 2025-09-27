#!/usr/bin/env node

/**
 * Nightly Cleanup Job
 * Removes snapshots and top holders older than 30 days
 * Run this via cron: 0 2 * * * /path/to/node /path/to/cleanup.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function cleanupOldData() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  console.log(`🧹 Starting cleanup of data older than ${thirtyDaysAgo}`);
  
  try {
    // 1. Delete old token_top_holders first (due to foreign key constraints)
    const { data: deletedHolders, error: holdersError } = await sb
      .from('token_top_holders')
      .delete()
      .lt('created_at', thirtyDaysAgo)
      .select('id');
    
    if (holdersError) {
      console.error('❌ Error deleting old holders:', holdersError);
      return;
    }
    
    console.log(`✅ Deleted ${deletedHolders?.length || 0} old holder records`);
    
    // 2. Delete old token_snapshots
    const { data: deletedSnapshots, error: snapshotsError } = await sb
      .from('token_snapshots')
      .delete()
      .lt('created_at', thirtyDaysAgo)
      .select('id');
    
    if (snapshotsError) {
      console.error('❌ Error deleting old snapshots:', snapshotsError);
      return;
    }
    
    console.log(`✅ Deleted ${deletedSnapshots?.length || 0} old snapshot records`);
    
    // 3. Clean up orphaned whale_wallets (optional - keep for now)
    // const { data: deletedWhales, error: whalesError } = await sb
    //   .from('whale_wallets')
    //   .delete()
    //   .lt('last_seen', thirtyDaysAgo)
    //   .select('id');
    
    // if (whalesError) {
    //   console.error('❌ Error deleting old whales:', whalesError);
    //   return;
    // }
    
    // console.log(`✅ Deleted ${deletedWhales?.length || 0} old whale records`);
    
    console.log('🎉 Cleanup completed successfully!');
    
  } catch (error) {
    console.error('💥 Cleanup failed:', error);
    process.exit(1);
  }
}

// Run cleanup if called directly
if (require.main === module) {
  cleanupOldData()
    .then(() => {
      console.log('✨ Cleanup job finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Cleanup job failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupOldData };
