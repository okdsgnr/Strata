"use client";
import { useState, useEffect } from "react";

export default function SearchAnalytics({ tokenAddress, timeframe = '24h' }) {
  const [searchCount, setSearchCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tokenAddress) return;
    
    const fetchSearchCount = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/api/analytics?type=token-searches&token=${tokenAddress}&timeframe=${timeframe}`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch search data');
        }
        
        const data = await response.json();
        setSearchCount(data.search_count);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSearchCount();
  }, [tokenAddress, timeframe]);

  if (loading) {
    return (
      <div className="bg-surface  p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700  w-1/3 mb-2"></div>
          <div className="h-6 bg-gray-700  w-1/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30  p-4">
        <div className="text-sm text-red-400">Failed to load search data</div>
      </div>
    );
  }

  return (
    <div className="bg-surface  p-4">
      <h3 className="text-sm font-semibold text-white font-satoshi mb-2">
        Search Analytics
      </h3>
      <div className="flex items-center space-x-4">
        <div>
          <div className="text-2xl font-bold text-brand">
            {searchCount?.toLocaleString() || '0'}
          </div>
          <div className="text-xs text-gray-400">
            searches in {timeframe}
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {searchCount > 0 ? 'Trending' : 'No recent searches'}
        </div>
      </div>
    </div>
  );
}
