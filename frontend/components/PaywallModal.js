"use client";
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function PaywallModal({ isOpen = true, feature = "this feature", onClose }) {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await supabase.auth.signInWithOAuth({ provider: 'google' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Full-page replacement (not an overlay). Nothing else should render when this component is returned.
  return (
    <div className="min-h-screen bg-night flex items-center justify-center px-4">
      <div className="bg-surface  p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold text-white mb-2">Upgrade Required</h2>
        <p className="text-gray-300 mb-6">You need a paid subscription to access {feature}.</p>
        <div className="space-y-3">
          <button
            className="w-full bg-brand text-white py-2.5  hover:bg-brand/90 disabled:opacity-50"
            onClick={() => (window.location.href = '/subscription')}
          >
            Subscribe
          </button>
          <button
            className="w-full bg-gray-700 text-white py-2.5  hover:bg-gray-600 disabled:opacity-50"
            onClick={() => (window.location.href = '/settings')}
          >
            Sign In
          </button>
          {onClose && (
            <button className="w-full text-gray-400 hover:text-white text-sm" onClick={onClose}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}
