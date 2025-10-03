"use client";
import { useState } from "react";

export default function HolderTable({ holders, loading, error }) {
  const [sortBy, setSortBy] = useState('balance');
  const [sortOrder, setSortOrder] = useState('desc');

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
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
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!holders || holders.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Top Holders</h2>
        <p className="text-gray-600">No holder data available</p>
      </div>
    );
  }

  const shortenAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatBalance = (balance) => {
    if (!balance) return '0';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(balance);
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

  const sortedHolders = [...holders].sort((a, b) => {
    let aVal, bVal;
    
    switch (sortBy) {
      case 'balance':
        aVal = a.balance || 0;
        bVal = b.balance || 0;
        break;
      case 'balance_usd':
        aVal = a.balance_usd || 0;
        bVal = b.balance_usd || 0;
        break;
      case 'address':
        aVal = a.address || '';
        bVal = b.address || '';
        break;
      default:
        aVal = a.balance || 0;
        bVal = b.balance || 0;
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
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Top Holders</h2>
        <span className="text-sm text-gray-500">{holders.length} holders</span>
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
                onClick={() => handleSort('balance')}
              >
                Balance <SortIcon column="balance" />
              </th>
              <th 
                className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('balance_usd')}
              >
                USD Value <SortIcon column="balance_usd" />
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
            {sortedHolders.map((holder, index) => (
              <tr key={holder.address || index} className="hover:bg-gray-50">
                <td className="px-3 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-mono text-gray-900">
                      {shortenAddress(holder.address)}
                    </span>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => copyToClipboard(holder.address)}
                        className="text-gray-400 hover:text-gray-600 text-xs"
                        title="Copy address"
                      >
                        📋
                      </button>
                      <a
                        href={`https://solscan.io/account/${holder.address}`}
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
                  {formatBalance(holder.balance)}
                </td>
                <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatUSD(holder.balance_usd)}
                </td>
                <td className="px-3 py-4 whitespace-nowrap">
                  {holder.tier && (
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTierColor(holder.tier)}`}>
                      {holder.tier}
                    </span>
                  )}
                </td>
                <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                  {holder.label || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
