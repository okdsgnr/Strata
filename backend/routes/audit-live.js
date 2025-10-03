const { getAllHoldersForMint, getTokenSupply } = require('../lib/helius.js');
const { getPriceUSD, getLiquidityUSD } = require('../lib/price.js');
const { getLabelsForHolders, filterExcludedHolders } = require('../lib/labels.js');
const { insertSnapshot, insertTopHolders, upsertWhales } = require('../lib/db.js');
const { calculateTierCounts, calculateTopNBalances, tierOf } = require('../lib/tiers.js');
const { updateTokenProfile, getTokenProfile } = require('../lib/token-profiles.js');
const { supabase } = require('../lib/supabase.js');
const usageTracker = require('../lib/usage-tracker.js');
const { LiquidityDetector } = require('../lib/liquidity-detector.js');
const { formatAuditResponse, getNotableHoldersWithChanges } = require('../lib/audit-formatter.js');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { mint } = req.body;
  if (!mint) return res.status(400).json({ error: 'mint required' });

  try {
    // Check if user has subscription for live data access
    const authHeader = req.headers.authorization;
    let hasActiveSubscription = false;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Authenticated user flow
      const token = authHeader.split(' ')[1];
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (!error && user) {
        const subscription = await usageTracker.checkAuthenticatedUser(user.id);
        hasActiveSubscription = subscription.hasActiveSubscription;
      }
    } else {
      // Anonymous users cannot access live data
      hasActiveSubscription = false;
    }

    if (!hasActiveSubscription) {
      return res.status(403).json({ 
        error: 'Live data access requires an active subscription',
        requiresSubscription: true
      });
    }

    // Start the live data fetch process in the background
    // Don't await this - let it run in background
    fetchLiveData(mint).catch(error => {
      console.error('Background live data fetch failed:', error);
    });

    // Return immediately with a success response
    return res.json({ 
      success: true, 
      message: 'Live data fetch started in background',
      mint: mint
    });

  } catch (error) {
    console.error('Error starting live data fetch:', error);
    return res.status(500).json({ 
      error: 'Failed to start live data fetch',
      details: error.message 
    });
  }
}

