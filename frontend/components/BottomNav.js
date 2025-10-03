"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (href) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  const linkClass = (href) =>
    `${isActive(href) ? "opacity-100" : "opacity-50"} transition-opacity`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50" style={{ height: 'var(--bottom-nav-h)' }}>
      <div className="mx-auto max-w-sm h-full">
        <div className="bg-night/95 backdrop-blur-sm border-t border-gray-800 h-full">
          <div className="px-6 h-full flex items-center justify-center gap-12">
            <Link href="/" className={linkClass("/")}> 
              <img src="/holders.svg" alt="Holders" className="w-8 h-8" />
            </Link>
            <Link href="/overlap" className={linkClass("/overlap")}>
              <img src="/overlap.svg" alt="Overlap" className="w-8 h-8" />
            </Link>
            <Link href="/trending" className={linkClass("/trending")}>
              <img src="/analytics.svg" alt="Analytics" className="w-8 h-8" />
            </Link>
            <Link href="/settings" className={linkClass("/settings")}>
              <img src="/settings.svg" alt="Settings" className="w-8 h-8" />
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}


