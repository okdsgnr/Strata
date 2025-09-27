# Meridian

Backend service for Meridian - Token holder analytics and whale detection for Solana tokens.

## Features

- Token holder analysis and tracking
- Whale detection and monitoring
- Price tracking from multiple sources (Jupiter, Birdeye, DexScreener)
- Auto-labeling system for wallets
- Subscription-based access with Helio Pay integration

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with required variables:
```
# Database Configuration
DATABASE_URL=your_database_url

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE=your_service_role_key

# Helio Pay Configuration
HELIO_WEBHOOK_SECRET=your_webhook_secret

# Price API Configuration
JUP_PRICE_BASE=https://price.jup.ag/v4/price?ids=
BIRDEYE_PRICE_BASE=https://public-api.birdeye.so/public/price?address=
BIRDEYE_API_KEY=your_birdeye_key
DEXSCREENER_TOKEN_BASE=https://api.dexscreener.com/latest/dex/tokens/
```

## Development

Start the development server:
```bash
npm run dev
```

## Testing

Run all tests:
```bash
node scripts/test-all.js
```

The test suite covers:
- Route functionality
- Webhook signature verification
- Subscription validation
- Price fetching
- Database operations

## API Routes

### Health Check
- `GET /health` - Service health check

### Token Analysis
- `POST /api/audit` - Analyze token holders
- `POST /api/compare` - Compare holder overlap between tokens
- `POST /api/label` - Manage wallet labels

### Subscription
- `POST /api/webhooks/helio` - Helio Pay webhook endpoint
- `GET /api/subscription/status` - Check subscription status

## Architecture

- Express.js server with modular route handlers
- Supabase for auth and data storage
- Multiple price data sources with fallback
- Webhook-based subscription management
- Automated whale detection and labeling

## Contributing

1. Create a feature branch
2. Make changes
3. Run tests: `node scripts/test-all.js`
4. Submit PR
