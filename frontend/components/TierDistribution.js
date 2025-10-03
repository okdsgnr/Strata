"use client";

export default function TierDistribution({ tierCounts, percentHoldersByTier, percentSupplyByTier, className = "" }) {
  const emojiMap = {
    whale: '🐋',
    shark: '🦈',
    dolphin: '🐬',
    fish: '🐟',
    shrimp: '🦐'
  };

  const tiers = [
    { key: 'whale', label: 'Whales', color: 'bg-tier-whale', count: (tierCounts?.whale_count ?? tierCounts?.whale) || 0, holdersPercent: percentHoldersByTier?.whale || 0, supplyPercent: percentSupplyByTier?.whale || 0 },
    { key: 'shark', label: 'Sharks', color: 'bg-tier-shark', count: (tierCounts?.shark_count ?? tierCounts?.shark) || 0, holdersPercent: percentHoldersByTier?.shark || 0, supplyPercent: percentSupplyByTier?.shark || 0 },
    { key: 'dolphin', label: 'Dolphins', color: 'bg-tier-dolphin', count: (tierCounts?.dolphin_count ?? tierCounts?.dolphin) || 0, holdersPercent: percentHoldersByTier?.dolphin || 0, supplyPercent: percentSupplyByTier?.dolphin || 0 },
    { key: 'fish', label: 'Fish', color: 'bg-tier-fish', count: (tierCounts?.fish_count ?? tierCounts?.fish) || 0, holdersPercent: percentHoldersByTier?.fish || 0, supplyPercent: percentSupplyByTier?.fish || 0 },
    { key: 'shrimp', label: 'Shrimp', color: 'bg-tier-shrimp', count: (tierCounts?.shrimp_count ?? tierCounts?.shrimp) || 0, holdersPercent: percentHoldersByTier?.shrimp || 0, supplyPercent: percentSupplyByTier?.shrimp || 0 },
  ];

  const totalCount = tiers.reduce((sum, tier) => sum + tier.count, 0);
  const hasData = totalCount > 0;
  const formatPct = (v) => new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v || 0);

  return (
    <div className={`bg-surface  p-4 ${className}`}>
      <h3 className="text-sm font-semibold mb-3 text-white font-satoshi">Holder Distribution</h3>
      
      {hasData ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center text-[11px] text-gray-400 uppercase tracking-wide pb-1 border-b border-gray-800">
              <span className="flex-1">Tier</span>
              <span className="ml-4 w-24 text-right">% HOLDERS</span>
              <span className="ml-4 w-24 text-right">% SUPPLY</span>
            </div>
            {tiers.map((tier) => (
              <div key={tier.key} className="flex items-center text-sm">
                <span className="flex-1 flex items-center gap-2">
                  <span className="text-lg">{emojiMap[tier.key]}</span>
                  <span className="text-gray-300 font-ibmplex">{tier.count.toLocaleString()}</span>
                </span>
                <span className="ml-4 w-24 text-right text-gray-300 font-ibmplex">{formatPct(tier.holdersPercent)}</span>
                <span className="ml-4 w-24 text-right text-gray-300 font-ibmplex">{formatPct(tier.supplyPercent)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-sm text-gray-400 font-ibmplex">No distribution data available</div>
      )}
    </div>
  );
}
