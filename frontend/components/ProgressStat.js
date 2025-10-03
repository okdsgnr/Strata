"use client";

export default function ProgressStat({ label, value, percent, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-white font-satoshi">{label}</span>
        <span className="text-sm font-bold text-brand font-satoshi">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
        <div 
          className="h-full bg-brand rounded-full transition-all duration-300"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
