"use client";
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function CheckoutPage() {
  const router = useRouter();

  const handleBackToSearch = () => {
    router.push('/');
  };

  // Initialize Helio checkout when component mounts
  useEffect(() => {
    if (typeof window !== 'undefined' && window.helioCheckout) {
      const container = document.getElementById('helio-checkout-container');
      if (container) {
        window.helioCheckout(container, {
          paylinkId: '68d74139efd8182ed53e0d0b',
          display: 'new-tab',
          theme: {
            themeMode: 'dark'
          }
        });
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-night">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-night/95 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={handleBackToSearch} className="hover:opacity-80 transition-opacity">
            <img src="/strata.svg" alt="Strata" className="w-8 h-8" />
          </button>
          <div className="flex-1"></div>
          <button className="flex flex-col space-y-2 p-1 hover:opacity-80 transition-opacity">
            <div className="w-5 h-0.5 bg-white"></div>
            <div className="w-5 h-0.5 bg-white"></div>
          </button>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-20 space-y-4">

        {/* Payment Redirect */}
        <div className="bg-surface  p-6 text-center">
          <h2 className="text-xl font-bold text-white mb-4">
            Redirecting to Payment...
          </h2>
          <p className="text-gray-400 mb-6">
            You'll be redirected to Helio's secure payment page to complete your subscription.
          </p>
          <div className="w-8 h-8 border-2 border-brand border-t-transparent  animate-spin mx-auto mb-4"></div>
          <div id="helio-checkout-container"></div>
        </div>
      </div>
    </div>
  );
}
