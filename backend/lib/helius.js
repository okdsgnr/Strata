const bs58 = require('bs58');

const rpc = process.env.HELIUS_RPC_URL;

async function rpcCall(body) {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'RPC error');
  return json.result;
}

async function getTokenSupplyDecimals(mint) {
  const result = await rpcCall({
    jsonrpc: '2.0', id: 1, method: 'getTokenSupply',
    params: [mint, { commitment: 'confirmed' }]
  });
  return result.value.decimals;
}

// Returns { amountRaw: BigInt, decimals: number, uiSupply: number }
async function getTokenSupply(mint) {
  try {
    const result = await rpcCall({
      jsonrpc: '2.0', id: 1, method: 'getTokenSupply',
      params: [mint, { commitment: 'confirmed' }]
    });
    
    if (!result || !result.value) {
      throw new Error('Invalid token supply response');
    }
    
    const amountRaw = BigInt(result.value.amount);
    const decimals = result.value.decimals;
    const uiSupply = Number(amountRaw) / 10 ** decimals;
    return { amountRaw, decimals, uiSupply };
  } catch (error) {
    if (error.message.includes('WrongSize')) {
      throw new Error(`Invalid token address: ${mint}. Token may not exist or be malformed.`);
    }
    throw error;
  }
}

function decodeU64LE(buf, offset) {
  // 8 bytes little-endian to BigInt
  let x = 0n;
  for (let i = 7; i >= 0; i--) x = (x << 8n) + BigInt(buf[offset + i]);
  return x;
}

function bs58encode(bytes) {
  return bs58.encode(bytes);
}

async function getAllTokenAccountsForMint(programId, mint) {
  try {
    // Try getProgramAccounts first
    const result = await rpcCall({
      jsonrpc: '2.0', id: 1, method: 'getProgramAccounts',
      params: [
        programId,
        {
          encoding: 'base64',
          commitment: 'confirmed',
          filters: [
            { memcmp: { offset: 0, bytes: mint } }
          ],
          dataSlice: { offset: 32, length: 40 }
        }
      ]
    });

    // Each account has account.data[0] base64
    // Slice is owner(32) + amount(8)
    return result.map(acc => {
      const b64 = acc.account.data[0];
      const buf = Buffer.from(b64, 'base64');
      const owner = bs58encode(buf.subarray(0, 32));
      const amount = decodeU64LE(buf, 32); // BigInt
      return { owner, amount };
    });
  } catch (error) {
    // If getProgramAccounts fails due to large dataset, try getProgramAccountsV2 with pagination
    if (error.message.includes('Too many accounts requested') || error.message.includes('Large number of pubkeys')) {
      console.log(`Token ${mint} has too many holders, using pagination...`);
      return await getAllTokenAccountsWithPagination(programId, mint);
    }
    throw error;
  }
}

async function getAllTokenAccountsWithPagination(programId, mint) {
  const allAccounts = [];
  let cursor = null;
  
  while (true) {
    const params = {
      encoding: 'base64',
      commitment: 'confirmed',
      filters: [
        { memcmp: { offset: 0, bytes: mint } }
      ],
      dataSlice: { offset: 32, length: 40 }
    };
    
    if (cursor) {
      params.page = { cursor };
    }
    
    // Add limit to get more accounts per page
    params.limit = 1000;
    
    console.log(`Calling getProgramAccountsV2 with params:`, JSON.stringify(params, null, 2));
    const result = await rpcCall({
      jsonrpc: '2.0', id: 1, method: 'getProgramAccountsV2',
      params: [programId, params]
    });
    console.log(`Received ${result.accounts?.length || 0} accounts, has next page: ${!!(result.page?.nextCursor)}`);
    
    // Process accounts
    const accounts = result.accounts.map(acc => {
      const b64 = acc.account.data[0];
      const buf = Buffer.from(b64, 'base64');
      const owner = bs58encode(buf.subarray(0, 32));
      const amount = decodeU64LE(buf, 32); // BigInt
      return { owner, amount };
    });
    
    allAccounts.push(...accounts);
    
    // Check if there are more pages
    if (result.page && result.page.nextCursor) {
      cursor = result.page.nextCursor;
    } else {
      break;
    }
    
    // Safety limit to prevent infinite loops
    if (allAccounts.length > 100000) {
      console.warn(`Reached safety limit of 100,000 accounts for token ${mint}`);
      break;
    }
  }
  
  console.log(`Fetched ${allAccounts.length} token accounts for ${mint} using pagination`);
  return allAccounts;
}

// Program IDs for SPL tokens
const PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP6vGx8gE3YgH1W4GQhS3dY9SxxWJ6t'
];

// Helper to get all holders for a mint using Helius getTokenAccounts DAS method
async function getAllHoldersForMint(mint) {
  let page = 1;
  const limit = 1000;
  const allAccounts = [];
  
  // Fetch all pages
  for (;;) {
    const result = await rpcCall({
      jsonrpc: '2.0',
      id: 'getTokenAccounts',
      method: 'getTokenAccounts',
      params: {
        mint: mint,
        page: page,
        limit: limit,
        displayOptions: {}
      }
    });
    
    const tokenAccounts = result?.token_accounts || [];
    
    if (tokenAccounts.length === 0) break;
    
    allAccounts.push(...tokenAccounts);
    page += 1;
    
    // Safety limit to prevent infinite loops
    if (page > 100) {
      console.warn(`Reached safety limit of 100 pages for token ${mint}`);
      break;
    }
    
    // Rate limit: pause between pages to avoid 429
    if (page > 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Aggregate by owner
  const byOwner = new Map();
  for (const account of allAccounts) {
    if (!account.amount || account.amount === '0') continue;
    try {
      const amount = BigInt(account.amount);
      const prev = byOwner.get(account.owner) || 0n;
      byOwner.set(account.owner, prev + amount);
    } catch (e) {
      console.warn(`Skipping invalid amount for account ${account.owner}: ${account.amount}`);
      continue;
    }
  }
  return byOwner;
}

module.exports = {
  getTokenSupplyDecimals,
  getTokenSupply,
  getAllTokenAccountsForMint,
  getAllHoldersForMint,
  PROGRAMS
};
