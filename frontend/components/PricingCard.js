"use client";

export default function PricingCard({ plan, price, period, features, onClick, recommended }) {
  return (
    <div className={`bg-surface rounded-2xl p-6 ${recommended ? 'ring-2 ring-brand' : ''}`}>
      {recommended && (
        <div className="text-brand text-xs font-medium mb-4">★ RECOMMENDED</div>
      )}
      
      <h3 className="text-xl font-bold text-white mb-2">{plan}</h3>
      
      <div className="flex items-baseline mb-6">
        <span className="text-3xl font-bold text-white">{price}</span>
        <span className="text-gray-400 ml-2">SOL/{period}</span>
      </div>
      
      <ul className="space-y-3 mb-8">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <svg className="h-6 w-6 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="ml-3 text-gray-300">{feature}</span>
          </li>
        ))}
      </ul>
      
      <button
        onClick={onClick}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-colors
          ${recommended 
            ? 'bg-brand text-night hover:bg-brand/90' 
            : 'bg-gray-800 text-white hover:bg-gray-700'}`}
      >
        Subscribe Now
      </button>
    </div>
  );
}
