"use client";

export default function OverlapCard({ data, mintA, mintB, loading, error }) {
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
        <p className="text-gray-600">No comparison data available</p>
      </div>
    );
  }

  const shortenAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  // Get overlap data from the new response structure
  const overlapData = data.overlaps?.ab || {};
  const totalOverlap = overlapData.wallet_count || 0;
  const tierCounts = overlapData.tier_counts || {};
  const notableWallets = overlapData.notable_wallets || [];
  const percentSupply = overlapData.percent_supply || {};
  const health = overlapData.health || {};

  return (
    <div className="bg-white  shadow-md p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Token Overlap Analysis
        </h1>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gray-50  p-4">
            <div className="text-sm text-gray-600 mb-1">Token A</div>
            <div className="font-mono text-sm text-gray-900">
              {shortenAddress(mintA)}
            </div>
          </div>
          <div className="bg-gray-50  p-4">
            <div className="text-sm text-gray-600 mb-1">Token B</div>
            <div className="font-mono text-sm text-gray-900">
              {shortenAddress(mintB)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-blue-50  p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">{totalOverlap}</div>
          <div className="text-sm text-blue-800">Overlapping Wallets</div>
        </div>
        
        <div className="bg-green-50  p-4 text-center">
          <div className="text-3xl font-bold text-green-600">{notableWallets.length}</div>
          <div className="text-sm text-green-800">Notable Wallets</div>
        </div>
        
        <div className="bg-purple-50  p-4 text-center">
          <div className="text-3xl font-bold text-purple-600">
            {tierCounts.whale || 0}
          </div>
          <div className="text-sm text-purple-800">Whales</div>
        </div>
        
        <div className="bg-orange-50  p-4 text-center">
          <div className="text-3xl font-bold text-orange-600">
            {tierCounts.shrimp || 0}
          </div>
          <div className="text-sm text-orange-800">Shrimp</div>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Tier Distribution</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-gray-50  p-3 text-center">
            <div className="text-xl font-bold text-purple-600">{tierCounts.whale || 0}</div>
            <div className="text-xs text-gray-600">Whales</div>
          </div>
          <div className="bg-gray-50  p-3 text-center">
            <div className="text-xl font-bold text-blue-600">{tierCounts.shark || 0}</div>
            <div className="text-xs text-gray-600">Sharks</div>
          </div>
          <div className="bg-gray-50  p-3 text-center">
            <div className="text-xl font-bold text-green-600">{tierCounts.dolphin || 0}</div>
            <div className="text-xs text-gray-600">Dolphins</div>
          </div>
          <div className="bg-gray-50  p-3 text-center">
            <div className="text-xl font-bold text-yellow-600">{tierCounts.fish || 0}</div>
            <div className="text-xs text-gray-600">Fish</div>
          </div>
          <div className="bg-gray-50  p-3 text-center">
            <div className="text-xl font-bold text-orange-600">{tierCounts.shrimp || 0}</div>
            <div className="text-xs text-gray-600">Shrimp</div>
          </div>
        </div>
      </div>

      {/* Supply Percentage */}
      {Object.keys(percentSupply).length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Supply Overlap</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(percentSupply).map(([token, percent]) => (
              <div key={token} className="bg-gray-50  p-4">
                <div className="text-sm text-gray-600 mb-1">
                  {shortenAddress(token)} Supply
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {(percent * 100).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health Flags */}
      {(health.whale_heavy || health.shrimp_growth) && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Health Indicators</h3>
          <div className="flex flex-wrap gap-2">
            {health.whale_heavy && (
              <span className="inline-flex px-3 py-1 text-sm font-semibold  bg-purple-100 text-purple-800">
                Whale Heavy
              </span>
            )}
            {health.shrimp_growth && (
              <span className="inline-flex px-3 py-1 text-sm font-semibold  bg-orange-100 text-orange-800">
                Shrimp Growth
              </span>
            )}
          </div>
        </div>
      )}

      {notableWallets.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Notable Wallets</h3>
          <div className="space-y-2">
            {notableWallets.slice(0, 10).map((wallet, index) => (
              <div key={wallet.address || index} className="flex items-center justify-between bg-gray-50  p-3">
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-500">#{index + 1}</span>
                  <span className="font-mono text-sm text-gray-900">
                    {shortenAddress(wallet.address)}
                  </span>
                  {wallet.label && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {wallet.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {(() => {
                        const usdValues = Object.values(wallet).filter(val => typeof val === 'number' && val > 0);
                        const total = usdValues.reduce((sum, val) => sum + val, 0);
                        return `$${total.toLocaleString()}`;
                      })()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(() => {
                        const usdValues = Object.values(wallet).filter(val => typeof val === 'number' && val > 0);
                        return `A: $${(usdValues[0] || 0).toLocaleString()} | B: $${(usdValues[1] || 0).toLocaleString()}`;
                      })()}
                    </div>
                  </div>
                  {wallet.tier && (
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold  ${
                      wallet.tier === 'whale' ? 'bg-purple-100 text-purple-800' :
                      wallet.tier === 'shark' ? 'bg-blue-100 text-blue-800' :
                      wallet.tier === 'dolphin' ? 'bg-green-100 text-green-800' :
                      wallet.tier === 'fish' ? 'bg-yellow-100 text-yellow-800' :
                      wallet.tier === 'shrimp' ? 'bg-orange-100 text-orange-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {wallet.tier}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {/* Footer removed per request */}
          </div>
        </div>
      )}
    </div>
  );
}
