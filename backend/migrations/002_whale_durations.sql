-- Create whale_durations table
CREATE TABLE IF NOT EXISTS whale_durations (
    id bigserial primary key,
    address text not null,
    token_address text not null,
    first_seen timestamp with time zone not null,
    last_seen timestamp with time zone not null,
    consecutive_days int not null default 0,
    balance numeric not null,
    usd_value numeric not null,
    snapshot_id bigint references token_snapshots(id) on delete cascade,
    created_at timestamp with time zone default now(),
    unique(token_address, address)
);

-- Create token_profiles table
CREATE TABLE IF NOT EXISTS token_profiles (
    token_address text primary key,
    created_at timestamp with time zone not null,
    last_activity timestamp with time zone,
    cache_window interval not null default interval '10 minutes'
);

-- Create indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_whale_durations_token_address
ON whale_durations (token_address, address);

CREATE INDEX IF NOT EXISTS idx_whale_durations_last_seen
ON whale_durations (token_address, last_seen);

CREATE INDEX IF NOT EXISTS idx_whale_durations_consecutive_days
ON whale_durations (token_address, consecutive_days);

-- Add index for token_profiles lookups
CREATE INDEX IF NOT EXISTS idx_token_profiles_last_activity
ON token_profiles (last_activity);
