"use client";

import { useState, useEffect } from 'react';
import Script from 'next/script';

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const res = await fetch('/api/subscription/status');
        const data = await res.json();
        setSubscription(data);
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
        setError('Failed to load subscription status');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, []);

  const handleManageSubscription = () => {
    // Open Helio checkout/portal
    window.Helio.openCheckout('68d74139efd8182ed53e0d0b');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-night">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-surface rounded-2xl p-6">
          <h1 className="text-2xl font-bold text-white mb-8">Profile</h1>

          {error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-red-500">{error}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Subscription Status */}
              <div>
                <h2 className="text-lg font-medium text-white mb-4">Subscription</h2>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-400">Status</div>
                      <div className="text-white font-medium">
                        {subscription?.active ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm ${
                      subscription?.active 
                        ? 'bg-brand/20 text-brand' 
                        : 'bg-red-500/20 text-red-500'
                    }`}>
                      {subscription?.active ? 'Active' : 'Inactive'}
                    </div>
                  </div>

                  {subscription?.active && (
                    <div className="mt-4 border-t border-gray-700 pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-gray-400">Plan</div>
                          <div className="text-white font-medium capitalize">
                            {subscription.plan}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-400">Expires</div>
                          <div className="text-white font-medium">
                            {new Date(subscription.expiry_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <button
                      onClick={handleManageSubscription}
                      className="w-full py-2 px-4 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      {subscription?.active ? 'Manage Subscription' : 'Subscribe Now'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Usage Stats - Placeholder for future */}
              <div>
                <h2 className="text-lg font-medium text-white mb-4">Usage</h2>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-sm text-gray-400">Coming soon</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Helio Script */}
      <Script
        src="https://js.hel.io/v1/checkout.js"
        strategy="lazyOnload"
      />
    </div>
  );
}
