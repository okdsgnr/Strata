const { getTokenSupplyDecimals, getTokenSupply, getAllHoldersForMint } = require('../lib/helius.js');
const { getPriceUSD, getLiquidityUSD, getCachedTokenMetadata, getTokenMetadata } = require('../lib/price.js');
const { tierOf, calculateTierCounts, calculateTopNBalances } = require('../lib/tiers.js');
const { insertSearch, getLatestSnapshotInBucket, getRecentSnapshot, getPreviousSnapshot, getPreviousSnapshotBefore, insertSnapshot, insertTopHolders, upsertWhales, updateSnapshotMeta } = require('../lib/db.js');
const { getLabelsForHolders, filterExcludedHolders } = require('../lib/labels.js');
const { generateAutoLabels } = require('../lib/labeling.js');
const { processWhaleDetection, getWhaleStats } = require('../lib/whale-detection.js');
const { updateTokenProfile, getTokenProfile } = require('../lib/token-profiles.js');
const { formatAuditResponse, getNotableHoldersWithChanges } = require('../lib/audit-formatter.js');
const { LiquidityDetector } = require('../lib/liquidity-detector.js');

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
    let { name: tokenName, symbol: tokenTicker } = getCachedTokenMetadata(mint);
    if (!tokenName || !tokenTicker) {
      const meta = await getTokenMetadata(mint);
      tokenName = tokenName || meta.name;
      tokenTicker = tokenTicker || meta.symbol;
    }
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

    // Filter out CEX and LP holders for analytics
    const analyzable = filterExcludedHolders(holders, labelMap);

    // Filter to eligible holders (USD >= 100) when price is available
    const eligible = price ? analyzable.filter(h => h.usd >= 100) : [];
    const total_holders_eligible = eligible.length;

    // Assign tiers to eligible holders
    if (price) {
      eligible.forEach(holder => {
        holder.tier = tierOf(holder.usd);
      });
    }

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

    // Compute tier UI totals and counts using all non-excluded holders.
    // Include < $100 balances by folding them into Shrimp, so totals approach 100%.
    let tierUiTotals = { shrimp: 0, fish: 0, dolphin: 0, shark: 0, whale: 0 };
    let tierCountTotals = { shrimp: 0, fish: 0, dolphin: 0, shark: 0, whale: 0 };
    if (price && uiSupply > 0) {
      for (const h of analyzable) {
        if (h.usd == null) continue;
        const t = tierOf(h.usd) || (h.usd < 100 ? 'Shrimp' : null);
        if (!t) continue;
        const key = t.toLowerCase();
        if (tierUiTotals[key] != null) tierUiTotals[key] += h.ui;
        if (tierCountTotals[key] != null) tierCountTotals[key] += 1;
      }
    }
    const tierSupplyUsd = uiSupply > 0 ? {
      shrimp: tierUiTotals.shrimp / uiSupply,
      fish: tierUiTotals.fish / uiSupply,
      dolphin: tierUiTotals.dolphin / uiSupply,
      shark: tierUiTotals.shark / uiSupply,
      whale: tierUiTotals.whale / uiSupply
    } : { shrimp: 0, fish: 0, dolphin: 0, shark: 0, whale: 0 };

    const marketCapUsd = price ? price * uiSupply : null;

    // Insert snapshot using the actual database schema
    const capturedAtIso = new Date().toISOString();
    const snapshotId = await insertSnapshot({
      token_address: mint,
      bucket_10m: bucket,
      captured_at: capturedAtIso,
      price_usd: price,
      // fill minimal fields synchronously; backfill metadata right after
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
    
    // Backfill metadata fields in the background to avoid nulls
    try {
      // Prefer freshly computed values; fall back to prior snapshot or token profile
      const prevSnap = await getPreviousSnapshotBefore(mint, capturedAtIso);
      const profile = await getTokenProfile(mint);

      const safeTokenName = tokenName || prevSnap?.token_name || profile?.name || null;
      const safeTokenTicker = tokenTicker || prevSnap?.token_ticker || profile?.symbol || null;
      const safeTotalSupplyUi = (uiSupply && Number(uiSupply) > 0) ? uiSupply : (prevSnap?.total_supply_ui || null);
      const safeTierSupplyUi = (tierUiTotals && Object.keys(tierUiTotals).length > 0) ? tierUiTotals : (prevSnap?.tier_supply_ui || {});

      await updateSnapshotMeta(snapshotId, {
        token_name: safeTokenName,
        token_ticker: safeTokenTicker,
        total_supply_ui: safeTotalSupplyUi,
        tier_supply_ui: safeTierSupplyUi
      });
    } catch {}

    console.log('Snapshot inserted with ID:', snapshotId);

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

    // Deltas vs previous snapshot (most recent prior to current capture time)
    const prev = await getPreviousSnapshotBefore(mint, capturedAtIso);
    const deltas = prev ? {
      holders: (total_holders_all || 0) - (prev.total_holders || 0),
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

    // Notable holders (top 20 by USD value, using shared function)
    const sortedEligible = eligible
      .map(h => ({ ...h, label: labelMap.get(h.owner) || null }))
      .sort((a, b) => (b.usd || 0) - (a.usd || 0));

    // Format holders for shared function
    const formattedHolders = sortedEligible.slice(0, 50).map(h => ({
      address: h.owner,
      label: h.label?.label || null,
      balance_ui: h.ui,
      balance_usd: h.usd,
      percent_supply: uiSupply > 0 ? h.ui / uiSupply : 0
    }));

    // Get notable holders with percentage changes using shared function
    const notable_holders = await getNotableHoldersWithChanges(mint, formattedHolders, snapshotId, uiSupply);

    const whales_detected = analyzable.filter(h => h.usd >= 250000).slice(0, 50).map(h => h.owner);

    // Get token profile for additional metadata
    const tokenProfile = await getTokenProfile(mint);

    // Use shared formatter
    const response = await formatAuditResponse({
      mint,
      snapshot: { id: snapshotId, total_holders: total_holders_all },
      dataAge: { minutes: 0, hours: 0, days: 0, formatted: 'Just now' },
      tokenProfile,
      totalSupply: uiSupply,
      price,
      total_holders_eligible,
      tierCounts,
      topNBalances,
      topNPercent,
      deltas,
      notable_holders,
      whaleStats,
      whaleStatsPending
    });

    // Add live-specific fields
    response.snapshot_id = snapshotId;
    response.created = true;
    response.token = { mint, decimals };
    response.liquidity_usd = liquidityUsd;
    response.total_holders_all = total_holders_all;
    response.whales_detected = whales_detected;
    response.percent_supply_by_tier = tierSupplyUsd;
    // Holder-share percentages and raw counts across ALL holders
    response.tier_counts_all = tierCountTotals;
    response.percent_holders_by_tier = total_holders_all > 0 ? {
      whale: (tierCountTotals.whale || 0) / total_holders_all,
      shark: (tierCountTotals.shark || 0) / total_holders_all,
      dolphin: (tierCountTotals.dolphin || 0) / total_holders_all,
      fish: (tierCountTotals.fish || 0) / total_holders_all,
      shrimp: (tierCountTotals.shrimp || 0) / total_holders_all
    } : { whale: 0, shark: 0, dolphin: 0, fish: 0, shrimp: 0 };

    res.json(response);
  } catch (e) {
    console.error('Audit error:', e);
    res.status(500).json({ error: 'audit_failed', message: e.message });
  }
}

module.exports = { default: handler };
