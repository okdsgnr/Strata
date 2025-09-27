require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { setTimeout: sleep } = require('timers/promises');


const app = express();
app.use(cors());
app.use(express.json());

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const PRICE_TTL_SECONDS = Number(process.env.PRICE_TTL_SECONDS || 3600);
const LABEL_TTL_SECONDS = Number(process.env.LABEL_TTL_SECONDS || 259200);
const CONCURRENCY = 5;
function createLimiter(maxConcurrency) {
  let activeCount = 0;
  const queue = [];
  const next = () => {
    if (activeCount >= maxConcurrency) return;
    const item = queue.shift();
    if (!item) return;
    activeCount++;
    Promise.resolve()
      .then(item.fn)
      .then(item.resolve, item.reject)
      .finally(() => {
        activeCount--;
        next();
      });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}
const limit = createLimiter(CONCURRENCY);

// Helpers
async function rpcCall(method, params) {
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  const body = { jsonrpc: '2.0', id: 1, method, params };
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`rpc ${method} ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`rpc ${method} error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function fallbackGetHoldersViaRpc(mint) {
  try {
    const largest = await rpcCall('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]);
    const tokenAccountAddresses = (largest?.value || []).map((v) => v.address).slice(0, 1000);
    if (tokenAccountAddresses.length === 0) return [];
    const accounts = await rpcCall('getMultipleAccounts', [tokenAccountAddresses, { encoding: 'jsonParsed' }]);
    const holders = [];
    (accounts?.value || []).forEach((acc) => {
      try {
        const info = acc?.data?.parsed?.info;
        const owner = info?.owner;
        const uiAmount = info?.tokenAmount?.uiAmount;
        const decimals = info?.tokenAmount?.decimals;
        if (owner && typeof uiAmount === 'number') holders.push({ owner, uiAmount, decimals });
      } catch {}
    });
    return holders;
  } catch (e) {
    return { items: [], error: 'rpc_fallback_failed', body: String(e?.message || e) };
  }
}
async function getTokenHolders(mint, limit = 1000) {
  // Use the fallback method which was working
  return await fallbackGetHoldersViaRpc(mint);
}

async function getAllTokenHolders(mint, maxHolders = 5000) {
  // Try to get more holders with a higher limit first
  try {
    const url = `https://api.helius.xyz/v0/token-accounts?api-key=${process.env.HELIUS_API_KEY}&mint=${encodeURIComponent(mint)}&limit=${Math.min(maxHolders, 1000)}&cluster=mainnet-beta`;
    const res = await fetch(url);
    
    if (!res.ok) {
      console.warn(`Helius API error: ${res.status}`);
      return [];
    }
    
    const data = await res.json();
    const holders = Array.isArray(data) ? data : data?.result || data?.items || [];
    return holders;
    
  } catch (e) {
    console.warn(`Error fetching holders:`, e.message);
    return [];
  }
}

// Optional: Known top tokens (not used for pricing decisions; kept for potential future logic)
const KNOWN_TOKEN_MINTS = new Set([
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  '2jXy799YnEcRXNEBt8k7oM3BRX2QHCov4SbnN3jXKX6R', // WIF
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // JUP
]);

async function getPriceWithCache(mint) {
  // Try cache
  try {
    const { data } = await supabase
      .from('token_cache')
      .select('data,last_updated')
      .eq('token_address', mint)
      .single();
    if (data && data.data && data.last_updated) {
      const ageSec = (Date.now() - new Date(data.last_updated).getTime()) / 1000;
      // If cache is fresh AND has a non-null price, return it. Ignore cached nulls.
      if (ageSec < PRICE_TTL_SECONDS && data.data.price_usd != null) {
        return data.data.price_usd;
      }
    }
  } catch {}
  // Fetch via Dexscreener, then Birdeye as secondary
  let price = null;
  // 1) Dexscreener: tokens/<mint>
  try {
    const ds = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`);
    if (ds.ok) {
      const dsJson = await ds.json();
      const pairs = Array.isArray(dsJson?.pairs) ? dsJson.pairs : [];
      let best = null;
      for (const pr of pairs) {
        const liq = Number(pr?.liquidity?.usd ?? pr?.liquidityUsd ?? 0);
        const pUsd = pr?.priceUsd != null ? Number(pr.priceUsd) : NaN;
        if (!Number.isFinite(pUsd)) continue;
        if (!best || liq > best._liq) best = { _liq: liq, priceUsd: pUsd };
      }
      if (best) price = best.priceUsd;
    }
  } catch {}
  // 2) Dexscreener: search?q=<mint> as fallback if tokens/<mint> empty
  if (price == null) {
    try {
      const ds2 = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(mint)}`);
      if (ds2.ok) {
        const dsJson2 = await ds2.json();
        const pairs2 = Array.isArray(dsJson2?.pairs) ? dsJson2.pairs : [];
        let best2 = null;
        for (const pr of pairs2) {
          // Ensure this pair actually references our mint as base or quote
          const isOurToken = pr?.baseToken?.address === mint || pr?.quoteToken?.address === mint;
          if (!isOurToken) continue;
          const liq = Number(pr?.liquidity?.usd ?? pr?.liquidityUsd ?? 0);
          const pUsd = pr?.priceUsd != null ? Number(pr.priceUsd) : NaN;
          if (!Number.isFinite(pUsd)) continue;
          if (!best2 || liq > best2._liq) best2 = { _liq: liq, priceUsd: pUsd };
        }
        if (best2) price = best2.priceUsd;
      }
    } catch {}
  }
  // 3) Birdeye fallback (requires API key)
  if (price == null && process.env.BIRDEYE_API_KEY) {
    try {
      const be = await fetch(`https://public-api.birdeye.so/defi/price?address=${encodeURIComponent(mint)}`, {
        headers: { 'x-api-key': process.env.BIRDEYE_API_KEY, accept: 'application/json' },
      });
      if (be.ok) {
        const beJson = await be.json();
        const bePrice = beJson?.data?.value ?? beJson?.data?.price ?? null;
        if (bePrice != null) price = Number(bePrice);
      }
    } catch {}
  }
  // Cache only non-null
  try {
    if (price != null) {
      await supabase.from('token_cache').upsert({ token_address: mint, data: { price_usd: Number(price) } });
    }
  } catch {}
  return price ?? null;
}

async function getWalletLabelWithCache(address) {
  const { data } = await supabase
    .from('wallet_labels')
    .select('labels,last_updated')
    .eq('address', address)
    .single();
  
  if (data && data.labels && data.last_updated) {
    const ageSec = (Date.now() - new Date(data.last_updated).getTime()) / 1000;
    if (ageSec < LABEL_TTL_SECONDS) {
      // Return the first CEX label found, or first label if no CEX
      const labels = data.labels || [];
      const cexLabel = labels.find(label => label.type === 'CEX');
      if (cexLabel) return cexLabel.value;
      if (labels.length > 0) return labels[0].value;
    }
  }
  
  // Fetch from Moralis
  try {
    const res = await fetch(`https://deep-index.moralis.io/api/v2.2/wallets/${address}/labels`, {
      headers: { 'X-API-Key': process.env.MORALIS_API_KEY },
    });
    if (!res.ok) return data?.labels?.[0]?.value ?? null;
    const json = await res.json();
    const label = Array.isArray(json) && json.length ? (json[0]?.label ?? null) : null;
    if (label) {
      await supabase.from('wallet_labels').upsert({ 
        address, 
        labels: [{ type: 'LEGACY', value: label, source: 'moralis' }],
        last_updated: new Date().toISOString()
      });
    }
    return label ?? null;
  } catch {
    return data?.labels?.[0]?.value ?? null;
  }
}

function assignTier(balanceUsd) {
  if (balanceUsd >= 250000) return 'whale';
  if (balanceUsd >= 100000) return 'shark';
  if (balanceUsd >= 10000) return 'dolphin';
  if (balanceUsd >= 1000) return 'fish';
  if (balanceUsd >= 100) return 'shrimp';
  return 'minnow';
}

function shorten(address) {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function validateBase58(address) {
  if (!address || typeof address !== 'string') return false;
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(address) && address.length >= 32 && address.length <= 44;
}

async function validateMintExists(mint) {
  try {
    const result = await rpcCall('getAccountInfo', [mint, { encoding: 'base64' }]);
    return result && result.value !== null;
  } catch {
    return false;
  }
}

// Routes
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/audit', async (req, res) => {
  try {
    const mint = String(req.query.mint || '').trim();
    if (!mint) return res.status(400).json({ error: 'mint is required' });
    
    // Input validation
    if (!validateBase58(mint)) {
      return res.status(400).json({ error: 'Invalid mint address format' });
    }
    
    const mintExists = await validateMintExists(mint);
    if (!mintExists) {
      return res.status(400).json({ error: 'Mint address does not exist' });
    }

    const holdersResp = await getTokenHolders(mint, 10000);
    const accounts = Array.isArray(holdersResp) ? holdersResp : holdersResp?.result || holdersResp?.items || [];
    // Normalize balances using uiAmount when present, else amount/10^decimals
    const normalized = accounts.map((h) => {
      const decimals = typeof h.decimals === 'number' ? h.decimals : null;
      const rawAmount = h.amount != null ? Number(h.amount) : Number(h.balance || 0);
      const uiAmount = typeof h.uiAmount === 'number' ? h.uiAmount : (decimals != null ? (rawAmount / Math.pow(10, decimals)) : rawAmount);
      return { ...h, __normBalance: uiAmount };
    });
    const sorted = normalized.sort((a, b) => (b.__normBalance || 0) - (a.__normBalance || 0));
    
    // Get price first to filter holders with >$100
    const price = await getPriceWithCache(mint);
    
    // Filter holders with >$100 USD value
    const qualifyingHolders = sorted.filter((h) => {
      const balanceUsd = price ? (h.__normBalance || 0) * Number(price) : null;
      return balanceUsd && balanceUsd >= 100;
    });

    const enriched = await Promise.all(
      qualifyingHolders.map((h) => limit(async () => {
        const address = h.owner || h.address || h.account || h.wallet || h.pubkey;
        const rawBalance = Number(h.__normBalance || 0);
        const balanceUsd = price ? rawBalance * Number(price) : null;
        const label = await getWalletLabelWithCache(address);
        const tier = typeof balanceUsd === 'number' ? assignTier(balanceUsd) : null;
        return { address, balance: rawBalance, balance_usd: balanceUsd, tier, label };
      }))
    );

    const totalHolders = enriched.length;
    
    // Get the actual total token supply
    const tokenSupply = await rpcCall('getTokenSupply', [mint]);
    const totalSupply = tokenSupply?.value?.uiAmount || 0;
    
    // Calculate top raw number holders
    const top1 = enriched.slice(0, 1);
    const top10 = enriched.slice(0, Math.min(10, enriched.length));
    const top25 = enriched.slice(0, Math.min(25, enriched.length));
    const top50 = enriched.slice(0, Math.min(50, enriched.length));
    const top100 = enriched.slice(0, Math.min(100, enriched.length));
    
    const top1Supply = top1.reduce((s, h) => s + (h.balance || 0), 0);
    const top10Supply = top10.reduce((s, h) => s + (h.balance || 0), 0);
    const top25Supply = top25.reduce((s, h) => s + (h.balance || 0), 0);
    const top50Supply = top50.reduce((s, h) => s + (h.balance || 0), 0);
    const top100Supply = top100.reduce((s, h) => s + (h.balance || 0), 0);
    
    // Calculate percentages based on actual total token supply
    const top1Pct = totalSupply > 0 ? (top1Supply / totalSupply) * 100 : 0;
    const top10Pct = totalSupply > 0 ? (top10Supply / totalSupply) * 100 : 0;
    const top25Pct = totalSupply > 0 ? (top25Supply / totalSupply) * 100 : 0;
    const top50Pct = totalSupply > 0 ? (top50Supply / totalSupply) * 100 : 0;
    const top100Pct = totalSupply > 0 ? (top100Supply / totalSupply) * 100 : 0;
    const tierDistribution = enriched.reduce((acc, h) => {
      if (h.tier) acc[`${h.tier}s`] = (acc[`${h.tier}s`] || 0) + 1;
      return acc;
    }, {});
    const exchangeExposure = enriched.filter((h) => (h.label || '').toLowerCase().includes('exchange')).length;

    res.json({
      token: mint,
      price_usd: price ?? null,
      holders: enriched,
      stats: {
        total_holders: totalHolders,
        top_holders: {
          top1: { count: 1, supply_pct: Number(top1Pct.toFixed(2)) },
          top10: { count: Math.min(10, enriched.length), supply_pct: Number(top10Pct.toFixed(2)) },
          top25: { count: Math.min(25, enriched.length), supply_pct: Number(top25Pct.toFixed(2)) },
          top50: { count: Math.min(50, enriched.length), supply_pct: Number(top50Pct.toFixed(2)) },
          top100: { count: Math.min(100, enriched.length), supply_pct: Number(top100Pct.toFixed(2)) }
        },
        tier_distribution: tierDistribution,
        exchange_exposure: exchangeExposure,
      },
      debug: {
        total_holders_fetched: accounts.length,
        qualifying_holders: qualifyingHolders.length,
        filtering_threshold: "$100"
      }
    });
  } catch (e) {
    res.json({ error: String(e?.message || e) });
  }
});

