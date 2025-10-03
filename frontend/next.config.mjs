/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  devIndicators: {
    buildActivity: false,
  },
  experimental: {
    nextScriptWorkers: false,
  },
  // Disable Next.js floating dev overlay/bubble
  // For Next 15+, the route info bubble can be disabled via this flag
  // If it still appears, ensure NEXT_TELEMETRY_DISABLED is set in .env.local
};

export default nextConfig;
