const { sb, upsertWalletLabel } = require('./db.js');

/**
 * Auto-labeling system for wallets based on their holdings and behavior
 * Runs after every snapshot to keep labels current
 */

async function generateAutoLabels(snapshotId, tokenAddress) {
  try {
    // Get the snapshot data
    const { data: snapshot } = await sb
      .from('token_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single();

    if (!snapshot) {
      console.warn(`Snapshot ${snapshotId} not found for labeling`);
      return;
    }

    // 1. Label Top 10 holders
    await labelTopHolders(tokenAddress, snapshotId);
    
    // 2. Label Whales and Sharks
    await labelWhalesAndSharks(tokenAddress, snapshotId);
    
    // 3. Detect cross-token whales
    await detectCrossTokenWhales();
    
    console.log(`✅ Auto-labeling completed for snapshot ${snapshotId}`);
    
  } catch (error) {
    console.error('❌ Auto-labeling failed:', error);
  }
}

async function labelTopHolders(tokenAddress, snapshotId) {
  // Get top 10 holders for this token
  const { data: topHolders } = await sb
    .from('token_top_holders')
    .select('address, rank')
    .eq('token_address', tokenAddress)
    .eq('snapshot_id', snapshotId)
    .lte('rank', 10)
    .order('rank');

  if (!topHolders?.length) return;

  // Label each top 10 holder
  for (const holder of topHolders) {
    await upsertWalletLabel(
      holder.address,
      'TopHolder',
      `Top ${holder.rank} $${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}`,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Expires in 30 days
    );
  }
}

async function labelWhalesAndSharks(tokenAddress, snapshotId) {
  // Get whales and sharks for this token
  const { data: largeHolders } = await sb
    .from('token_top_holders')
    .select('address, tier, usd_value')
    .eq('token_address', tokenAddress)
    .eq('snapshot_id', snapshotId)
    .in('tier', ['Whale', 'Shark']);

  if (!largeHolders?.length) return;

  // Label each whale/shark
  for (const holder of largeHolders) {
    const label = holder.tier === 'Whale' ? 'Whale' : 'Shark';
    const tokenSymbol = tokenAddress.slice(0, 4) + '...' + tokenAddress.slice(-4);
    
    await upsertWalletLabel(
      holder.address,
      label,
      `${label} in $${tokenSymbol}`,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Expires in 30 days
    );
  }
}

async function detectCrossTokenWhales() {
  // Get wallets that hold 3+ tokens at whale/shark level in last 30 days
  const { data: crossTokenWhales } = await sb.rpc('get_cross_token_whales');
  
  if (!crossTokenWhales?.length) return;

  // Label each cross-token whale
  for (const whale of crossTokenWhales) {
    await upsertWalletLabel(
      whale.address,
      'CrossTokenWhale',
      `Cross-Token Whale (${whale.token_count} tokens)`,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Expires in 30 days
    );
  }
}

/**
 * Clean up expired labels (run this periodically)
 */
async function cleanupExpiredLabels() {
  const now = new Date().toISOString();
  
  const { error } = await sb
    .from('wallet_labels')
    .delete()
    .lt('expires_at', now);
  
  if (error) {
    console.error('❌ Error cleaning up expired labels:', error);
  } else {
    console.log('✅ Cleaned up expired labels');
  }
}

module.exports = {
  generateAutoLabels,
  cleanupExpiredLabels
};
