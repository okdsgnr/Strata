"use client";
import React from 'react';

export default function SearchInput({
  value,
  onChange,
  onPaste,
  placeholder = "Paste CA",
  disabled = false,
  className = ""
}) {
  return (
    <div className={`relative w-full ${className}`}>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-night border border-gray-700 px-3 h-12 pr-12 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-brand focus:outline-none font-mono disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onPaste}
        disabled={disabled}
        className="absolute top-0 right-0 h-12 w-12 flex items-center justify-center bg-gray-700 text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Paste from clipboard"
      >
        <img src="/clipboard.svg" alt="Paste" className="w-6 h-6 opacity-70" />
      </button>
    </div>
  );
}


