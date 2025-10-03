"use client";

export default function DeltaCard({ label, value, trend, className = "" }) {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return '↑';
      case 'down': return '↓';
      default: return '→';
    }
  };

  const getTrendColor = () => {
    switch (trend) {
      case 'up': return 'text-green-500';
      case 'down': return 'text-red-500';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className={`flex flex-col items-center bg-surface rounded-lg p-2 ${className}`}>
      <div className="text-xs text-gray-400 font-ibmplex">{label}</div>
      <div className={`text-sm font-bold font-satoshi ${getTrendColor()}`}>
        {value} {getTrendIcon()}
      </div>
    </div>
  );
}
