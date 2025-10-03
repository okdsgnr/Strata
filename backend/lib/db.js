const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function insertSearch(token, userId = null) {
  // Use the new aggregated search analytics system
  // For now, use a simple user identifier - in production you'd pass the actual user ID
  const userIdentifier = userId || 'anonymous';
  
  const { error } = await sb.rpc('upsert_token_search', {
    p_token: token,
    p_user_id: userIdentifier
  });
  
  if (error) {
    console.error('upsert_token_search error:', error);
    throw error;
  }
}

async function getLatestSnapshotInBucket(token, bucket) {
  const { data } = await sb
    .from('token_snapshots')
    .select('id')
    .eq('token_address', token)
    .eq('bucket_10m', bucket)
    .limit(1)
    .maybeSingle();
  return data;
}

// Time-based dedupe: find a snapshot captured within the last `windowSeconds`
async function getRecentSnapshot(token, windowSeconds = 600) {
  const sinceIso = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { data } = await sb
    .from('token_snapshots')
    .select('id, captured_at')
    .eq('token_address', token)
    .gte('captured_at', sinceIso)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function getPreviousSnapshot(token) {
  const { data, error } = await sb
    .from('token_snapshots')
    .select('*')
    .eq('token_address', token)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) {
    console.error('getPreviousSnapshot error:', error);
    throw error;
  }
  
  return data;
}

// Get the most recent snapshot strictly BEFORE a given timestamp
async function getPreviousSnapshotBefore(token, capturedAtIso) {
  const { data, error } = await sb
    .from('token_snapshots')
    .select('*')
    .eq('token_address', token)
    .lt('captured_at', capturedAtIso)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getPreviousSnapshotBefore error:', error);
    throw error;
  }
  return data;
}

async function insertSnapshot(row) {
  const { data, error } = await sb.from('token_snapshots').insert(row).select('id').single();
  if (error) {
    console.error('insertSnapshot error:', error);
    throw error;
  }
  return data.id;
}

async function updateSnapshotMeta(snapshotId, fields) {
  const { error } = await sb
    .from('token_snapshots')
    .update(fields)
    .eq('id', snapshotId);
  if (error) {
    console.error('updateSnapshotMeta error:', error);
  }
}

async function insertTopHolders(snapshotId, tokenAddress, holders) {
  // DEPRECATED: No longer storing in token_top_holders
  // This function is kept for backward compatibility but does nothing
  // Whale holdings are now managed via upsertWhales() with change-only storage
  console.log(`Skipping token_top_holders insert for ${tokenAddress} (${holders.length} holders) - using whale holdings system instead`);
}

async function upsertWhales(mint, holders) {
  // Only store whale wallets; write change-only raw balances per (token, wallet)
  // Expect holder objects with: owner, raw (BigInt-like stringable), decimals
  const nowIso = new Date().toISOString();
  for (const h of holders) {
    const wallet = h.owner;
    const amountRaw = h.raw.toString();
    const decimals = h.decimals;

    // Fetch current record
    const { data: cur, error: curErr } = await sb
      .from('whale_wallet_holdings_current')
      .select('amount_raw')
      .eq('token_address', mint)
      .eq('wallet_address', wallet)
      .maybeSingle();

    if (curErr) {
      console.error('whale current fetch error', curErr);
      continue;
    }

    if (!cur) {
      // First time seen: insert current and history
      await sb.from('whale_wallet_holdings_current').upsert({
        token_address: mint,
        wallet_address: wallet,
        amount_raw: amountRaw,
        token_decimals: decimals,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        last_change_at: nowIso
      });
      await sb.from('whale_wallet_holdings_history').upsert({
        token_address: mint,
        wallet_address: wallet,
        amount_raw: amountRaw,
        changed_at: nowIso
      });
      continue;
    }

    // If unchanged raw amount, update last_seen only
    if (cur.amount_raw === amountRaw) {
      await sb.from('whale_wallet_holdings_current')
        .update({ last_seen_at: nowIso })
        .eq('token_address', mint)
        .eq('wallet_address', wallet);
      continue;
    }

    // Changed: update current and append history
    await sb.from('whale_wallet_holdings_current')
      .update({ amount_raw: amountRaw, last_seen_at: nowIso, last_change_at: nowIso, token_decimals: decimals })
      .eq('token_address', mint)
      .eq('wallet_address', wallet);

    await sb.from('whale_wallet_holdings_history').upsert({
      token_address: mint,
      wallet_address: wallet,
      amount_raw: amountRaw,
      changed_at: nowIso
    });
  }
}

async function getWalletLabels(addresses) {
  const { data } = await sb
    .from('wallet_labels')
    .select('address, type, label')
    .in('address', addresses);
  return data || [];
}

async function upsertWalletLabel(address, type, label, expiresAt = null) {
  const { error } = await sb
    .from('wallet_labels')
    .upsert({
      address,
      type,
      label,
      expires_at: expiresAt
    });
  if (error) throw error;
}

// Get search analytics for a token
async function getSearchAnalytics(token) {
  const { data, error } = await sb
    .from('token_search_agg')
    .select('*')
    .eq('token_address', token)
    .single();
  
  if (error) {
    console.error('getSearchAnalytics error:', error);
    return null;
  }
  
  return data;
}

// Get whale holdings for a token (current state)
async function getWhaleHoldings(token) {
  const { data, error } = await sb
    .from('whale_wallet_holdings_current')
    .select('*')
    .eq('token_address', token)
    .order('amount_raw', { ascending: false });
  
  if (error) {
    console.error('getWhaleHoldings error:', error);
    return [];
  }
  
  return data || [];
}

// Get whale trend analysis (buying/selling over time window)
async function getWhaleTrends(token, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await sb
    .from('whale_wallet_holdings_history')
    .select('wallet_address, amount_raw, changed_at')
    .eq('token_address', token)
    .gte('changed_at', since)
    .order('wallet_address, changed_at');
  
  if (error) {
    console.error('getWhaleTrends error:', error);
    return [];
  }
  
  // Group by wallet and analyze trends
  const trends = {};
  (data || []).forEach(entry => {
    if (!trends[entry.wallet_address]) {
      trends[entry.wallet_address] = [];
    }
    trends[entry.wallet_address].push({
      amount: parseFloat(entry.amount_raw),
      timestamp: entry.changed_at
    });
  });
  
  // Calculate net change for each whale
  const whaleChanges = Object.entries(trends).map(([wallet, changes]) => {
    if (changes.length < 2) return { wallet, netChange: 0, trend: 'stable' };
    
    const first = changes[0].amount;
    const last = changes[changes.length - 1].amount;
    const netChange = last - first;
    
    return {
      wallet,
      netChange,
      trend: netChange > 0 ? 'buying' : netChange < 0 ? 'selling' : 'stable',
      changePercent: first > 0 ? (netChange / first) * 100 : 0
    };
  });
  
  return whaleChanges;
}

module.exports = {
  sb,
  insertSearch,
  getLatestSnapshotInBucket,
  getRecentSnapshot,
  getPreviousSnapshot,
  getPreviousSnapshotBefore,
  insertSnapshot,
  insertTopHolders,
  updateSnapshotMeta,
  upsertWhales,
  getWalletLabels,
  upsertWalletLabel,
  getSearchAnalytics,
  getWhaleHoldings,
  getWhaleTrends
};
