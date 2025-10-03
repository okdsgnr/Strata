"use client";
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AuthPrompt({ title = "Sign In" }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const isValid = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const sendMagicLink = async () => {
    try {
      setError("");
      setSent(false);
      if (!isValid) {
        setError("Enter a valid email");
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

  return (
    <div className="min-h-[calc(100vh-72px)] bg-night flex items-center justify-center">
      <div className="bg-surface py-6 max-w-md w-full space-y-4">
        <h1 className="text-xl font-semibold text-white text-center">{title}</h1>
        {error && <div className="text-sm text-red-400 text-center">{error}</div>}
        <p className="text-sm text-center text-gray-400">Enter your email to log in or sign up</p>
        <div className="relative">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full h-12 pr-12 bg-night border border-gray-700 px-3 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={!isValid}
            className={`absolute top-0 right-0 h-12 w-12 flex items-center justify-center font-bold ${
              !isValid ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-white text-black hover:bg-gray-200'
            }`}
            title="Send magic link"
          >
            →
          </button>
        </div>
        {sent && (
          <div className="text-xs text-green-400 text-center">Check your email for the sign-in link.</div>
        )}
      </div>
    </div>
  );
}


