"use client";
import { useRouter } from 'next/navigation';

export default function SubscriptionPage() {
  const router = useRouter();

  const handleSubscribe = () => {
    router.push('/checkout');
  };

  const handleBackToSearch = () => {
    router.push('/');
  };

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

        {/* Subscription Prompt */}
        <div className="bg-surface  p-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Subscribe to Continue
          </h2>
          <p className="text-gray-400 mb-6">
            Get unlimited access to Strata's powerful token analytics and whale tracking tools.
          </p>
          
          <div className="space-y-4 mb-6">
            <div className="flex items-start space-x-3">
              <svg className="h-5 w-5 text-brand flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-gray-300">Unlimited token analysis</span>
            </div>
            <div className="flex items-start space-x-3">
              <svg className="h-5 w-5 text-brand flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-gray-300">Whale tracking & retention stats</span>
            </div>
            <div className="flex items-start space-x-3">
              <svg className="h-5 w-5 text-brand flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-gray-300">Token comparison tools</span>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleSubscribe}
              className="w-full py-3 px-4 bg-brand text-night  font-medium hover:bg-brand/90 transition-colors"
            >
              Subscribe Now
            </button>
            <button
              onClick={handleBackToSearch}
              className="w-full py-3 px-4 bg-gray-800 text-white  font-medium hover:bg-gray-700 transition-colors"
            >
              Back to Search
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
