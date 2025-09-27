# Token Top Holders Infrastructure Update

## Overview
This update implements smart filtering for `token_top_holders` table to reduce storage bloat while preserving signal. Only stores high-value holders: Top 50 + Sharks/Whales ($100k+).

## Database Migration

### 1. Run the Migration
```bash
# Connect to your Supabase database and run:
psql -h your-db-host -U postgres -d postgres -f migrations/001_update_token_top_holders.sql
```

### 2. Verify Migration
```sql
-- Check that token_address column exists
\d token_top_holders

-- Verify indexes were created
\di token_top_holders*

-- Test the cleanup function
SELECT cleanup_old_snapshots();

-- Test cross-token whale detection
SELECT * FROM get_cross_token_whales() LIMIT 5;
```

## Backend Updates

### 1. Update Dependencies
The backend code has been updated to:
- Filter holders before insertion (Top 50 OR $100k+)
- Include `token_address` in all inserts
- Auto-generate labels on every snapshot
- Support cross-token whale detection

### 2. Test the Changes
```bash
# Test with a token that has many holders
curl -X POST http://localhost:4000/api/audit \
  -H "Content-Type: application/json" \
  -d '{"mint":"5UUH9RTDiSpq6HKS6bp4NdU9PNJpXRXuiw6ShBTBhgH2"}'

# Check that fewer rows are inserted
# Before: ~48k holders → After: ~hundreds of filtered holders
```

## Cleanup Job Setup

### 1. Manual Test
```bash
# Test the cleanup script
node scripts/cleanup.js
```

### 2. Set Up Cron Job
```bash
# Add to crontab (runs daily at 2 AM)
crontab -e

# Add this line:
0 2 * * * /usr/bin/node /path/to/meridian/backend/scripts/cleanup.js >> /var/log/meridian-cleanup.log 2>&1
```

### 3. Monitor Cleanup
```bash
# Check cleanup logs
tail -f /var/log/meridian-cleanup.log

# Verify data retention
psql -c "SELECT COUNT(*) FROM token_snapshots WHERE created_at > NOW() - INTERVAL '30 days';"
```

## Expected Results

### Storage Reduction
- **Before**: ~48k rows per snapshot for large tokens
- **After**: ~hundreds of rows per snapshot (Top 50 + Sharks/Whales)
- **Reduction**: ~95% storage savings

### Auto-Labeling
- **Top 10 Holders**: Automatically labeled per token
- **Whales/Sharks**: Labeled with token context
- **Cross-Token Whales**: Detected across 3+ tokens
- **Expiration**: Labels expire after 30 days

### Performance
- **Faster Queries**: Fewer rows to scan
- **Better Indexes**: Optimized for common queries
- **Cleaner Data**: Only signal, no noise

## Monitoring

### 1. Row Count Monitoring
```sql
-- Check current row counts
SELECT 
  COUNT(*) as total_holders,
  COUNT(DISTINCT token_address) as tokens,
  AVG(usd_value) as avg_usd_value
FROM token_top_holders 
WHERE created_at > NOW() - INTERVAL '7 days';
```

### 2. Label Generation
```sql
-- Check auto-generated labels
SELECT 
  type,
  COUNT(*) as count
FROM wallet_labels 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY type;
```

### 3. Cross-Token Whales
```sql
-- Check cross-token whale detection
SELECT * FROM get_cross_token_whales() LIMIT 10;
```

## Rollback Plan

If issues arise, you can rollback by:

1. **Revert Backend Code**: Remove filtering logic in `insertTopHolders`
2. **Database**: Drop the new indexes and column (if needed)
3. **Cleanup**: Disable the cron job

The system will continue working with the old logic while you debug.

## Success Metrics

- ✅ **Storage**: 95% reduction in `token_top_holders` rows
- ✅ **Performance**: Faster queries on large datasets  
- ✅ **Labels**: Auto-generated labels for top holders
- ✅ **Cleanup**: 30-day retention working properly
- ✅ **Cross-Token**: Whales detected across multiple tokens

This infrastructure update makes your system much more scalable while preserving all the important signal for analysis and labeling.
