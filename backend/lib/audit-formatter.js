const { sb } = require('./db.js');

/**
 * Formats audit data into the standard response format
 * Used by both cached and live audit endpoints to ensure identical experience
 */
async function formatAuditResponse({
  mint,
  snapshot,
  dataAge,
  tokenProfile,
  totalSupply,
  price,
  total_holders_eligible,
  tierCounts,
  topNBalances,
  topNPercent,
  deltas,
  notable_holders,
  whaleStats = null,
  whaleStatsPending = false
}) {
  // Calculate holder distribution percentages (what % of total holders each tier represents)
  const total_holders_all = snapshot?.total_holders || 0;
  const whaleHolderPercent = total_holders_all > 0 ? (tierCounts.whale_count || 0) / total_holders_all : 0;
  const sharkHolderPercent = total_holders_all > 0 ? (tierCounts.shark_count || 0) / total_holders_all : 0;
  const dolphinHolderPercent = total_holders_all > 0 ? (tierCounts.dolphin_count || 0) / total_holders_all : 0;
  const fishHolderPercent = total_holders_all > 0 ? (tierCounts.fish_count || 0) / total_holders_all : 0;
  const shrimpHolderPercent = total_holders_all > 0 ? (tierCounts.shrimp_count || 0) / total_holders_all : 0;

  // Calculate supply concentration as percentages of total supply
  const top1Percent = topNBalances.top1_balance ? topNBalances.top1_balance / totalSupply : 0;
  const top10Percent = topNBalances.top10_balance ? topNBalances.top10_balance / totalSupply : 0;
  const top50Percent = topNBalances.top50_balance ? topNBalances.top50_balance / totalSupply : 0;
  const top100Percent = topNBalances.top100_balance ? topNBalances.top100_balance / totalSupply : 0;

  return {
    token: tokenProfile,
    created: !!snapshot,
    snapshot_id: snapshot?.id || null,
    data_age: dataAge,
    total_holders: snapshot?.total_holders || 0,
    total_holders_all: snapshot?.total_holders || 0,
    total_holders_eligible,
    price_usd: price,
    market_cap_usd: price ? price * totalSupply : null,
    liquidity_usd: null, // Not calculated in current system
    supply_concentration: {
      top1: top1Percent,
      top10: top10Percent,
      top50: top50Percent,
      top100: top100Percent
    },
    percent_holders_by_tier: {
      whale: whaleHolderPercent,
      shark: sharkHolderPercent,
      dolphin: dolphinHolderPercent,
      fish: fishHolderPercent,
      shrimp: shrimpHolderPercent
    },
    tier_counts: {
      whale: tierCounts.whale_count || 0,
      shark: tierCounts.shark_count || 0,
      dolphin: tierCounts.dolphin_count || 0,
      fish: tierCounts.fish_count || 0,
      shrimp: tierCounts.shrimp_count || 0
    },
    topN_percent_supply: {
      top1: top1Percent,
      top10: top10Percent,
      top50: top50Percent,
      top100: top100Percent
    },
    deltas,
    notable_holders,
    whale_stats: whaleStats,
    whale_stats_pending: whaleStatsPending,
    // Flat fields for backward compatibility
    whale_count: tierCounts.whale_count || 0,
    shark_count: tierCounts.shark_count || 0,
    dolphin_count: tierCounts.dolphin_count || 0,
    fish_count: tierCounts.fish_count || 0,
    shrimp_count: tierCounts.shrimp_count || 0,
    top1_balance: topNBalances.top1_balance || 0,
    top10_balance: topNBalances.top10_balance || 0,
    top50_balance: topNBalances.top50_balance || 0,
    top100_balance: topNBalances.top100_balance || 0
  };
}

/**
 * Fetches and formats notable holders with percentage changes
 * Used by both cached and live endpoints
 */
async function getNotableHoldersWithChanges(mint, currentHolders, currentSnapshotId = null, currentTotalSupply = null) {
  try {
    // Get the most recent snapshot ID for this token if not provided
    let latestSnapshotId = currentSnapshotId;
    if (!latestSnapshotId) {
      const { data: latestSnapshot } = await sb
        .from('token_snapshots')
        .select('id')
        .eq('token_address', mint)
        .order('captured_at', { ascending: false })
        .limit(1)
        .single();
      
      if (!latestSnapshot) return [];
      latestSnapshotId = latestSnapshot.id;
    }

    // Get previous snapshot for delta calculation
    // First get the current snapshot's timestamp
    let currentSnapshotTimestamp = new Date().toISOString();
    if (currentSnapshotId) {
      const { data: currentSnapshot } = await sb
        .from('token_snapshots')
        .select('captured_at')
        .eq('id', currentSnapshotId)
        .single();
      if (currentSnapshot) {
        currentSnapshotTimestamp = currentSnapshot.captured_at;
      }
    }
    
    // Find the most recent previous snapshot
    const { data: prevSnapshot } = await sb
      .from('token_snapshots')
      .select('id')
      .eq('token_address', mint)
      .lt('captured_at', currentSnapshotTimestamp)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // Get previous holders for comparison
    let prevHolders = [];
    if (prevSnapshot) {
      const { data: prevTopHolders } = await sb
        .from('token_top_holders')
        .select('address, balance, usd_value')
        .eq('token_address', mint)
        .eq('snapshot_id', prevSnapshot.id);
      prevHolders = prevTopHolders || [];
    }
    
    // Create a map of previous token balances for exact comparison
    const prevBalanceMap = new Map();
    prevHolders.forEach(h => {
      prevBalanceMap.set(h.address, h.balance || 0);
    });
    
    // Format current holders with percentage changes based on EXACT token balances
    const hasPrevious = !!prevSnapshot;
    return currentHolders.map(h => {
      const prevBalance = prevBalanceMap.get(h.address) || 0;
      const currentBalance = h.balance_ui || h.ui || 0;
      
      // Calculate percentage change based on exact token amounts
      let percentChange = 0;
      if (!hasPrevious) {
        percentChange = null; // no previous snapshot, suppress change
      } else if (prevBalance > 0 && currentBalance > 0) {
        // Both balances exist - calculate actual percentage change
        percentChange = ((currentBalance - prevBalance) / prevBalance) * 100;
      } else if (prevBalance > 0 && currentBalance === 0) {
        // Holder sold all tokens
        percentChange = -100;
      } else if (prevBalance === 0 && currentBalance > 0) {
        // New holder (wasn't in previous snapshot)
        percentChange = 100; // 100% increase from 0
      } else {
        // Both are 0 or no previous data
        percentChange = 0;
      }
      
      return {
        address: h.address,
        label: h.label || null,
        balance_ui: currentBalance,
        balance_usd: h.balance_usd || h.usd || 0,
        percent_supply: h.percent_supply || 0,
        percent_change: percentChange
      };
    });
  } catch (error) {
    console.error('Error fetching notable holders with changes:', error);
    return currentHolders.map(h => ({
      address: h.address,
      label: h.label || null,
      balance_ui: h.balance_ui || h.ui || 0,
      balance_usd: h.balance_usd || h.usd || 0,
      percent_supply: h.percent_supply || 0,
      percent_change: 0
    }));
  }
}

module.exports = {
  formatAuditResponse,
  getNotableHoldersWithChanges
};
