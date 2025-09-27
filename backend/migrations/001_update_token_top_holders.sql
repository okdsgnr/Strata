-- Migration: Update token_top_holders table for improved filtering and cross-token analysis
-- Date: 2024-01-XX
-- Purpose: Add token_address column, update indexes, and prepare for 30-day retention

-- 1. Clear existing data (you'll handle this manually)
-- TRUNCATE TABLE token_top_holders;

-- 2. Add token_address column
ALTER TABLE token_top_holders 
ADD COLUMN token_address TEXT NOT NULL;

-- 3. Add check constraint to ensure token_address is not empty
-- Note: Cannot use foreign key constraint because token_address in token_snapshots
-- is not unique (multiple snapshots per token). We rely on application logic
-- to ensure data integrity.
ALTER TABLE token_top_holders 
ADD CONSTRAINT chk_token_address_not_empty 
CHECK (token_address != '');

-- 4. Drop old indexes that will conflict with new structure
DROP INDEX IF EXISTS ux_token_top_holders_snapshot_rank;
DROP INDEX IF EXISTS ux_token_top_holders_snapshot_address;

-- 5. Create new composite indexes for better performance
CREATE UNIQUE INDEX ux_token_top_holders_snapshot_rank
  ON token_top_holders(snapshot_id, rank);

CREATE UNIQUE INDEX ux_token_top_holders_snapshot_address  
  ON token_top_holders(snapshot_id, address);

-- 6. Add new indexes for cross-token analysis and cleanup
CREATE INDEX idx_token_top_holders_token_address
  ON token_top_holders(token_address);

CREATE INDEX idx_token_top_holders_address_token
  ON token_top_holders(address, token_address);

CREATE INDEX idx_token_top_holders_usd_value
  ON token_top_holders(usd_value) WHERE usd_value >= 100000;

-- 7. Add index for cleanup job (30-day retention)
CREATE INDEX idx_token_top_holders_created_at
  ON token_top_holders(created_at);

-- 8. Create function for cleanup job
CREATE OR REPLACE FUNCTION cleanup_old_snapshots()
RETURNS void AS $$
BEGIN
  -- Delete token_top_holders older than 30 days
  DELETE FROM token_top_holders 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Delete token_snapshots older than 30 days
  DELETE FROM token_snapshots 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Log cleanup
  RAISE NOTICE 'Cleanup completed: removed snapshots and holders older than 30 days';
END;
$$ LANGUAGE plpgsql;

-- 9. Create function to detect cross-token whales
CREATE OR REPLACE FUNCTION get_cross_token_whales()
RETURNS TABLE(address TEXT, token_count BIGINT, total_usd_value NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tth.address,
    COUNT(DISTINCT tth.token_address) as token_count,
    SUM(tth.usd_value) as total_usd_value
  FROM token_top_holders tth
  WHERE tth.created_at >= NOW() - INTERVAL '30 days'
    AND tth.usd_value >= 100000  -- Shark+ level
  GROUP BY tth.address
  HAVING COUNT(DISTINCT tth.token_address) >= 3
  ORDER BY token_count DESC, total_usd_value DESC;
END;
$$ LANGUAGE plpgsql;