app.get('/compare', async (req, res) => {
  try {
    const mintA = String(req.query.mintA || '').trim();
    const mintB = String(req.query.mintB || '').trim();
    if (!mintA || !mintB) return res.status(400).json({ error: 'mintA and mintB are required' });
    
    // Input validation
    if (!validateBase58(mintA) || !validateBase58(mintB)) {
      return res.status(400).json({ error: 'Invalid mint address format' });
    }
    
    const [mintAExists, mintBExists] = await Promise.all([
      validateMintExists(mintA),
      validateMintExists(mintB)
    ]);
    
    if (!mintAExists || !mintBExists) {
      return res.status(400).json({ error: 'One or more mint addresses do not exist' });
    }

    const [holdersA, holdersB, priceA, priceB] = await Promise.all([
      getTokenHolders(mintA),
      getTokenHolders(mintB),
      getPriceWithCache(mintA),
      getPriceWithCache(mintB),
    ]);

    const norm = (arr) => (arr || []).map((h)=>{
      const decimals = typeof h.decimals === 'number' ? h.decimals : null;
      const rawAmount = h.amount != null ? Number(h.amount) : Number(h.balance || 0);
      const uiAmount = typeof h.uiAmount === 'number' ? h.uiAmount : (decimals != null ? (rawAmount / Math.pow(10, decimals)) : rawAmount);
      return { ...h, __normBalance: uiAmount };
    });
    const _A = Array.isArray(holdersA) ? holdersA : holdersA?.result || holdersA?.items || [];
    const _B = Array.isArray(holdersB) ? holdersB : holdersB?.result || holdersB?.items || [];
    const listA = norm(_A).sort((a,b)=> (b.__normBalance||0)-(a.__normBalance||0)).slice(0,100);
    const listB = norm(_B).sort((a,b)=> (b.__normBalance||0)-(a.__normBalance||0)).slice(0,100);

    const setA = new Map(listA.map(h => [h.owner || h.address || h.account || h.wallet || h.pubkey, Number(h.__normBalance||0)]));
    const setB = new Map(listB.map(h => [h.owner || h.address || h.account || h.wallet || h.pubkey, Number(h.__normBalance||0)]));

    const overlap = [];
    for (const [addr, balA] of setA.entries()) {
      if (setB.has(addr)) {
        const balB = setB.get(addr);
        const usdA = priceA ? balA * Number(priceA) : null;
        const usdB = priceB ? balB * Number(priceB) : null;
        const combined = (usdA || 0) + (usdB || 0);
        overlap.push({ address: addr, balanceA_usd: usdA, balanceB_usd: usdB, combined_usd: combined });
      }
    }

    // Filter wallets with ≥ $10 combined value
    // If either price is missing, skip filtering to avoid dropping valid overlaps
    const shouldFilterByUsd = priceA != null && priceB != null;
    const filtered = shouldFilterByUsd ? overlap.filter(o => (o.combined_usd || 0) >= 10) : overlap;

    const enriched = await Promise.all(filtered.map(o => limit(async () => {
      const label = await getWalletLabelWithCache(o.address);
      const tier = assignTier((o.balanceA_usd || 0) + (o.balanceB_usd || 0));
      return { address: o.address, tier, label, balanceA_usd: o.balanceA_usd, balanceB_usd: o.balanceB_usd };
    })));

    res.json({ tokenA: mintA, tokenB: mintB, overlap_count: enriched.length, overlap_wallets: enriched });
  } catch (e) {
    res.json({ error: String(e?.message || e) });
  }
});

// Export functions for use in other scripts
module.exports = {
  getTokenHolders,
  getPriceWithCache,
  getWalletLabelWithCache,
  assignTier,
  shorten
};

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on :${port}`);
});
