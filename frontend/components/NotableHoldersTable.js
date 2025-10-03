"use client";

import { useState } from 'react';

export default function NotableHoldersTable({ holders, className = "" }) {
  const [copiedAddress, setCopiedAddress] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const copyToClipboard = async (address) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const shortenAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatPrice = (price) => {
    if (!price) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
      notation: 'compact'
    }).format(price);
  };

  const formatPercent = (percent) => {
    if (percent == null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 2
    }).format(percent);
  };

  const formatPercentChange = (holder) => {
    const change = holder?.percent_change;
    // Hide for LP pools or missing change
    if (!Number.isFinite(change)) return null;
    if (holder?.label && String(holder.label).toLowerCase().includes('lp')) return null;
    // Suppress insignificant changes (< 0.1% absolute) so 0.0% never shows
    if (Math.abs(change) < 0.1) return null;
    const isPositive = change > 0;
    const sign = isPositive ? '+' : '';
    return (
      <span className={`text-xs ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
        {sign}{change.toFixed(1)}%
      </span>
    );
  };

  if (!holders || holders.length === 0) {
    return (
      <div className={`bg-surface  p-4 ${className}`}>
        <h3 className="text-sm font-semibold mb-3 text-white font-satoshi">Top holders</h3>
        <div className="text-sm text-gray-400 font-ibmplex">No notable holders data available</div>
      </div>
    );
  }

  const total = holders.length;
  const totalPages = Math.ceil(Math.min(total, 50) / pageSize) || 1;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const sliced = holders.slice(0, 50).slice(start, end);

  return (
    <div className={`bg-surface  p-4 ${className}`}>
      <h3 className="text-sm font-semibold mb-3 text-white font-satoshi">Top holders</h3>
      
      <div className="space-y-2">
        {sliced.map((holder, idx) => {
          const index = start + idx;
          return (
          <div 
            key={holder.address || index}
            className={`flex justify-between items-center py-2 border-b border-gray-800 text-sm ${
              index < 3 ? 'font-bold' : ''
            }`}
          >
            <div className="flex items-center space-x-2">
              <span className="text-gray-500 font-ibmplex">#{index + 1}</span>
              <button
                onClick={() => copyToClipboard(holder.address)}
                className="font-mono text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1  transition-colors"
                title={holder.address}
              >
                {shortenAddress(holder.address)}
                {copiedAddress === holder.address && (
                  <span className="ml-1 text-green-400">✓</span>
                )}
              </button>
              {holder.label && (
                <span className="text-xs bg-brand/20 text-brand px-2 py-1  font-ibmplex">
                  {holder.label}
                </span>
              )}
            </div>
            
            <div className="text-right">
              <div className={`font-satoshi ${index < 3 ? 'text-brand' : 'text-white'}`}>
                {formatPrice(holder.balance_usd)}
              </div>
              <div className="text-xs text-gray-400 font-ibmplex">
                {formatPercent(holder.percent_supply)}
              </div>
              {formatPercentChange(holder)}
            </div>
          </div>
          );
        })}
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <button
              className="text-xs text-gray-300 hover:text-white disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
            <button
              className="text-xs text-gray-300 hover:text-white disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
