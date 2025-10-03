"use client";
import { useState, useEffect } from "react";
import { supabase } from '../../lib/supabaseClient';
import PaywallModal from '../../components/PaywallModal';
import { useRouter } from 'next/navigation';
import AuthPrompt from '../../components/AuthPrompt';

export default function TrendingPage() {
  const router = useRouter();
  // using client-side supabase singleton
  const [trendingData, setTrendingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('24h');
  const [paidCheckLoading, setPaidCheckLoading] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  const timeframes = [
    { value: '1h', label: '1 Hour' },
    { value: '6h', label: '6 Hours' },
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' }
  ];

  useEffect(() => {
    fetchTrendingData();
  }, [timeframe]);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data: { user } } = await supabase.auth.getUser();
        setIsAuthed(!!user);
        setUserEmail(user?.email || '');
        let paid = false;
        if (session?.access_token) {
          const res = await fetch(`${backendBase}/api/subscription/status`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
          const json = await res.json();
          paid = !!json.active;
        }
        setIsPaid(paid);
      } finally {
        setPaidCheckLoading(false);
      }
    })();
  }, [supabase]);

  const fetchTrendingData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/api/analytics?type=trending&timeframe=${timeframe}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch trending data');
      }
      
      const data = await response.json();
      setTrendingData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTokenClick = (tokenAddress) => {
    router.push(`/?token=${tokenAddress}`);
  };

  if (paidCheckLoading) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent  animate-spin"></div>
      </div>
    );
  }

  if (!isPaid) {
    if (!isAuthed) {
      return <AuthPrompt title="Trending Searches" />;
    }
    return (
      <div className="min-h-screen bg-night flex items-center justify-center px-6">
        <div className="bg-surface  p-6 max-w-md w-full space-y-3 text-center">
          <h2 className="text-lg font-semibold text-white">Subscribe to view Trending</h2>
          <a
            href={`https://app.hel.io/pay/68d74139efd8182ed53e0d0b?email=${encodeURIComponent(userEmail)}`}
            target="_blank"
            className="block w-full bg-brand text-white py-2.5  hover:bg-brand/90"
          >
            Upgrade – Monthly
          </a>
          <a
            href={`https://app.hel.io/pay/68dc267e44e2e12e43272271?email=${encodeURIComponent(userEmail)}`}
            target="_blank"
            className="block w-full bg-brand/80 text-white py-2.5  hover:bg-brand/70"
          >
            Upgrade – Yearly
          </a>
        </div>
      </div>
    );
  }

  if (!isPaid) {
    return <PaywallModal feature="trending searches" />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent  animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center">
        <div className="max-w-md mx-auto px-4">
          <div className="bg-red-900/20 border border-red-500/30  p-4">
            <div className="text-sm text-red-400">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-night">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-night/95 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button 
            onClick={() => router.push('/')}
            className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
          >
            <img src="/strata.svg" alt="Strata" className="w-8 h-8" />
            <span className="text-white font-semibold">Strata</span>
          </button>
          <h1 className="text-lg font-semibold text-white">Trending Tokens</h1>
          <div></div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-20 space-y-6">
        {/* Timeframe Selector */}
        <div className="bg-surface  p-4">
          <h2 className="text-sm font-semibold text-white font-satoshi mb-3">
            Time Period
          </h2>
          <div className="flex flex-wrap gap-2">
            {timeframes.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-3 py-1  text-sm font-medium transition-colors ${
                  timeframe === tf.value
                    ? 'bg-brand text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        {trendingData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface  p-4">
              <div className="text-sm text-gray-400 mb-1">Total Searches</div>
              <div className="text-2xl font-bold text-white">
                {trendingData.total_searches?.toLocaleString() || '0'}
              </div>
            </div>
            <div className="bg-surface  p-4">
              <div className="text-sm text-gray-400 mb-1">Unique Tokens</div>
              <div className="text-2xl font-bold text-white">
                {trendingData.unique_tokens?.toLocaleString() || '0'}
              </div>
            </div>
            <div className="bg-surface  p-4">
              <div className="text-sm text-gray-400 mb-1">Time Period</div>
              <div className="text-2xl font-bold text-white">
                {timeframes.find(tf => tf.value === timeframe)?.label || timeframe}
              </div>
            </div>
          </div>
        )}

        {/* Trending Tokens List */}
        <div className="bg-surface  p-4">
          <h2 className="text-sm font-semibold text-white font-satoshi mb-4">
            Trending Tokens
          </h2>
          
          {trendingData?.trending_tokens?.length > 0 ? (
            <div className="space-y-2">
              {trendingData.trending_tokens.map((token, index) => (
                <div
                  key={token.token_address}
                  onClick={() => handleTokenClick(token.token_address)}
                  className="flex items-center justify-between p-3 bg-gray-800/50  hover:bg-gray-700/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-brand/20  flex items-center justify-center text-sm font-bold text-brand">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-mono text-sm text-white">
                        {token.token_address.slice(0, 8)}...{token.token_address.slice(-8)}
                      </div>
                      <div className="text-xs text-gray-400">
                        {token.search_count} search{token.search_count !== 1 ? 'es' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-brand">
                      {token.search_count}
                    </div>
                    <div className="text-xs text-gray-400">searches</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-gray-400 mb-2">No trending tokens found</div>
              <div className="text-sm text-gray-500">
                Try a different time period or check back later
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
