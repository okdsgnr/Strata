const axios = require('axios');

/**
 * Detects liquidity pools using multiple methods
 */
class LiquidityDetector {
  constructor() {
    this.knownLPPatterns = [
      // Raydium patterns
      /^[A-Za-z0-9]{32,44}$/, // Raydium pool addresses
      // Orca patterns  
      /^[A-Za-z0-9]{32,44}$/, // Orca pool addresses
      // Jupiter patterns
      /^[A-Za-z0-9]{32,44}$/  // Jupiter pool addresses
    ];
    
    this.knownLPPrograms = [
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', // Raydium Liquidity Pool
      '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3FGQP', // Orca Whirlpools
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',   // Jupiter
      'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrZwq',   // Orca
    ];
  }

  /**
   * Detect liquidity pools using DexScreener API
   */
  async detectViaDexScreener(tokenAddress) {
    try {
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
        timeout: 5000
      });
      
      if (response.data?.pairs) {
        const poolAddresses = new Set();
        response.data.pairs.forEach(pair => {
          if (pair.pairAddress) {
            poolAddresses.add(pair.pairAddress);
          }
        });
        console.log(`DexScreener found ${poolAddresses.size} LP pools for ${tokenAddress}`);
        return Array.from(poolAddresses);
      }
    } catch (error) {
      console.log('DexScreener detection failed:', error.message);
    }
    return [];
  }

  /**
   * Detect liquidity pools using known program patterns
   * This method is disabled as it's too aggressive
   */
  async detectViaProgramPatterns(holders) {
    // Disabled - too aggressive, labels everything as LP
    return [];
  }

  /**
   * Detect liquidity pools using balance analysis
   * This method is disabled as it's too aggressive
   */
  detectViaBalanceAnalysis(holders) {
    // Disabled - too aggressive, labels everything as LP
    return [];
  }

  /**
   * Main detection method that combines all approaches
   */
  async detectLiquidityPools(tokenAddress, holders) {
    const results = new Map();
    
    try {
      // Method 1: DexScreener API (most reliable)
      const dexScreenerPools = await this.detectViaDexScreener(tokenAddress);
      console.log(`DexScreener pools for ${tokenAddress}:`, dexScreenerPools);
      dexScreenerPools.forEach(address => {
        results.set(address, {
          address,
          type: 'LiquidityPool',
          label: 'LP Pool',
          confidence: 0.9,
          source: 'dexscreener'
        });
      });
      
      // Only use DexScreener for now - other methods are too aggressive
      console.log(`Final LP detection: ${results.size} pools found`);
      
    } catch (error) {
      console.error('Liquidity pool detection error:', error);
    }
    
    return Array.from(results.values());
  }
}

module.exports = { LiquidityDetector };
