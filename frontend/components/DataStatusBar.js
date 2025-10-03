"use client";
import { useState, useEffect } from "react";

export default function DataStatusBar({ 
  dataAge, 
  isLiveFetching, 
  hasSubscription, 
  onRefresh 
}) {
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    if (!dataAge) return;

    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [dataAge]);

  if (!dataAge) return null;

  const getStatusColor = () => {
    if (isLiveFetching) return "bg-blue-500/20 border-blue-500/30 text-blue-400";
    if (dataAge.minutes <= 10) return "bg-green-500/20 border-green-500/30 text-green-400";
    if (dataAge.hours <= 1) return "bg-yellow-500/20 border-yellow-500/30 text-yellow-400";
    return "bg-orange-500/20 border-orange-500/30 text-orange-400";
  };

  const getStatusIcon = () => {
    if (isLiveFetching) return "🔄";
    if (dataAge.minutes <= 10) return "✅";
    if (dataAge.hours <= 1) return "⚠️";
    return "📊";
  };

  const getStatusText = () => {
    if (isLiveFetching) {
      return "Fetching live data...";
    }
    
    if (hasSubscription) {
      return `Data from ${dataAge.formatted}`;
    } else {
      return `Data from ${dataAge.formatted} • Subscribe for live data`;
    }
  };

  return (
    <div className={`fixed top-16 left-4 right-4 z-40 ${getStatusColor()} border  px-3 py-2 text-sm font-medium`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-lg">{getStatusIcon()}</span>
          <span>{getStatusText()}</span>
        </div>
        
        {hasSubscription && !isLiveFetching && (
          <button
            onClick={onRefresh}
            className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded transition-colors"
          >
            Refresh
          </button>
        )}
      </div>
      
      {isLiveFetching && (
        <div className="mt-2">
          <div className="w-full bg-white/10  h-1">
            <div className="bg-blue-400 h-1  animate-pulse" style={{ width: '60%' }}></div>
          </div>
        </div>
      )}
    </div>
  );
}
