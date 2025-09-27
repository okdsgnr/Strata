const TIERS = [
  { name: 'Whale', min: 250000 },
  { name: 'Shark', min: 100000 },
  { name: 'Dolphin', min: 25000 },
  { name: 'Fish', min: 1000 },
  { name: 'Shrimp', min: 100 }
];

function tierOf(usd) {
  if (usd == null) return null;
  if (usd >= 250000) return 'Whale';
  if (usd >= 100000) return 'Shark';
  if (usd >= 25000) return 'Dolphin';
  if (usd >= 1000) return 'Fish';
  if (usd >= 100) return 'Shrimp';
  return null;
}

function calculateTierCounts(holders) {
  const counts = {
    whale_count: 0,
    shark_count: 0,
    dolphin_count: 0,
    fish_count: 0,
    shrimp_count: 0
  };

  holders.forEach(holder => {
    const tier = tierOf(holder.usd);
    switch (tier) {
      case 'Whale':
        counts.whale_count++;
        break;
      case 'Shark':
        counts.shark_count++;
        break;
      case 'Dolphin':
        counts.dolphin_count++;
        break;
      case 'Fish':
        counts.fish_count++;
        break;
      case 'Shrimp':
        counts.shrimp_count++;
        break;
    }
  });

  return counts;
}

function calculateTopNBalances(holders) {
  const sorted = [...holders].sort((a, b) => b.ui - a.ui);
  
  const sumTop = (n) => sorted.slice(0, n).reduce((s, x) => s + x.ui, 0);
  
  return {
    top1_balance: sumTop(1),
    top10_balance: sumTop(10),
    top50_balance: sumTop(50),
    top100_balance: sumTop(100)
  };
}

module.exports = {
  TIERS,
  tierOf,
  calculateTierCounts,
  calculateTopNBalances
};
