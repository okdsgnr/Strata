"use client";

import Script from 'next/script';
import { createClient } from '@supabase/supabase-js';
import PricingCard from '../../components/PricingCard';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PLANS = {
  monthly: {
    price: '0.05',
    features: [
      'Unlimited token analysis',
      'Whale tracking & retention stats',
      'Token comparison tools',
      'Real-time holder analytics',
      'Priority support'
    ]
  },
  annual: {
    price: '0.3',
    features: [
      'Everything in Monthly',
      '50% discount vs monthly',
      'Early access to new features',
      'Advanced analytics dashboard',
      'Custom reports & exports'
    ]
  }
};

export default function Pricing() {
  const handleSubscribe = async (plan) => {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    
    // Open Helio checkout
    window.Helio.openCheckout('68d74139efd8182ed53e0d0b', {
      plan,
      metadata: {
        user_id: user?.id
      }
    });
  };
  
  return (
    <div className="min-h-screen bg-night py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Get unlimited access to Strata's powerful token analytics and whale tracking tools.
            All plans include our core features with no usage limits.
          </p>
        </div>
        
        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <PricingCard
            plan="Monthly"
            price={PLANS.monthly.price}
            period="month"
            features={PLANS.monthly.features}
            onClick={() => handleSubscribe('monthly')}
          />
          
          <PricingCard
            plan="Annual"
            price={PLANS.annual.price}
            period="year"
            features={PLANS.annual.features}
            onClick={() => handleSubscribe('annual')}
            recommended={true}
          />

          {/* Helio Script */}
          <Script
            src="https://js.hel.io/v1/checkout.js"
            strategy="lazyOnload"
          />
        </div>
        
        {/* FAQ */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">
            Frequently Asked Questions
          </h2>
          
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-medium text-white mb-2">
                What payment methods do you accept?
              </h3>
              <p className="text-gray-400">
                We accept SOL payments through any Solana wallet. Connect your wallet
                and complete the payment in just a few clicks.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-white mb-2">
                Can I cancel my subscription?
              </h3>
              <p className="text-gray-400">
                Yes, you can cancel your subscription at any time. Your access will
                continue until the end of your current billing period.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-white mb-2">
                What happens after I subscribe?
              </h3>
              <p className="text-gray-400">
                You'll get immediate access to all features. Your subscription is
                linked to your wallet address, so there's no need for a separate login.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
