const { getTokenSupplyDecimals, getTokenSupply, getAllHoldersForMint } = require('../lib/helius.js');
const { getPriceUSD, getLiquidityUSD } = require('../lib/price.js');
const { tierOf, calculateTierCounts, calculateTopNBalances } = require('../lib/tiers.js');
const { insertSearch, getLatestSnapshotInBucket, getRecentSnapshot, getPreviousSnapshot, insertSnapshot, insertTopHolders, upsertWhales } = require('../lib/db.js');
const { getLabelsForHolders, filterExcludedHolders } = require('../lib/labels.js');
const { generateAutoLabels } = require('../lib/labeling.js');
const { processWhaleDetection, getWhaleStats } = require('../lib/whale-detection.js');
const { updateTokenProfile, getTokenProfile } = require('../lib/token-profiles.js');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { mint, persistTopHolders = true } = req.body;
  if (!mint) return res.status(400).json({ error: 'mint required' });

  const bucket = Math.floor(Date.now() / 1000 / 600);

  try {
    // Log the search
    await insertSearch(mint);

    // Check for existing snapshot in this bucket (legacy)
    const existing = await getLatestSnapshotInBucket(mint, bucket);
    if (existing) {
      return res.json({ snapshot_id: existing.id, deduped: true });
    }

    // Time-based dedupe within last 10 minutes
    const recent = await getRecentSnapshot(mint, 600);
    if (recent) {
      return res.json({ snapshot_id: recent.id, deduped: true });
    }

    // Validate mint address format
    if (!mint || typeof mint !== 'string' || mint.length < 32) {
      return res.status(400).json({ error: 'Invalid mint address format' });
    }

    // Get token supply & decimals
    let supplyRaw, decimals, uiSupply;
    try {
      const supplyData = await getTokenSupply(mint);
      supplyRaw = supplyData.amountRaw;
      decimals = supplyData.decimals;
      uiSupply = supplyData.uiSupply;
    } catch (error) {
      console.error('Error getting token supply:', error);
      return res.status(400).json({ 
        error: 'Invalid token address or token not found',
        details: error.message 
      });
    }

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
    console.log(`Sample holder:`, holders[0] || 'No holders');
    console.log(`Price: ${price}, Sample USD: ${holders[0]?.usd || 'N/A'}`);

    const total_holders_all = holders.length;

    // Get labels for all holders
    const labelMap = await getLabelsForHolders(holders);

    // Filter out CEX and LP holders for analytics
    const analyzable = filterExcludedHolders(holders, labelMap);

    // Filter to eligible holders (USD >= 100) when price is available
    const eligible = price ? analyzable.filter(h => h.usd >= 100) : [];
    const total_holders_eligible = eligible.length;

    // Calculate tier counts (only when price is available)
    let tierCounts = {};
    if (price) {
      tierCounts = calculateTierCounts(eligible);
    } else {
      tierCounts = {
        whale_count: null,
        shark_count: null,
        dolphin_count: null,
        fish_count: null,
        shrimp_count: null
      };
    }

    // Calculate top N balances
    let topNBalances = {};
    if (price && eligible.length > 0) {
      topNBalances = calculateTopNBalances(eligible);
    } else {
      topNBalances = {
        top1_balance: 0,
        top10_balance: 0,
        top50_balance: 0,
        top100_balance: 0
      };
    }

    // Compute supply-based percents
    const topNPercent = uiSupply > 0 ? {
      top1_percent: topNBalances.top1_balance / uiSupply,
      top10_percent: topNBalances.top10_balance / uiSupply,
      top50_percent: topNBalances.top50_balance / uiSupply,
      top100_percent: topNBalances.top100_balance / uiSupply
    } : { top1_percent: 0, top10_percent: 0, top50_percent: 0, top100_percent: 0 };

    const tierSupplyUsd = price ? {
      shrimp: eligible.filter(h => tierOf(h.usd) === 'Shrimp').reduce((s, x) => s + x.ui, 0) / uiSupply,
      fish: eligible.filter(h => tierOf(h.usd) === 'Fish').reduce((s, x) => s + x.ui, 0) / uiSupply,
      dolphin: eligible.filter(h => tierOf(h.usd) === 'Dolphin').reduce((s, x) => s + x.ui, 0) / uiSupply,
      shark: eligible.filter(h => tierOf(h.usd) === 'Shark').reduce((s, x) => s + x.ui, 0) / uiSupply,
      whale: eligible.filter(h => tierOf(h.usd) === 'Whale').reduce((s, x) => s + x.ui, 0) / uiSupply
    } : { shrimp: 0, fish: 0, dolphin: 0, shark: 0, whale: 0 };

    const marketCapUsd = price ? price * uiSupply : null;

    // Insert snapshot
    const snapshotId = await insertSnapshot({
      token_address: mint,
      bucket_10m: bucket,
      price_usd: price,
      total_holders: total_holders_all,
      ...tierCounts,
      ...topNBalances
    });

    // Persist top holders for forensics
    if (persistTopHolders && eligible.length > 0) {
      const top100 = eligible
        .sort((a, b) => b.ui - a.ui)
        .slice(0, 100)
        .map(h => ({ ...h, tier: tierOf(h.usd) }));
      await insertTopHolders(snapshotId, mint, top100);
    }

    // Update whale registry (legacy)
    if (price) {
      const whales = analyzable.filter(h => h.usd >= 250000);
      if (whales.length > 0) {
        await upsertWhales(mint, whales);
      }
    }

    // Process whale detection and token profiles
    let whaleStats = null;
    let whaleStatsPending = false;
    
    try {
      // Update token profile (cache window, activity tracking)
      await updateTokenProfile(mint);
      
      // Process whale detection
      if (price && analyzable.length > 0) {
        const whaleResult = await processWhaleDetection(mint, analyzable, snapshotId, new Date());
        console.log(`Whale detection completed: ${whaleResult.whaleCount} whales, ${whaleResult.processed} processed`);
        
        // Get whale stats for response
        whaleStats = await getWhaleStats(mint, snapshotId);
      }
    } catch (whaleError) {
      console.error('Whale detection error:', whaleError);
      // Don't fail the entire request for whale detection errors
      whaleStatsPending = true;
    }

    // Auto-labeling: Generate labels for top holders, whales, and cross-token whales
    if (persistTopHolders) {
      await generateAutoLabels(snapshotId, mint);
    }

    // Deltas vs previous snapshot (most recent prior)
    const prev = await getPreviousSnapshot(mint);
    const deltas = prev ? {
      holders: total_holders_all - (prev.total_holders || 0),
      shrimp: (tierCounts.shrimp_count || 0) - (prev.shrimp_count || 0),
      fish: (tierCounts.fish_count || 0) - (prev.fish_count || 0),
      dolphin: (tierCounts.dolphin_count || 0) - (prev.dolphin_count || 0),
      shark: (tierCounts.shark_count || 0) - (prev.shark_count || 0),
      whale: (tierCounts.whale_count || 0) - (prev.whale_count || 0),
      top10_percent: topNPercent.top10_percent - (
        prev.top10_balance && uiSupply > 0 && prev.price_usd
          ? (Number(prev.top10_balance) / uiSupply) // approximation (denominator drift)
          : 0
      )
    } : null;

    // Notable holders (top 20 prioritized)
    const labeledEligible = eligible
      .map(h => ({ ...h, label: labelMap.get(h.owner) || null }))
      .sort((a, b) => (b.usd || 0) - (a.usd || 0));

    const priority = [];
    // include all labeled (CEX, LP, SmartMoney, TopHolder)
    for (const h of labeledEligible) {
      if (h.label) priority.push(h);
      if (priority.length >= 20) break;
    }
    // fill with whales (≥ $250k) if needed
    if (priority.length < 20) {
      for (const h of labeledEligible) {
        if (!h.label && h.usd >= 250000) priority.push(h);
        if (priority.length >= 20) break;
      }
    }

    const notable_holders = priority.slice(0, 20).map(h => ({
      address: h.owner,
      label: h.label?.label || null,
      balance_ui: h.ui,
      balance_usd: h.usd,
      percent_supply: uiSupply > 0 ? h.ui / uiSupply : 0
    }));

    const whales_detected = analyzable.filter(h => h.usd >= 250000).slice(0, 50).map(h => h.owner);

    // Build response object
    const response = { 
      snapshot_id: snapshotId, 
      created: true,
      token: { mint, decimals },
      price_usd: price,
      market_cap_usd: marketCapUsd,
      liquidity_usd: liquidityUsd,
      total_holders_all,
      total_holders_eligible,
      tier_counts: {
        shrimp: tierCounts.shrimp_count,
        fish: tierCounts.fish_count,
        dolphin: tierCounts.dolphin_count,
        shark: tierCounts.shark_count,
        whale: tierCounts.whale_count
      },
      topN_percent_supply: {
        top1: topNPercent.top1_percent,
        top10: topNPercent.top10_percent,
        top50: topNPercent.top50_percent,
        top100: topNPercent.top100_percent
      },
      percent_supply_by_tier: tierSupplyUsd,
      deltas,
      notable_holders,
      whales_detected,
      // legacy flat fields kept temporarily
      total_holders: total_holders_all,
      price_usd: price,
      ...tierCounts,
      ...topNBalances
    };

    // Add whale stats if available
    if (whaleStats) {
      response.whales = {
        count: whaleStats.count,
        supply_percent: whaleStats.count > 0 ? 
          (whaleStats.top.reduce((sum, w) => sum + w.usd_value, 0) / (marketCapUsd || 1)) * 100 : 0,
        retention: whaleStats.retention,
        top: whaleStats.top
      };
    }

    // Add pending flag if whale stats failed
    if (whaleStatsPending) {
      response.whale_stats_pending = true;
    }

    res.json(response);
  } catch (e) {
    console.error('Audit error:', e);
    res.status(500).json({ error: 'audit_failed', message: e.message });
  }
}

module.exports = { default: handler };
