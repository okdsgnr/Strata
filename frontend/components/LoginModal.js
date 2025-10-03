"use client";
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LoginModal({ isOpen, onClose, onLogin }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });
      if (error) throw error;
      setEmailSent(true);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl p-6 max-w-md w-full">
        <div className="text-center mb-6">
          <h3 className="text-xl font-bold text-white mb-2">
            {emailSent ? 'Check Your Email' : 'Sign In'}
          </h3>
          <p className="text-gray-400 text-sm">
            {emailSent ? 'We sent you a magic link' : 'Enter your email to get started'}
          </p>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Email Magic Link Form */}
        {!emailSent ? (
          <form onSubmit={handleMagicLink} className="space-y-4 mb-6">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                className="w-full rounded-lg bg-night border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-brand text-night rounded-lg font-medium hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Magic Link'}
            </button>
          </form>
        ) : (
          <div className="text-center mb-6">
            <div className="bg-brand/10 border border-brand/30 rounded-lg p-4 mb-4">
              <p className="text-brand text-sm">
                We sent a magic link to <strong>{email}</strong>
              </p>
            </div>
            <button
              onClick={() => {
                setEmailSent(false);
                setEmail('');
              }}
              className="text-sm text-gray-400 hover:text-brand transition-colors"
            >
              Try a different email
            </button>
          </div>
        )}



        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
