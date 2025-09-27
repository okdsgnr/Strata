const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function insertSearch(token) {
  await sb.from('token_searches').insert({ token_address: token });
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
  const { data } = await sb
    .from('token_snapshots')
    .select('*')
    .eq('token_address', token)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function insertSnapshot(row) {
  const { data, error } = await sb.from('token_snapshots').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}

async function insertTopHolders(snapshotId, tokenAddress, holders) {
  if (!holders.length) return;
  
  // Filter holders: Top 50 OR Shark+ ($100k+)
  // Note: holders are already filtered to USD >= $100 in the audit route
  const filteredHolders = holders.filter((holder, index) => {
    const rank = index + 1;
    const isTop50 = rank <= 50;
    const isSharkPlus = holder.usd >= 100000; // $100k+
    return isTop50 || isSharkPlus;
  });

  if (!filteredHolders.length) {
    console.log(`No holders meet criteria: Top 50 OR $100k+ for token ${tokenAddress}`);
    return;
  }

  const rows = filteredHolders.map((h, i) => ({
    snapshot_id: snapshotId,
    token_address: tokenAddress,
    rank: i + 1,
    address: h.owner,
    amount_raw: h.raw.toString(),
    token_decimals: h.decimals,
    balance: h.ui,
    usd_value: h.usd,
    tier: h.tier || null
  }));
  
  await sb.from('token_top_holders').insert(rows);
}

async function upsertWhales(mint, holders) {
  const rows = holders.map(h => ({
    address: h.owner,
    last_token: mint,
    last_usd_value: h.usd
  }));
  
  for (const r of rows) {
    try {
      const { error } = await sb.rpc('upsert_whale_wallet', r);
      if (error) throw error;
    } catch (_e) {
      await sb.from('whale_wallets')
        .upsert({
          address: r.address,
          last_token: r.last_token,
          last_usd_value: r.last_usd_value,
          last_seen: new Date().toISOString()
        }, { onConflict: 'address' });
    }
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

module.exports = {
  sb,
  insertSearch,
  getLatestSnapshotInBucket,
  getRecentSnapshot,
  getPreviousSnapshot,
  insertSnapshot,
  insertTopHolders,
  upsertWhales,
  getWalletLabels,
  upsertWalletLabel
};
