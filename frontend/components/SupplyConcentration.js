"use client";

export default function SupplyConcentration({ topN_percent_supply }) {
  if (!topN_percent_supply) {
    return (
      <div className="bg-surface p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white font-satoshi">Supply Concentration</h3>
        <div className="text-gray-400 text-sm">No data available</div>
      </div>
    );
  }

  const formatPercent = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="bg-surface p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white font-satoshi">Supply Concentration</h3>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800/50 p-2 rounded">
          <div className="text-gray-400">Top 1</div>
          <div className="text-white font-semibold">
            {formatPercent(topN_percent_supply.top1 || 0)}
          </div>
        </div>
        <div className="bg-gray-800/50 p-2 rounded">
          <div className="text-gray-400">Top 10</div>
          <div className="text-white font-semibold">
            {formatPercent(topN_percent_supply.top10 || 0)}
          </div>
        </div>
        <div className="bg-gray-800/50 p-2 rounded">
          <div className="text-gray-400">Top 50</div>
          <div className="text-white font-semibold">
            {formatPercent(topN_percent_supply.top50 || 0)}
          </div>
        </div>
        <div className="bg-gray-800/50 p-2 rounded">
          <div className="text-gray-400">Top 100</div>
          <div className="text-white font-semibold">
            {formatPercent(topN_percent_supply.top100 || 0)}
          </div>
        </div>
      </div>
    </div>
  );
}
