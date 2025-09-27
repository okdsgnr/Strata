const { getTokenSupply, getAllHoldersForMint } = require('../lib/helius.js');
const { getPriceUSD } = require('../lib/price.js');
const { findOverlaps, enrichOverlapWithLabels } = require('../lib/overlap.js');
const { getWalletLabels } = require('../lib/db.js');
const { filterExcludedHolders } = require('../lib/labels.js');

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { mints } = req.body;
  if (!mints || !Array.isArray(mints) || mints.length < 2 || mints.length > 3) {
    return res.status(400).json({ error: 'mints array required with 2-3 tokens' });
  }

  try {
    // Fetch data for each mint
    const mintData = await Promise.all(mints.map(async (mint) => {
      const { decimals, uiSupply } = await getTokenSupply(mint);
      const byOwner = await getAllHoldersForMint(mint);
      const price = await getPriceUSD(mint);
      
      if (!price) {
        throw new Error(`Price not available for token ${mint}. Comparison requires price data for all tokens.`);
      }
      
      // Convert to holders array
      const holders = [];
      for (const [owner, raw] of byOwner) {
        const ui = Number(raw) / 10 ** decimals;
        const usd = ui * price;
        holders.push({ owner, raw, ui, usd, decimals });
      }
      
      return { mint, holders, price, decimals, uiSupply };
    }));

    // Get labels for all holders across all mints
    const allAddresses = new Set();
    mintData.forEach(data => {
      data.holders.forEach(h => allAddresses.add(h.owner));
    });
    
    const labels = await getWalletLabels(Array.from(allAddresses));
    const labelMap = new Map();
    labels.forEach(label => {
      labelMap.set(label.address, { type: label.type, label: label.label });
    });

    // Filter out CEX and LP holders and create maps for overlap analysis
    const mintMaps = mintData.map(data => {
      const filtered = filterExcludedHolders(data.holders, labelMap);
      const eligible = filtered.filter(h => h.usd >= 100);
      
      const holderMap = new Map();
      eligible.forEach(h => {
        holderMap.set(h.owner, h);
      });
      
      return { [data.mint]: holderMap };
    });

    const priceMap = {};
    mintData.forEach(data => {
      priceMap[data.mint] = data.price;
    });

    // Find overlaps
    const overlapResults = findOverlaps(mintMaps, priceMap);

    // Enrich with labels
    const enrichedResults = await enrichOverlapWithLabels(overlapResults);

    // Build response per spec
    const supplyMap = {};
    mintData.forEach(d => { supplyMap[d.mint] = d.uiSupply; });

    const formatSet = (wallets) => {
      const wallet_count = wallets.length;
      const tier_counts = { shrimp: 0, fish: 0, dolphin: 0, shark: 0, whale: 0 };
      
      // Calculate tier counts
      wallets.forEach(w => {
        const totalUsd = w.total_usd || 0;
        let tier = 'shrimp';
        if (totalUsd >= 250000) tier = 'whale';
        else if (totalUsd >= 100000) tier = 'shark';
        else if (totalUsd >= 25000) tier = 'dolphin';
        else if (totalUsd >= 1000) tier = 'fish';
        
        if (tier_counts[tier] != null) tier_counts[tier]++;
      });

      // % supply per token present in this group
      const tokensInGroup = mints;
      const percent_supply = {};
      tokensInGroup.forEach(tok => {
        const supply = supplyMap[tok] || 0;
        if (supply > 0) {
          const sumUi = wallets.reduce((s, w) => s + (w.tokens?.[tok]?.ui || 0), 0);
          percent_supply[tok] = sumUi / supply;
        } else {
          percent_supply[tok] = 0;
        }
      });

      // Notables: labeled first, then whales ≥ $250k, cap 20
      const labeled = wallets.filter(w => w.label && w.label.label).sort((a,b)=> (b.total_usd||0)-(a.total_usd||0));
      const whales = wallets.filter(w => !w.label?.label && (w.total_usd||0) >= 250000).sort((a,b)=> (b.total_usd||0)-(a.total_usd||0));
      const chosen = [...labeled, ...whales].slice(0, 20);
      const notable_wallets = chosen.map(w => ({
        address: w.address,
        label: w.label?.label || null,
        tier: w.total_usd >= 250000 ? 'whale' : w.total_usd >= 100000 ? 'shark' : w.total_usd >= 25000 ? 'dolphin' : w.total_usd >= 1000 ? 'fish' : 'shrimp',
        ...Object.fromEntries(tokensInGroup.map(tok => [
          `usd_in_${tok}`, w.tokens?.[tok]?.usd || 0
        ]))
      }));

      // Health flags (simple): whale_heavy if whales >= 10% of wallets, shrimp_growth if shrimp+fish >= 60%
      const whalesNum = tier_counts.whale || 0;
      const small = (tier_counts.shrimp || 0) + (tier_counts.fish || 0);
      const health = {
        whale_heavy: wallet_count > 0 ? (whalesNum / wallet_count) >= 0.1 : false,
        shrimp_growth: wallet_count > 0 ? (small / wallet_count) >= 0.6 : false
      };

      return { wallet_count, tier_counts, percent_supply, notable_wallets, health };
    };

    const response = { tokens: mints, overlaps: {} };
    Object.entries(enrichedResults).forEach(([key, group]) => {
      response.overlaps[key] = formatSet(group);
    });

    res.json(response);
  } catch (e) {
    console.error('Compare error:', e);
    res.status(500).json({ error: 'compare_failed', message: e.message });
  }
}

module.exports = { default: handler };
