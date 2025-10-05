const { getPreviousSnapshot } = require('../lib/db.js');
const { getTokenProfile } = require('../lib/token-profiles.js');
const { getTokenSupply, getAllHoldersForMint } = require('../lib/helius.js');
const { tierOf } = require('../lib/tiers.js');
const { sb } = require('../lib/db.js');
const { formatAuditResponse, getNotableHoldersWithChanges } = require('../lib/audit-formatter.js');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { mint } = req.body;
  if (!mint) return res.status(400).json({ error: 'mint required' });

  try {
    // Get the most recent snapshot for this token (regardless of age)
    const snapshot = await getPreviousSnapshot(mint);
    
    
    if (!snapshot) {
      return res.status(404).json({ 
        error: 'No snapshot data available for this token',
        hasData: false 
      });
    }

    // Calculate data age
    const now = new Date();
    const capturedAt = new Date(snapshot.captured_at);
    const ageMinutes = Math.floor((now - capturedAt) / (1000 * 60));
    const ageHours = Math.floor(ageMinutes / 60);
    const ageDays = Math.floor(ageHours / 24);

    // Format age string
    let ageString;
    if (ageDays > 0) {
      ageString = `${ageDays} day${ageDays > 1 ? 's' : ''} ago`;
    } else if (ageHours > 0) {
      ageString = `${ageHours} hour${ageHours > 1 ? 's' : ''} ago`;
    } else {
      ageString = `${ageMinutes} minute${ageMinutes > 1 ? 's' : ''} ago`;
    }

    // Get token profile for additional metadata
    const tokenProfile = await getTokenProfile(mint);

    // Get actual total supply for correct supply concentration calculations
    let totalSupply = 1; // Default fallback
    try {
      const supplyData = await getTokenSupply(mint);
      totalSupply = supplyData.uiSupply;
    } catch (error) {
      console.error('Error getting token supply for cached data:', error);
      // Fall back to using top100_balance as approximation (less accurate)
      totalSupply = snapshot.top100_balance || 1;
    }

    // Calculate eligible holders (legacy field) and build all-holders tier counts if possible
    const total_eligible = (snapshot.whale_count || 0) + (snapshot.shark_count || 0) + 
                          (snapshot.dolphin_count || 0) + (snapshot.fish_count || 0) + 
                          (snapshot.shrimp_count || 0);

    // Prepare data for shared formatter
    const tierCounts = {
      whale_count: snapshot.whale_count || 0,
      shark_count: snapshot.shark_count || 0,
      dolphin_count: snapshot.dolphin_count || 0,
      fish_count: snapshot.fish_count || 0,
      shrimp_count: snapshot.shrimp_count || 0
    };
    let percentHoldersByTier = null;
    let tierCountsAll = null;
    try {
      // If we persisted all-holders tier counts in tier_supply_ui or we can recompute from chain
      const byOwner = await getAllHoldersForMint(mint);
      const price = snapshot.price_usd;
      if (price && byOwner && byOwner.size) {
        const counts = { shrimp: 0, fish: 0, dolphin: 0, shark: 0, whale: 0 };
        for (const [owner, raw] of byOwner) {
          const ui = Number(raw) / 1; // we don't have decimals here; counts are unaffected by decimals
          const usd = ui * price;
          const t = tierOf(usd) || (usd < 100 ? 'Shrimp' : null);
          if (!t) continue;
          const key = t.toLowerCase();
          counts[key] += 1;
        }
        const totalHolders = snapshot.total_holders || 0;
        tierCountsAll = counts;
        percentHoldersByTier = totalHolders > 0 ? {
          whale: (counts.whale || 0) / totalHolders,
          shark: (counts.shark || 0) / totalHolders,
          dolphin: (counts.dolphin || 0) / totalHolders,
          fish: (counts.fish || 0) / totalHolders,
          shrimp: (counts.shrimp || 0) / totalHolders
        } : { whale: 0, shark: 0, dolphin: 0, fish: 0, shrimp: 0 };
      }
    } catch {}

    const topNBalances = {
      top1_balance: snapshot.top1_balance || 0,
      top10_balance: snapshot.top10_balance || 0,
      top50_balance: snapshot.top50_balance || 0,
      top100_balance: snapshot.top100_balance || 0
    };

    // Get notable holders using shared function and compute tier supply share (approx from top holders)
    let notable_holders = [];
    let tierSupplyFromTop = { whale: 0, shark: 0, dolphin: 0, fish: 0, shrimp: 0 };
    try {
      // First try to get top holders from token_top_holders
      const { data: topHolders } = await sb
        .from('token_top_holders')
        .select('*')
        .eq('token_address', mint)
        .eq('snapshot_id', snapshot.id)
        .order('usd_value', { ascending: false })
        .limit(100);
      
      if (topHolders && topHolders.length > 0) {
        // Use stored labels only; skip LP detection in cached route to reduce cost/logging
        const formattedHolders = topHolders.map(h => ({
          address: h.address,
          label: h.label || null,
          balance_ui: h.balance,
          balance_usd: h.usd_value,
          percent_supply: totalSupply > 0 ? h.balance / totalSupply : 0
        }));
        
        notable_holders = await getNotableHoldersWithChanges(mint, formattedHolders, snapshot.id, totalSupply);

        // Approximate percent of supply held per tier using top holders only
        for (const h of topHolders) {
          const t = tierOf(h.usd_value) || (h.usd_value != null && h.usd_value < 100 ? 'Shrimp' : null);
          if (!t) continue;
          const share = totalSupply > 0 ? (h.balance / totalSupply) : 0;
          if (t === 'Whale') tierSupplyFromTop.whale += share;
          else if (t === 'Shark') tierSupplyFromTop.shark += share;
          else if (t === 'Dolphin') tierSupplyFromTop.dolphin += share;
          else if (t === 'Fish') tierSupplyFromTop.fish += share;
          else if (t === 'Shrimp') tierSupplyFromTop.shrimp += share;
        }
      } else {
        // Fallback: get top holders from whale_wallet_holdings_current
        console.log('No token_top_holders data, falling back to whale_wallet_holdings_current');
        const { data: whaleHolders } = await sb
          .from('whale_wallet_holdings_current')
          .select('*')
          .eq('token_address', mint)
          .order('amount_raw', { ascending: false })
          .limit(100);
        
        if (whaleHolders && whaleHolders.length > 0) {
          // Get labels for these addresses
          const addresses = whaleHolders.map(h => h.wallet_address);
          const { data: labels } = await sb
            .from('wallet_labels')
            .select('address, type, label')
            .in('address', addresses);
          
          const labelMap = new Map();
          if (labels) {
            labels.forEach(label => {
              labelMap.set(label.address, { type: label.type, label: label.label });
            });
          }
          
          // Format holders with labels and USD values
          const formattedHolders = whaleHolders.map(h => {
            const amount = Number(h.amount_raw) / Math.pow(10, h.token_decimals);
            const usdValue = amount * (snapshot.price_usd || 0);
            const label = labelMap.get(h.wallet_address);
            
            return {
              address: h.wallet_address,
              label: label ? label.label : null,
              balance_ui: amount,
              balance_usd: usdValue,
              percent_supply: totalSupply > 0 ? amount / totalSupply : 0
            };
          });
          
          notable_holders = await getNotableHoldersWithChanges(mint, formattedHolders, snapshot.id, totalSupply);
        }
      }
    } catch (error) {
      console.error('Error fetching notable holders:', error);
      notable_holders = [];
    }

    // Use shared formatter
    const response = await formatAuditResponse({
      mint,
      snapshot,
      dataAge: {
        minutes: ageMinutes,
        hours: ageHours,
        days: ageDays,
        formatted: ageString
      },
      tokenProfile,
      totalSupply,
      price: snapshot.price_usd,
      total_holders_all: snapshot.total_holders || 0, // Use total holders from snapshot
      total_holders_eligible: total_eligible,
      tierCounts,
      topNBalances,
      topNPercent: {
        top1_percent: topNBalances.top1_balance / totalSupply,
        top10_percent: topNBalances.top10_balance / totalSupply,
        top50_percent: topNBalances.top50_balance / totalSupply,
        top100_percent: topNBalances.top100_balance / totalSupply
      },
      deltas: null, // Not stored in current schema
      notable_holders
    });

    // Add cached-specific fields
    response.snapshot_id = snapshot.id;
    response.captured_at = snapshot.captured_at;
    response.hasData = true;
    response.isRecent = ageMinutes <= 10;
    response.created = true;
    response.price = snapshot.price_usd ? true : false;
    // Ensure frontend sees total holders in expected field
    response.total_holders_all = snapshot.total_holders || 0;
    if (percentHoldersByTier) response.percent_holders_by_tier = percentHoldersByTier;
    if (tierCountsAll) response.tier_counts_all = tierCountsAll;

    // Prefer exact per-tier supply from snapshot if present; otherwise recompute from chain as fallback
    try {
      if (snapshot.tier_supply_ui && snapshot.total_supply_ui && Number(snapshot.total_supply_ui) > 0) {
        const ts = snapshot.tier_supply_ui || {};
        const denom = Number(snapshot.total_supply_ui);
        response.percent_supply_by_tier = {
          whale: Number(ts.whale || 0) / denom,
          shark: Number(ts.shark || 0) / denom,
          dolphin: Number(ts.dolphin || 0) / denom,
          fish: Number(ts.fish || 0) / denom,
          shrimp: Number(ts.shrimp || 0) / denom
        };
      } else if (totalSupply > 0) {
        // Recompute using all holders with proper decimals and price
        const byOwner = await getAllHoldersForMint(mint);
        const { decimals } = await getTokenSupply(mint);
        const price = snapshot.price_usd;
        const totalsUi = { shrimp: 0, fish: 0, dolphin: 0, shark: 0, whale: 0 };
        const countsAll = { shrimp: 0, fish: 0, dolphin: 0, shark: 0, whale: 0 };
        if (price && byOwner && byOwner.size) {
          for (const [owner, raw] of byOwner) {
            const ui = Number(raw) / 10 ** decimals;
            const usd = ui * price;
            const t = tierOf(usd) || (usd < 100 ? 'Shrimp' : null);
            if (!t) continue;
            const key = t.toLowerCase();
            totalsUi[key] += ui;
            countsAll[key] += 1;
          }
          response.percent_supply_by_tier = totalSupply > 0 ? {
            shrimp: totalsUi.shrimp / totalSupply,
            fish: totalsUi.fish / totalSupply,
            dolphin: totalsUi.dolphin / totalSupply,
            shark: totalsUi.shark / totalSupply,
            whale: totalsUi.whale / totalSupply
          } : { shrimp: 0, fish: 0, dolphin: 0, shark: 0, whale: 0 };
          // Also surface all-holders counts and percentages for the UI when recomputed
          const totalHoldersAll = snapshot.total_holders || 0;
          response.tier_counts_all = countsAll;
          response.percent_holders_by_tier = totalHoldersAll > 0 ? {
            whale: (countsAll.whale || 0) / totalHoldersAll,
            shark: (countsAll.shark || 0) / totalHoldersAll,
            dolphin: (countsAll.dolphin || 0) / totalHoldersAll,
            fish: (countsAll.fish || 0) / totalHoldersAll,
            shrimp: (countsAll.shrimp || 0) / totalHoldersAll
          } : { whale: 0, shark: 0, dolphin: 0, fish: 0, shrimp: 0 };
        } else {
          // Fallback to approximation from top holders if no price or data
          response.percent_supply_by_tier = tierSupplyFromTop;
        }
      }
    } catch {}

    return res.json(response);

  } catch (error) {
    console.error('Error fetching cached snapshot:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch cached data',
      details: error.message 
    });
  }
}

module.exports = { handler };
