-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id bigserial primary key,
    user_id text not null,
    helio_tx_id text,
    plan text not null check (plan in ('monthly', 'annual')),
    status text not null check (status in ('active', 'canceled', 'expired')),
    started_at timestamp with time zone not null default now(),
    expires_at timestamp with time zone not null,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now(),
    unique(user_id)
);

-- Add index for fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions (user_id);

-- Add index for expiration checks
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires_at ON user_subscriptions (expires_at);

-- Add index for Helio transaction ID lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_helio_tx_id ON user_subscriptions (helio_tx_id);
