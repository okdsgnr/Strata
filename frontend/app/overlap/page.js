"use client";

import { useEffect, useState } from "react";
import { supabase } from '../../lib/supabaseClient';
import PaywallModal from "../../components/PaywallModal";
import OverlapCard from "../../components/OverlapCard";
import OverlapTable from "../../components/OverlapTable";
import SearchInput from "../../components/SearchInput";
import AuthPrompt from "../../components/AuthPrompt";

export default function OverlapPage() {
  // using client-side supabase singleton
  const [mintA, setMintA] = useState("");
  const [mintB, setMintB] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [paidCheckLoading, setPaidCheckLoading] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  const isValidSolanaAddress = (address) => {
    if (!address || typeof address !== 'string') return false;
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return address.length >= 32 && address.length <= 44 && base58Regex.test(address);
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data: { user } } = await supabase.auth.getUser();
        setIsAuthed(!!user);
        setUserEmail(user?.email || "");
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

  const runCompare = async () => {
    if (!mintA?.trim() || !mintB?.trim()) {
      setError("Please enter both mint addresses");
      return;
    }

    if (!isValidSolanaAddress(mintA.trim())) {
      setError("Invalid Solana contract address format for Token A");
      return;
    }
    if (!isValidSolanaAddress(mintB.trim())) {
      setError("Invalid Solana contract address format for Token B");
      return;
    }

    setError("");
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`${backendBase}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mints: [mintA.trim(), mintB.trim()] })
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

  const paste = async (setter) => {
    try {
      const text = await navigator.clipboard.readText();
      setter(text);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  if (paidCheckLoading) return <div className="min-h-screen bg-night flex items-center justify-center text-gray-300">Loading…</div>;
  if (!isPaid) {
    if (!isAuthed) {
      return <AuthPrompt title="Overlap Analysis" />;
    }
    // Logged in but not paid: show subscribe options
    return (
      <div className="min-h-screen bg-night flex items-center justify-center px-6">
        <div className="bg-surface  p-6 max-w-md w-full space-y-3 text-center">
          <h2 className="text-lg font-semibold text-white">Subscribe to access Overlap Analysis</h2>
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

  return (
    <div className="min-h-screen bg-night">
      <div className="px-6 min-h-full flex items-center">
        <div className="w-full bg-surface p-4 space-y-3">
          <SearchInput
            value={mintA}
            onChange={(e) => setMintA(e.target.value)}
            onPaste={() => paste(setMintA)}
            placeholder={loading ? "Analyzing..." : "Token A Mint Address"}
            disabled={loading}
            className=""
          />
          <div className="relative">
            <SearchInput
              value={mintB}
              onChange={(e) => setMintB(e.target.value)}
              onPaste={() => paste(setMintB)}
              placeholder={loading ? "Analyzing..." : "Token B Mint Address"}
              disabled={loading}
              className=""
            />
          </div>
          <button
            onClick={runCompare}
            disabled={loading}
            className="w-full bg-brand text-white  py-2 text-sm hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Run Overlap Analysis"}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/30  p-4">
            <div className="text-sm text-red-400 font-ibmplex">{error}</div>
          </div>
        )}

        {data && (
          <div className="space-y-4 pb-4">
            <OverlapCard data={data} mintA={mintA} mintB={mintB} loading={loading} error={error} />
            <OverlapTable wallets={data.overlaps?.ab?.notable_wallets || []} loading={loading} error={error} />
          </div>
        )}
      </div>
    </div>
  );
}


