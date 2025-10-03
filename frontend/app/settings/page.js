"use client";
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AuthPrompt from '../../components/AuthPrompt';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);

  const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        if (user) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`${backendBase}/api/subscription/status`, {
              headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
            });
            if (res.ok) {
              const json = await res.json();
              setIsPaid(!!json.active);
              setExpiresAt(json.expires_at || null);
            }
          } catch (e) {}
        } else {
          setIsPaid(false);
          setExpiresAt(null);
        }
      } catch (e) {
        setError(String(e.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sendMagicLink = async () => {
    try {
      setError('');
      setSent(false);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Enter a valid email');
        return;
      }
      const redirectTo = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : undefined;
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo }
      });
      if (authError) throw authError;
      setSent(true);
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const signOut = async () => {
    try {
      setError('');
      await supabase.auth.signOut();
      setUser(null);
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const refreshStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${backendBase}/api/subscription/status`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      });
      if (res.ok) {
        const json = await res.json();
        setIsPaid(!!json.active);
        setExpiresAt(json.expires_at || null);
      }
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthPrompt title="User Profile" />;
  }

  return (
    <div className="min-h-screen bg-night">
      <div className="max-w-md mx-auto p-4">
        <div className="bg-surface">
          {error && <div className="text-sm text-red-400">{error}</div>}

          {
            <div className="space-y-4">
              <div className="text-gray-300 text-sm">Signed in as <span className="font-mono">{user.email}</span></div>

              {isPaid ? (
                <div className="space-y-2">
                  <div className="text-sm text-green-400">Subscription: Active{expiresAt ? ` (expires ${new Date(expiresAt).toLocaleDateString()})` : ''}</div>
                </div>
              ) : (
                <div className="space-y-3">
                  <a
                    href={`https://app.hel.io/pay/68d74139efd8182ed53e0d0b?email=${encodeURIComponent(user.email || '')}`}
                    target="_blank"
                    className="block w-full text-center bg-brand text-white py-2.5 hover:bg-brand/90"
                  >
                    Upgrade – Monthly
                  </a>
                  <a
                    href={`https://app.hel.io/pay/68dc267e44e2e12e43272271?email=${encodeURIComponent(user.email || '')}`}
                    target="_blank"
                    className="block w-full text-center bg-brand/80 text-white py-2.5 hover:bg-brand/70"
                  >
                    Upgrade – Yearly
                  </a>
                </div>
              )}

              <button
                className="w-full bg-gray-700 text-white py-2.5 hover:bg-gray-600"
                onClick={signOut}
              >
                Sign Out
              </button>
            </div>
          }
        </div>
      </div>
    </div>
  );
}


