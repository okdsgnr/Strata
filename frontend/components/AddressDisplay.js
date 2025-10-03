"use client";
import { useState } from "react";

export default function AddressDisplay({ address, short = true, showCopy = true, showExplorer = true }) {
  const [copied, setCopied] = useState(false);

  const displayAddress = short ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  if (!address) return null;

  return (
    <div className="flex items-center space-x-2">
      <span className="font-mono text-sm text-gray-900">
        {displayAddress}
      </span>
      
      {showCopy && (
        <button
          onClick={copyToClipboard}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            copied 
              ? 'bg-green-100 text-green-700' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title={copied ? 'Copied!' : 'Copy address'}
        >
          {copied ? '✓' : '📋'}
        </button>
      )}
      
      {showExplorer && (
        <a
          href={`https://solscan.io/account/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-600 text-xs"
          title="View on Solscan"
        >
          🔗
        </a>
      )}
    </div>
  );
}