async function fetchLiveData(mint) {
  console.log(`Starting live data fetch for token ${mint}`);
  
  try {
    // Get token supply & decimals
    const supplyData = await getTokenSupply(mint);
    const { amountRaw: supplyRaw, decimals, uiSupply } = supplyData;

    // Fetch all holders using GPA
    const byOwner = await getAllHoldersForMint(mint);

    // Get price & liquidity
    const price = await getPriceUSD(mint);
    const liquidityUsd = await getLiquidityUSD(mint);

    // Convert to holders array with UI amounts
    const holders = [];
    for (const [owner, raw] of byOwner) {
      const ui = Number(raw) / 10 ** decimals;
      const usd = price ? ui * price : null;
      holders.push({ owner, raw, ui, usd, decimals });
    }

    console.log(`Processed ${holders.length} holders for mint ${mint}`);

    const total_holders_all = holders.length;

    // Get labels for all holders
    const labelMap = await getLabelsForHolders(holders);

    // Detect liquidity pools
    const liquidityDetector = new LiquidityDetector();
    const detectedLPs = await liquidityDetector.detectLiquidityPools(mint, holders);
    
    // Add detected LPs to label map
    detectedLPs.forEach(lp => {
      labelMap.set(lp.address, { 
        type: lp.type, 
        label: lp.label,
        confidence: lp.confidence,
        source: lp.source 
      });
    });

    // Filter out excluded holders (CEX, LP, etc.)
    const eligibleHolders = filterExcludedHolders(holders, labelMap);

    const total_holders_eligible = eligibleHolders.length;

    // Assign tiers to eligible holders
    eligibleHolders.forEach(holder => {
      holder.tier = tierOf(holder.usd);
    });

    // Calculate tier counts
    const tierCounts = calculateTierCounts(eligibleHolders);

    // Calculate supply concentration
    const sortedHolders = eligibleHolders
      .filter(h => h.ui > 0)
      .sort((a, b) => b.ui - a.ui);

    const totalSupply = uiSupply || 0;
    const topN_percent_supply = {
      top1: sortedHolders[0] ? (sortedHolders[0].ui / totalSupply) : 0,
      top10: sortedHolders.slice(0, 10).reduce((sum, h) => sum + h.ui, 0) / totalSupply,
      top50: sortedHolders.slice(0, 50).reduce((sum, h) => sum + h.ui, 0) / totalSupply,
      top100: sortedHolders.slice(0, 100).reduce((sum, h) => sum + h.ui, 0) / totalSupply
    };

    // Calculate percent supply by tier
    const percent_supply_by_tier = {};
    Object.keys(tierCounts).forEach(tier => {
      const tierHolders = eligibleHolders.filter(h => h.tier === tier);
      const tierSupply = tierHolders.reduce((sum, h) => sum + h.ui, 0);
      percent_supply_by_tier[tier] = totalSupply > 0 ? tierSupply / totalSupply : 0;
    });

    // Calculate top N balances
    const topNBalances = calculateTopNBalances(eligibleHolders);

    // Create snapshot record using the actual database schema
    const snapshotId = await insertSnapshot({
      token_address: mint,
      captured_at: new Date().toISOString(),
      bucket_10m: Math.floor(Date.now() / 1000 / 600),
      price_usd: price,
      total_holders: total_holders_all, // Use total holders count (all holders)
      whale_count: tierCounts.whale_count || 0,
      shark_count: tierCounts.shark_count || 0,
      dolphin_count: tierCounts.dolphin_count || 0,
      fish_count: tierCounts.fish_count || 0,
      shrimp_count: tierCounts.shrimp_count || 0,
      top1_balance: topNBalances.top1_balance || 0,
      top10_balance: topNBalances.top10_balance || 0,
      top50_balance: topNBalances.top50_balance || 0,
      top100_balance: topNBalances.top100_balance || 0
    });

    // Insert top holders
    await insertTopHolders(snapshotId, mint, eligibleHolders);

    // Update whale tracking
    const whaleHolders = eligibleHolders.filter(h => h.usd >= 250000);
    if (whaleHolders.length > 0) {
      await upsertWhales(mint, whaleHolders);
    }

    // Process notable holders with LP detection for the stored data
    try {
      // Get top holders from database to ensure they have LP labels
      const { data: topHolders } = await require('../lib/db.js').sb
        .from('token_top_holders')
        .select('*')
        .eq('token_address', mint)
        .eq('snapshot_id', snapshotId)
        .order('usd_value', { ascending: false })
        .limit(20);
      
      if (topHolders && topHolders.length > 0) {
        // Detect liquidity pools for these holders
        const liquidityDetector = new LiquidityDetector();
        const detectedLPs = await liquidityDetector.detectLiquidityPools(mint, topHolders.map(h => ({
          owner: h.address,
          ui: h.balance,
          usd: h.usd_value
        })));
        
        // Create LP map for quick lookup
        const lpMap = new Map();
        detectedLPs.forEach(lp => {
          lpMap.set(lp.address, lp);
        });
        
        // Update the stored holders with LP labels
        for (const holder of topHolders) {
          if (lpMap.has(holder.address)) {
            const lp = lpMap.get(holder.address);
            // Update the holder record with LP label
            await require('../lib/db.js').sb
              .from('token_top_holders')
              .update({ label: lp.label })
              .eq('id', holder.id);
          }
        }
      }
    } catch (error) {
      console.error('Error processing notable holders with LP detection:', error);
    }

    // Calculate market cap
    const market_cap_usd = price && uiSupply ? price * uiSupply : null;

    // Update token profile
    await updateTokenProfile(mint, {
      last_analyzed: new Date().toISOString(),
      holder_count: total_holders_eligible,
      market_cap_usd: market_cap_usd,
      price_usd: price
    });

    console.log(`Live data fetch completed for token ${mint}, snapshot ID: ${snapshotId}`);

  } catch (error) {
    console.error(`Live data fetch failed for token ${mint}:`, error);
  }
}

module.exports = { handler };
