"use client";
import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import LoginModal from '../components/LoginModal';
import StatCard from "../components/StatCard";
import ProgressStat from "../components/ProgressStat";
import DeltaCard from "../components/DeltaCard";
import TierDistribution from "../components/TierDistribution";
import NotableHoldersTable from "../components/NotableHoldersTable";
import OverlapCard from "../components/OverlapCard";
import OverlapTable from "../components/OverlapTable";
import DataStatusBar from "../components/DataStatusBar";
import SearchInput from "../components/SearchInput";
import SupplyConcentration from "../components/SupplyConcentration";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mintA, setMintA] = useState("");
  const [mintB, setMintB] = useState("");
  const [mintC, setMintC] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [threeWayMode, setThreeWayMode] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(null);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [usageInfo, setUsageInfo] = useState(null);
  const [userPlan, setUserPlan] = useState(null);
  const [dataAge, setDataAge] = useState(null);
  const [isLiveFetching, setIsLiveFetching] = useState(false);
  
  // Development feature flag - set via environment variable
  const DEV_BYPASS_AUTH = false;

  // Check authentication and subscription status
  useEffect(() => {
    const checkAuth = async () => {
      if (false) {
        // Development mode - simulate paid user
        setUser({ email: 'dev@test.com', id: 'dev-user' });
        setHasSubscription(true);
        setUserPlan('premium');
        setCheckingSubscription(false);
        setUsageInfo(null); // Clear usage info for dev mode
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      try {
        let headers = {};
        if (user) {
          const session = await supabase.auth.getSession();
          headers['Authorization'] = `Bearer ${session.data.session?.access_token}`;
        }

        const res = await fetch(`${backendBase}/api/subscription/status`, { headers });
        const data = await res.json();
        
        setHasSubscription(data.active);
        setUserPlan(data.plan || 'free');
        
        // Store usage info for anonymous users
        if (!data.authenticated) {
          setUsageInfo({
            remaining: data.remaining_searches,
            total: data.total_searches,
            canSearch: data.active
          });
        }
      } catch (error) {
        console.error('Failed to check subscription:', error);
        setHasSubscription(false);
      }
      
      setCheckingSubscription(false);
    };

    checkAuth();

    // Listen for auth changes (only if not in dev mode)
    let authSubscription = null;
    if (true) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
          setUser(session.user);
          checkAuth();
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setHasSubscription(false);
          setUserPlan('free');
          setUsageInfo(null);
        }
      });
      authSubscription = subscription;
    }

    return () => {
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, []);

  const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

  // Validate Solana contract address
  const isValidSolanaAddress = (address) => {
    if (!address || typeof address !== 'string') return false;
    
    // Solana addresses are base58 encoded, 32-44 characters
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return address.length >= 32 && address.length <= 44 && base58Regex.test(address);
  };

  const pasteFromClipboard = async (setter) => {
    try {
      const text = await navigator.clipboard.readText();
      setter(text);
      
      // Auto-trigger analysis when pasting
      if (text.trim()) {
        if (compareMode) {
          // For compare mode, we need both tokens to auto-trigger
          if (setter === setMintA) {
            // If pasting to Token A, check if Token B is filled
            if (mintB.trim()) {
              setTimeout(() => runCompare(text.trim(), mintB, mintC), 100);
            }
          } else if (setter === setMintB) {
            // If pasting to Token B, check if Token A is filled
            if (mintA.trim()) {
              setTimeout(() => runCompare(mintA, text.trim(), mintC), 100);
            }
          } else if (setter === setMintC) {
            // If pasting to Token C, check if A and B are filled
            if (mintA.trim() && mintB.trim()) {
              setTimeout(() => runCompare(mintA, mintB, text.trim()), 100);
            }
          }
        } else {
          // Single token mode - auto-trigger audit
          setTimeout(() => runAudit(text.trim()), 100);
        }
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  const runAudit = async (mintAddress) => {
    if (!mintAddress?.trim()) {
      setError("Please enter a mint address");
      return;
    }

    // Validate Solana contract address format
    if (!isValidSolanaAddress(mintAddress.trim())) {
      setError("Invalid Solana contract address format");
      return;
    }

    // Check if user can search based on their status
    if (!user) {
      // Anonymous user - check remaining searches
      if (!usageInfo || !usageInfo.canSearch) {
        setError(`You've used all ${usageInfo?.total || 3} free daily searches. Create an account to get unlimited access!`);
        return;
      }
    } else if (user && !hasSubscription) {
      // Authenticated user without subscription
      router.push('/subscription');
      return;
    }

    setError("");
    setLoading(true);
    setData(null);
    setDataAge(null);
    setIsLiveFetching(false);

    try {
      // First, try to get cached data instantly
      const cachedRes = await fetch(`${backendBase}/api/audit/cached`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mint: mintAddress.trim() })
      });

      if (cachedRes.ok) {
        const cachedData = await cachedRes.json();
        setData(cachedData);
        setDataAge(cachedData.data_age);
        
        // If user has subscription, trigger live data fetch in background
        if (hasSubscription) {
          setIsLiveFetching(true);
          try {
            const headers = {
              'Content-Type': 'application/json',
            };
            
            // Add authorization header if user is authenticated
            if (user) {
              const session = await supabase.auth.getSession();
              if (session.data.session?.access_token) {
                headers['Authorization'] = `Bearer ${session.data.session.access_token}`;
              }
            }
            
            await fetch(`${backendBase}/api/audit/live`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ mint: mintAddress.trim() })
            });
            
            // Poll for updated data every 5 seconds
            const pollInterval = setInterval(async () => {
              try {
                const updatedRes = await fetch(`${backendBase}/api/audit/cached`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ mint: mintAddress.trim() })
                });
                
                if (updatedRes.ok) {
                  const updatedData = await updatedRes.json();
                  // Check if we have newer data (different snapshot ID)
                  if (updatedData.snapshot_id !== cachedData.snapshot_id) {
                    setData(updatedData);
                    setDataAge(updatedData.data_age);
                    setIsLiveFetching(false);
                    clearInterval(pollInterval);
                  }
                }
              } catch (error) {
                console.error('Error polling for updated data:', error);
              }
            }, 5000);
            
            // Stop polling after 2 minutes
            setTimeout(() => {
              clearInterval(pollInterval);
              setIsLiveFetching(false);
            }, 120000);
          } catch (error) {
            console.error('Error triggering live data fetch:', error);
            setIsLiveFetching(false);
          }
        }
      } else {
        // No cached data available, fall back to original live fetch
        const res = await fetch(`${backendBase}/api/audit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mint: mintAddress.trim() })
        });
        const json = await res.json();
        
        if (!res.ok) {
          throw new Error(json.error || json.message || `HTTP ${res.status}`);
        }
        
        setData(json);
        setDataAge({ minutes: 0, hours: 0, days: 0, formatted: 'Just now' });
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const runCompare = async (mintAAddress, mintBAddress, mintCAddress = null) => {
    if (!mintAAddress?.trim() || !mintBAddress?.trim()) {
      setError("Please enter both mint addresses");
      return;
    }

    if (threeWayMode && !mintCAddress?.trim()) {
      setError("Please enter all three mint addresses");
      return;
    }

    // Validate all addresses
    if (!isValidSolanaAddress(mintAAddress.trim())) {
      setError("Invalid Solana contract address format for Token A");
      return;
    }
    if (!isValidSolanaAddress(mintBAddress.trim())) {
      setError("Invalid Solana contract address format for Token B");
      return;
    }
    if (threeWayMode && !isValidSolanaAddress(mintCAddress.trim())) {
      setError("Invalid Solana contract address format for Token C");
      return;
    }

    // Overlap analysis is a paid feature - only for subscribed users
    if (!user || !hasSubscription) {
      if (!user) {
        setError("Please sign in to access overlap analysis");
        setShowLogin(true);
      } else {
        router.push('/subscription');
      }
      return;
    }

    setError("");
    setLoading(true);
    setData(null);

    try {
      const mints = [mintAAddress.trim(), mintBAddress.trim()];
      if (threeWayMode && mintCAddress?.trim()) {
        mints.push(mintCAddress.trim());
      }

      const res = await fetch(`${backendBase}/api/compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mints })
      });
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error || json.message || `HTTP ${res.status}`);
      }
      
      setData(json);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };


  const toggleCompareMode = () => {
    if (compareMode) {
      // Going back to single token mode
      setCompareMode(false);
      setThreeWayMode(false);
      setMintB("");
      setMintC("");
    } else {
      // Going to compare mode
      setCompareMode(true);
      setThreeWayMode(false);
      setMintC("");
    }
    setData(null);
    setError("");
  };

  const toggleThreeWayMode = () => {
    setThreeWayMode(!threeWayMode);
    if (!threeWayMode) {
      setMintC("");
    }
    setData(null);
    setError("");
  };

  const handleLogoClick = () => {
    // Reset everything to initial state
    setMintA("");
    setMintB("");
    setMintC("");
    setData(null);
    setError("");
    setLoading(false);
    setCompareMode(false);
    setThreeWayMode(false);
    setDataAge(null);
    setIsLiveFetching(false);
  };

  const handleRefresh = async () => {
    if (mintA.trim() && !compareMode) {
      await runAudit(mintA.trim());
    }
  };

  // Show loading state while checking subscription
  if (checkingSubscription) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent animate-spin"></div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-night relative">
      {/* Login Modal */}
      <LoginModal 
        isOpen={showLogin} 
        onClose={() => setShowLogin(false)}
        onLogin={() => setShowLogin(false)}
      />

      {/* Data Status Bar removed per request (keep background refresh functionality) */}

      {/* Top nav removed per request */}

      <div style={{ minHeight: 'calc(100vh - var(--bottom-nav-h))' }}>


        {/* Mode Toggle removed per request; navigation now via bottom nav */}

        {/* Logo + Input Form */}
        <div className="w-full bg-surface py-4 space-y-4 flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - var(--bottom-nav-h))' }}>
          <div className="flex justify-center py-2">
            <img src="/strata.svg" alt="Strata" className="w-12 h-12" />
          </div>
            <SearchInput
              value={mintA}
              onChange={(e) => {
                setMintA(e.target.value);
                if (!compareMode && e.target.value.trim()) {
                  setTimeout(() => runAudit(e.target.value.trim()), 500);
                }
              }}
              onPaste={() => pasteFromClipboard(setMintA)}
              placeholder={loading ? "Analyzing..." : "Paste CA"}
              disabled={loading}
            />

            {compareMode && (
              <SearchInput
                value={mintB}
                onChange={(e) => setMintB(e.target.value)}
                onPaste={() => pasteFromClipboard(setMintB)}
                placeholder={loading ? "Analyzing..." : "Paste CA"}
                disabled={loading}
              />
            )}

            {threeWayMode && (
              <SearchInput
                value={mintC}
                onChange={(e) => setMintC(e.target.value)}
                onPaste={() => pasteFromClipboard(setMintC)}
                placeholder={loading ? "Analyzing..." : "Paste CA"}
                disabled={loading}
              />
            )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 p-4">
            <div className="text-sm text-red-400 font-ibmplex">{error}</div>
          </div>
        )}

        {/* Audit Results */}
        {data && !compareMode && (
          <div className="space-y-4">
            {/* Token Overview */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard 
                label="Total Holders" 
                value={data.total_holders_all?.toLocaleString() || '0'} 
              />
              <StatCard 
                label="Holders > $100" 
                value={data.total_holders_eligible?.toLocaleString() || '0'} 
              />
            </div>

            {/* Holder Distribution: show holders% and supply% per tier */}
            <TierDistribution 
              tierCounts={data.tier_counts}
              percentHoldersByTier={data.percent_holders_by_tier}
              percentSupplyByTier={data.percent_supply_by_tier}
            />

            {/* Supply Concentration */}
            <SupplyConcentration topN_percent_supply={data.topN_percent_supply} />

            {/* Changes vs Previous Snapshot */}
            {data.deltas && (
              <div className="bg-surface p-4">
                <h3 className="text-sm font-semibold text-white font-satoshi mb-3">Changes vs Previous</h3>
                <div className="grid grid-cols-2 gap-2">
                  <DeltaCard 
                    label="Holders" 
                    value={data.deltas.holders >= 0 ? `+${data.deltas.holders}` : `${data.deltas.holders}`}
                    trend={data.deltas.holders > 0 ? 'up' : data.deltas.holders < 0 ? 'down' : 'neutral'}
                  />
                  <DeltaCard 
                    label="Whales" 
                    value={data.deltas.whale >= 0 ? `+${data.deltas.whale}` : `${data.deltas.whale}`}
                    trend={data.deltas.whale > 0 ? 'up' : data.deltas.whale < 0 ? 'down' : 'neutral'}
                  />
                  <DeltaCard 
                    label="Sharks" 
                    value={data.deltas.shark >= 0 ? `+${data.deltas.shark}` : `${data.deltas.shark}`}
                    trend={data.deltas.shark > 0 ? 'up' : data.deltas.shark < 0 ? 'down' : 'neutral'}
                  />
                  <DeltaCard 
                    label="Top 10%" 
                    value={data.deltas.top10_percent >= 0 ? 
                      `+${new Intl.NumberFormat('en-US', {
                        style: 'percent',
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 2
                      }).format(data.deltas.top10_percent)}` : 
                      new Intl.NumberFormat('en-US', {
                        style: 'percent',
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 2
                      }).format(data.deltas.top10_percent)
                    }
                    trend={data.deltas.top10_percent > 0 ? 'up' : data.deltas.top10_percent < 0 ? 'down' : 'neutral'}
                  />
                </div>
              </div>
            )}

            {/* Whale analysis removed; integrated into distribution and top holders */}

            {/* Notable Holders */}
            <NotableHoldersTable holders={data.notable_holders} />

            {/* Search Analytics removed per request on holder mapping view */}

            {/* Snapshot Details removed per request */}
          </div>
        )}

        {/* Compare Results */}
        {data && compareMode && (
          <div className="space-y-4">
            <OverlapCard data={data} mintA={mintA} mintB={mintB} loading={loading} error={error} />
            <OverlapTable wallets={data.overlaps?.ab?.notable_wallets || []} loading={loading} error={error} />
          </div>
        )}

      </div>
    </div>
  );
}
