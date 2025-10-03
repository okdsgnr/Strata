"use client";

export default function HeaderCard({ data, loading, error }) {
  if (loading) {
    return (
      <div className="bg-white  shadow-md p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200  p-6">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-50 border border-gray-200  p-6">
        <p className="text-gray-600">No data available</p>
      </div>
    );
  }

  const { 
    total_holders_all,
    total_holders_eligible,
    price_usd,
    market_cap_usd,
    liquidity_usd,
    tier_counts,
    topN_percent_supply,
    percent_supply_by_tier,
    percent_holders_by_tier,
    deltas,
    notable_holders,
    created
  } = data;

  const formatPrice = (price) => {
    if (!price) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(price);
  };

  const formatBalance = (balance) => {
    if (!balance) return '0';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(balance);
  };

  const formatPercent = (percent) => {
    if (!percent) return '0%';
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 2
    }).format(percent);
  };

  const formatMarketCap = (marketCap) => {
    if (!marketCap) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(marketCap);
  };

  return (
    <div className="bg-white  shadow-md p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Token Health Audit
          </h1>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Snapshot ID:</span>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
              {data.snapshot_id}
            </code>
          </div>
        </div>
        <div className="mt-4 sm:mt-0">
          <div className="text-right">
            <div className="text-3xl font-bold text-green-600">
              {formatPrice(price_usd)}
            </div>
            <div className="text-sm text-gray-500">Current Price</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50  p-4">
          <div className="text-2xl font-bold text-gray-900">{total_holders_all?.toLocaleString() || 0}</div>
          <div className="text-sm text-gray-600">Total Holders</div>
        </div>
        
        <div className="bg-gray-50  p-4">
          <div className="text-2xl font-bold text-blue-600">{total_holders_eligible?.toLocaleString() || 0}</div>
          <div className="text-sm text-gray-600">Eligible Holders</div>
        </div>
        
        <div className="bg-gray-50  p-4">
          <div className="text-2xl font-bold text-green-600">{formatMarketCap(market_cap_usd)}</div>
          <div className="text-sm text-gray-600">Market Cap</div>
        </div>
        
        <div className="bg-gray-50  p-4">
          <div className="text-2xl font-bold text-purple-600">{formatMarketCap(liquidity_usd)}</div>
          <div className="text-sm text-gray-600">Liquidity</div>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Supply Concentration</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-50  p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{formatPercent(topN_percent_supply?.top1)}</div>
            <div className="text-xs text-gray-600">Top 1</div>
          </div>
          <div className="bg-gray-50  p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{formatPercent(topN_percent_supply?.top10)}</div>
            <div className="text-xs text-gray-600">Top 10</div>
          </div>
          <div className="bg-gray-50  p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{formatPercent(topN_percent_supply?.top50)}</div>
            <div className="text-xs text-gray-600">Top 50</div>
          </div>
          <div className="bg-gray-50  p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{formatPercent(topN_percent_supply?.top100)}</div>
            <div className="text-xs text-gray-600">Top 100</div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Holder Distribution by Tier</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="text-center">
            <div className="text-xl font-bold text-purple-600">{tier_counts?.whale || 0}</div>
            <div className="text-xs text-gray-600">Whales</div>
            <div className="text-xs text-gray-500">{formatPercent(percent_holders_by_tier?.whale)}</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-blue-600">{tier_counts?.shark || 0}</div>
            <div className="text-xs text-gray-600">Sharks</div>
            <div className="text-xs text-gray-500">{formatPercent(percent_holders_by_tier?.shark)}</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-600">{tier_counts?.dolphin || 0}</div>
            <div className="text-xs text-gray-600">Dolphins</div>
            <div className="text-xs text-gray-500">{formatPercent(percent_holders_by_tier?.dolphin)}</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-yellow-600">{tier_counts?.fish || 0}</div>
            <div className="text-xs text-gray-600">Fish</div>
            <div className="text-xs text-gray-500">{formatPercent(percent_holders_by_tier?.fish)}</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-orange-600">{tier_counts?.shrimp || 0}</div>
            <div className="text-xs text-gray-600">Shrimp</div>
            <div className="text-xs text-gray-500">{formatPercent(percent_holders_by_tier?.shrimp)}</div>
          </div>
        </div>
      </div>

      {/* Deltas Section */}
      {created && deltas && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Changes vs Previous Snapshot</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50  p-3 text-center">
              <div className={`text-lg font-bold ${(deltas.holders || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(deltas.holders || 0) >= 0 ? '+' : ''}{deltas.holders || 0}
              </div>
              <div className="text-xs text-gray-600">Holders</div>
            </div>
            <div className="bg-gray-50  p-3 text-center">
              <div className={`text-lg font-bold ${(deltas.whale || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(deltas.whale || 0) >= 0 ? '+' : ''}{deltas.whale || 0}
              </div>
              <div className="text-xs text-gray-600">Whales</div>
            </div>
            <div className="bg-gray-50  p-3 text-center">
              <div className={`text-lg font-bold ${(deltas.shark || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(deltas.shark || 0) >= 0 ? '+' : ''}{deltas.shark || 0}
              </div>
              <div className="text-xs text-gray-600">Sharks</div>
            </div>
            <div className="bg-gray-50  p-3 text-center">
              <div className={`text-lg font-bold ${(deltas.top10_percent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(deltas.top10_percent || 0) >= 0 ? '+' : ''}{formatPercent(deltas.top10_percent || 0)}
              </div>
              <div className="text-xs text-gray-600">Top 10%</div>
            </div>
          </div>
        </div>
      )}

      {/* Top holders Section */}
      {notable_holders && notable_holders.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Top holders</h3>
          <div className="bg-gray-50  p-4">
            <div className="space-y-2">
              {notable_holders.slice(0, 10).map((holder, index) => (
                <div key={holder.address} className="flex justify-between items-center text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500">#{index + 1}</span>
                    <code className="text-xs bg-gray-200 px-2 py-1 rounded font-mono">
                      {holder.address.slice(0, 8)}...{holder.address.slice(-8)}
                    </code>
                    {holder.label && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {holder.label}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatPrice(holder.balance_usd)}</div>
                    <div className="text-xs text-gray-500">{formatPercent(holder.percent_supply)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
