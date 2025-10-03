"use client";
import { useState } from "react";

export default function OverlapTable({ wallets, loading, error }) {
  const [sortBy, setSortBy] = useState('combined_usd');
  const [sortOrder, setSortOrder] = useState('desc');

  if (loading) {
    return (
      <div className="bg-white  shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
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

  if (!wallets || wallets.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200  p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Overlap Details</h2>
        <p className="text-gray-600">No overlapping wallets found</p>
      </div>
    );
  }

  const shortenAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatUSD = (usd) => {
    if (!usd) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(usd);
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const getTierColor = (tier) => {
    switch (tier) {
      case 'whale': return 'bg-purple-100 text-purple-800';
      case 'shark': return 'bg-blue-100 text-blue-800';
      case 'dolphin': return 'bg-green-100 text-green-800';
      case 'fish': return 'bg-yellow-100 text-yellow-800';
      case 'shrimp': return 'bg-orange-100 text-orange-800';
      case 'minnow': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const sortedWallets = [...wallets].sort((a, b) => {
    let aVal, bVal;
    
    switch (sortBy) {
      case 'address':
        aVal = a.address || '';
        bVal = b.address || '';
        break;
      case 'balanceA_usd':
        // Get the first USD property (Token A)
        aVal = Object.values(a).find(val => typeof val === 'number' && val > 0) || 0;
        bVal = Object.values(b).find(val => typeof val === 'number' && val > 0) || 0;
        break;
      case 'balanceB_usd':
        // Get the second USD property (Token B) 
        const aUsdValues = Object.values(a).filter(val => typeof val === 'number' && val > 0);
        const bUsdValues = Object.values(b).filter(val => typeof val === 'number' && val > 0);
        aVal = aUsdValues[1] || 0;
        bVal = bUsdValues[1] || 0;
        break;
      case 'combined_usd':
        aVal = Object.values(a).filter(val => typeof val === 'number' && val > 0).reduce((sum, val) => sum + val, 0);
        bVal = Object.values(b).filter(val => typeof val === 'number' && val > 0).reduce((sum, val) => sum + val, 0);
        break;
      default:
        aVal = Object.values(a).filter(val => typeof val === 'number' && val > 0).reduce((sum, val) => sum + val, 0);
        bVal = Object.values(b).filter(val => typeof val === 'number' && val > 0).reduce((sum, val) => sum + val, 0);
    }

    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="bg-white  shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Overlap Details</h2>
        <span className="text-sm text-gray-500">{wallets.length} wallets</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th 
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('address')}
              >
                Address <SortIcon column="address" />
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('balanceA_usd')}
              >
                Token A Value <SortIcon column="balanceA_usd" />
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('balanceB_usd')}
              >
                Token B Value <SortIcon column="balanceB_usd" />
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('combined_usd')}
              >
                Combined Value <SortIcon column="combined_usd" />
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tier
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Label
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedWallets.map((wallet, index) => (
              <tr key={wallet.address || index} className="hover:bg-gray-50">
                <td className="px-3 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-mono text-gray-900">
                      {shortenAddress(wallet.address)}
                    </span>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => copyToClipboard(wallet.address)}
                        className="text-gray-400 hover:text-gray-600 text-xs"
                        title="Copy address"
                      >
                        📋
                      </button>
                      <a
                        href={`https://solscan.io/account/${wallet.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-gray-600 text-xs"
                        title="View on Solscan"
                      >
                        🔗
                      </a>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatUSD(Object.values(wallet).find(val => typeof val === 'number' && val > 0) || null)}
                </td>
                <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                  {(() => {
                    const usdValues = Object.values(wallet).filter(val => typeof val === 'number' && val > 0);
                    return formatUSD(usdValues[1] || null);
                  })()}
                </td>
                <td className="px-3 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                  {formatUSD(Object.values(wallet).filter(val => typeof val === 'number' && val > 0).reduce((sum, val) => sum + val, 0))}
                </td>
                <td className="px-3 py-4 whitespace-nowrap">
                  {wallet.tier && (
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold  ${getTierColor(wallet.tier)}`}>
                      {wallet.tier}
                    </span>
                  )}
                </td>
                <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                  {wallet.label?.label || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
