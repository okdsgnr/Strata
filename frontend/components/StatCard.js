"use client";

export default function StatCard({ label, value, className = "" }) {
  return (
    <div className={`bg-surface rounded-xl p-3 text-center ${className}`}>
      <div className="text-lg font-bold text-white font-satoshi">{value}</div>
      <div className="text-xs text-gray-400 font-ibmplex">{label}</div>
    </div>
  );
}
