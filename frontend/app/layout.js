import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import BottomNav from "../components/BottomNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Strata - Solana Token Analytics",
  description: "Analyze Solana token communities with advanced holder distribution insights and overlap analysis",
  keywords: ["Solana", "token", "analytics", "blockchain", "crypto", "holders", "analysis"],
  authors: [{ name: "Strata Team" }],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <main className="flex-1">
          <div className="px-6">
            {children}
          </div>
          <div style={{ height: 'var(--bottom-nav-h)' }}></div>
        </main>
        <BottomNav />
        {/* Helio Script - Load globally */}
        <Script
          src="https://embed.hel.io/assets/index-v1.js"
          type="module"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
