const { getWalletLabels } = require('./db.js');

function findOverlaps(mintMaps, priceMap) {
  const results = {};
  
  if (mintMaps.length === 2) {
    // Two token comparison: AB
    const [mapA, mapB] = mintMaps;
    const mintA = Object.keys(mapA)[0];
    const mintB = Object.keys(mapB)[0];
    
    results.ab = findTwoTokenOverlap(mapA[mintA], mapB[mintB], priceMap[mintA], priceMap[mintB], mintA, mintB);
  } else if (mintMaps.length === 3) {
    // Three token comparison: ABC, AB, AC, BC
    const [mapA, mapB, mapC] = mintMaps;
    const mintA = Object.keys(mapA)[0];
    const mintB = Object.keys(mapB)[0];
    const mintC = Object.keys(mapC)[0];
    
    results.abc = findThreeTokenOverlap(mapA[mintA], mapB[mintB], mapC[mintC], priceMap, mintA, mintB, mintC);
    results.ab = findTwoTokenOverlap(mapA[mintA], mapB[mintB], priceMap[mintA], priceMap[mintB], mintA, mintB);
    results.ac = findTwoTokenOverlap(mapA[mintA], mapC[mintC], priceMap[mintA], priceMap[mintC], mintA, mintC);
    results.bc = findTwoTokenOverlap(mapB[mintB], mapC[mintC], priceMap[mintB], priceMap[mintC], mintB, mintC);
  }
  
  return results;
}

function findTwoTokenOverlap(holdersA, holdersB, priceA, priceB, mintA, mintB) {
  const overlap = [];
  
  for (const [address, holderA] of holdersA.entries()) {
    if (holdersB.has(address)) {
      const holderB = holdersB.get(address);
      
      // Calculate USD values
      const usdA = priceA ? holderA.ui * priceA : null;
      const usdB = priceB ? holderB.ui * priceB : null;
      
      // Only include if both have prices and each token value >= $100
      if (usdA != null && usdB != null && usdA >= 100 && usdB >= 100) {
        overlap.push({
          address,
          tokens: {
            [mintA]: { ui: holderA.ui, usd: usdA },
            [mintB]: { ui: holderB.ui, usd: usdB }
          },
          total_usd: usdA + usdB
        });
      }
    }
  }
  
  // Sort by total USD descending
  return overlap.sort((a, b) => b.total_usd - a.total_usd);
}

function findThreeTokenOverlap(holdersA, holdersB, holdersC, priceMap, mintA, mintB, mintC) {
  const overlap = [];
  
  for (const [address, holderA] of holdersA.entries()) {
    if (holdersB.has(address) && holdersC.has(address)) {
      const holderB = holdersB.get(address);
      const holderC = holdersC.get(address);
      
      // Calculate USD values - we need to pass the mint addresses to this function
      // For now, we'll calculate from the holders data
      const usdA = holderA.usd != null ? holderA.usd : (priceMap[mintA] ? holderA.ui * priceMap[mintA] : null);
      const usdB = holderB.usd != null ? holderB.usd : (priceMap[mintB] ? holderB.ui * priceMap[mintB] : null);
      const usdC = holderC.usd != null ? holderC.usd : (priceMap[mintC] ? holderC.ui * priceMap[mintC] : null);
      
      // Only include if all have prices and each value >= $100
      if (usdA != null && usdB != null && usdC != null && usdA >= 100 && usdB >= 100 && usdC >= 100) {
        overlap.push({
          address,
          tokens: {
            [mintA]: { ui: holderA.ui, usd: usdA },
            [mintB]: { ui: holderB.ui, usd: usdB },
            [mintC]: { ui: holderC.ui, usd: usdC }
          },
          total_usd: usdA + usdB + usdC
        });
      }
    }
  }
  
  // Sort by total USD descending
  return overlap.sort((a, b) => b.total_usd - a.total_usd);
}

async function enrichOverlapWithLabels(overlapResults) {
  // Collect all unique addresses from all overlap groups
  const allAddresses = new Set();
  Object.values(overlapResults).forEach(group => {
    if (Array.isArray(group)) {
      group.forEach(wallet => allAddresses.add(wallet.address));
    }
  });
  
  // Fetch labels for all addresses
  const labels = await getWalletLabels(Array.from(allAddresses));
  const labelMap = new Map();
  labels.forEach(label => {
    labelMap.set(label.address, { type: label.type, label: label.label });
  });
  
  // Add labels to overlap results
  const enriched = {};
  Object.entries(overlapResults).forEach(([key, wallets]) => {
    if (Array.isArray(wallets)) {
      enriched[key] = wallets.map(wallet => ({
        ...wallet,
        label: labelMap.get(wallet.address) || null
      }));
    } else {
      enriched[key] = wallets;
    }
  });
  
  return enriched;
}

module.exports = {
  findOverlaps,
  enrichOverlapWithLabels
};
