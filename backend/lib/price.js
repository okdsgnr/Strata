const JUP = process.env.JUP_PRICE_BASE;
const BIRDEYE = process.env.BIRDEYE_PRICE_BASE;
const BIRDEYE_KEY = process.env.BIRDEYE_API_KEY;
const DEX = process.env.DEXSCREENER_TOKEN_BASE;

// In-memory cache for prices (60 seconds TTL)
const priceCache = new Map();

async function getPriceUSD(mint) {
  // Check cache first
  const cached = priceCache.get(mint);
  if (cached && Date.now() - cached.timestamp < 60000) {
    return cached.price;
  }

  let price = null;

  try {
    // 1) Jupiter v4
    const r1 = await fetch(JUP + encodeURIComponent(mint));
    if (r1.ok) {
      const j = await r1.json();
      const p = j?.data?.[mint]?.price;
      if (p) price = Number(p);
    }
  } catch {}

  // 2) Birdeye (if API key available)
  if (price == null && BIRDEYE_KEY) {
    try {
      const r2 = await fetch(BIRDEYE + encodeURIComponent(mint), {
        headers: { 'X-API-KEY': BIRDEYE_KEY, 'accept': 'application/json' }
      });
      if (r2.ok) {
        const j = await r2.json();
        const p = j?.data?.value;
        if (p) price = Number(p);
      }
    } catch {}
  }

  // 3) DexScreener fallback
  if (price == null) {
    try {
      const r3 = await fetch(DEX + encodeURIComponent(mint));
      if (r3.ok) {
        const j = await r3.json();
        const pair = j?.pairs?.find(p => p?.priceUsd);
        if (pair?.priceUsd) price = Number(pair.priceUsd);
        // Attach basic token metadata if available
        if (pair?.baseToken?.name || pair?.baseToken?.symbol) {
          priceCache.set(mint + ":meta", {
            name: pair.baseToken.name || null,
            symbol: pair.baseToken.symbol || null,
            timestamp: Date.now()
          });
        }
      }
    } catch {}
  }

  // Cache the result (including null)
  priceCache.set(mint, { price, timestamp: Date.now() });

  return price;
}

function getCachedTokenMetadata(mint) {
  const meta = priceCache.get(mint + ":meta");
  if (meta && Date.now() - meta.timestamp < 3600_000) {
    return { name: meta.name || null, symbol: meta.symbol || null };
  }
  return { name: null, symbol: null };
}

async function getLiquidityUSD(mint) {
  const base = DEX || 'https://api.dexscreener.com/latest/dex/tokens/';
  try {
    const r = await fetch(base + encodeURIComponent(mint));
    if (!r.ok) return null;
    const j = await r.json();
    const pairs = j?.pairs || [];
    if (!pairs.length) return null;
    const best = pairs.reduce((a, b) => (Number(a?.liquidity?.usd || 0) > Number(b?.liquidity?.usd || 0) ? a : b));
    const usd = Number(best?.liquidity?.usd || 0);
    return Number.isFinite(usd) && usd > 0 ? usd : null;
  } catch {
    return null;
  }
}

module.exports = {
  getPriceUSD,
  getLiquidityUSD,
  getCachedTokenMetadata,
  getTokenMetadata
};

// Fetch token name/symbol from DexScreener token endpoint
async function getTokenMetadata(mint) {
  try {
    const base = DEX || 'https://api.dexscreener.com/latest/dex/tokens/';
    const r = await fetch(base + encodeURIComponent(mint));
    if (!r.ok) return { name: null, symbol: null };
    const j = await r.json();
    const pairs = j?.pairs || [];
    if (!pairs.length) return { name: null, symbol: null };
    // Prefer pairs where baseToken.address matches the mint, then highest liquidity
    const matching = pairs.filter(p => p?.baseToken?.address === mint || p?.quoteToken?.address === mint);
    const chosen = (matching.length ? matching : pairs)
      .reduce((a, b) => (Number(a?.liquidity?.usd || 0) > Number(b?.liquidity?.usd || 0) ? a : b));
    if (!chosen) return { name: null, symbol: null };
    const baseToken = chosen.baseToken?.address === mint ? chosen.baseToken : chosen.quoteToken;
    const name = baseToken?.name || null;
    const symbol = baseToken?.symbol || null;
    return { name, symbol };
  } catch {
    return { name: null, symbol: null };
  }
}
