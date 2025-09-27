require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

// CEX seed data - manually curated list (no file dependency)
const cexSeedData = {
  // Known CEX addresses can be added here manually
  // Example: "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9": "Binance Hot Wallet"
};

/**
 * Get CEX label for an address following the enrichment flow
 * @param {string} address - Solana wallet address
 * @returns {Promise<string|null>} - CEX label or null if not found
 */
async function getCexLabel(address) {
  try {
    // 1. Check Supabase cache first
    const cachedLabel = await getCachedCexLabel(address);
    if (cachedLabel) {
      return cachedLabel;
    }

    // 2. Check curated seed JSON
    const seedLabel = cexSeedData[address];
    if (seedLabel) {
      await upsertLabel(address, { type: 'CEX', value: seedLabel, source: 'Seed' });
      return seedLabel;
    }

    // 3. Call Helius Address Metadata API
    const heliusLabel = await getHeliusExchangeLabel(address);
    if (heliusLabel) {
      await upsertLabel(address, { type: 'CEX', value: heliusLabel, source: 'Helius' });
      return heliusLabel;
    }

    // 4. Fallback - no label found
    return null;
  } catch (error) {
    console.error(`Error getting CEX label for ${address}:`, error.message);
    return null;
  }
}

/**
 * Get cached CEX label from Supabase
 * @param {string} address - Solana wallet address
 * @returns {Promise<string|null>} - Cached CEX label or null
 */
async function getCachedCexLabel(address) {
  try {
    const { data, error } = await supabase
      .from('wallet_labels')
      .select('labels, last_updated')
      .eq('address', address)
      .single();

    if (error || !data) {
      return null;
    }

    // Check if labels array has a CEX label
    const labels = data.labels || [];
    const cexLabel = labels.find(label => label.type === 'CEX');
    
    if (cexLabel) {
      return cexLabel.value;
    }

    return null;
  } catch (error) {
    console.error(`Error checking cached CEX label for ${address}:`, error.message);
    return null;
  }
}

/**
 * Get exchange label from Helius Address Metadata API
 * @param {string} address - Solana wallet address
 * @returns {Promise<string|null>} - Exchange label or null if not found
 */
async function getHeliusExchangeLabel(address) {
  try {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      console.warn('HELIUS_API_KEY not found in environment variables');
      return null;
    }

    const url = `https://api.helius.xyz/v0/addresses/${address}?api-key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Address not found in Helius metadata
      }
      if (response.status === 429) {
        // Rate limited - wait and retry once
        console.log(`Rate limited for ${address}, waiting 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        const retryResponse = await fetch(url);
        if (!retryResponse.ok) {
          return null;
        }
        const retryData = await retryResponse.json();
        if (retryData?.entity?.category === 'exchange' && retryData?.entity?.name) {
          return `${retryData.entity.name} Hot Wallet`;
        }
        return null;
      }
      throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Check if entity category is "exchange"
    if (data?.entity?.category === 'exchange' && data?.entity?.name) {
      return `${data.entity.name} Hot Wallet`;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching Helius metadata for ${address}:`, error.message);
    return null;
  }
}

/**
 * Upsert a label into the wallet_labels table
 * @param {string} address - Solana wallet address
 * @param {Object} newLabel - Label object with type, value, and source
 * @returns {Promise<boolean>} - Success status
 */
async function upsertLabel(address, newLabel) {
  try {
    // Validate new label format
    if (!newLabel || typeof newLabel !== 'object' || 
        !newLabel.type || !newLabel.value || !newLabel.source) {
      throw new Error('Invalid label format. Must have type, value, and source properties.');
    }

    // Get existing labels
    const { data: existingData, error: fetchError } = await supabase
      .from('wallet_labels')
      .select('labels')
      .eq('address', address)
      .single();

    let labels = [];
    if (existingData && !fetchError) {
      labels = existingData.labels || [];
    }

    // Check if this exact label already exists
    const labelExists = labels.some(existingLabel => 
      existingLabel.type === newLabel.type && 
      existingLabel.value === newLabel.value && 
      existingLabel.source === newLabel.source
    );

    if (!labelExists) {
      labels.push(newLabel);
    }

    // Upsert the record
    const { error: upsertError } = await supabase
      .from('wallet_labels')
      .upsert({
        address: address,
        labels: labels,
        last_updated: new Date().toISOString()
      });

    if (upsertError) {
      throw new Error(`Failed to upsert label: ${upsertError.message}`);
    }

    return true;
  } catch (error) {
    console.error(`Error upserting label for ${address}:`, error.message);
    return false;
  }
}

/**
 * Get all labels for an address
 * @param {string} address - Solana wallet address
 * @returns {Promise<Array>} - Array of labels
 */
async function getAllLabels(address) {
  try {
    const { data, error } = await supabase
      .from('wallet_labels')
      .select('labels, last_updated')
      .eq('address', address)
      .single();

    if (error || !data) {
      return [];
    }

    return data.labels || [];
  } catch (error) {
    console.error(`Error getting all labels for ${address}:`, error.message);
    return [];
  }
}

/**
 * Get labels by type for an address
 * @param {string} address - Solana wallet address
 * @param {string} type - Label type (e.g., 'CEX', 'LEGACY')
 * @returns {Promise<Array>} - Array of labels of the specified type
 */
async function getLabelsByType(address, type) {
  try {
    const allLabels = await getAllLabels(address);
    return allLabels.filter(label => label.type === type);
  } catch (error) {
    console.error(`Error getting labels by type for ${address}:`, error.message);
    return [];
  }
}

/**
 * Remove a specific label from an address
 * @param {string} address - Solana wallet address
 * @param {Object} labelToRemove - Label object to remove
 * @returns {Promise<boolean>} - Success status
 */
async function removeLabel(address, labelToRemove) {
  try {
    const allLabels = await getAllLabels(address);
    
    // Filter out the label to remove
    const updatedLabels = allLabels.filter(label => 
      !(label.type === labelToRemove.type && 
        label.value === labelToRemove.value && 
        label.source === labelToRemove.source)
    );

    // Update the record
    const { error } = await supabase
      .from('wallet_labels')
      .upsert({
        address: address,
        labels: updatedLabels,
        last_updated: new Date().toISOString()
      });

    if (error) {
      throw new Error(`Failed to remove label: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error(`Error removing label for ${address}:`, error.message);
    return false;
  }
}

/**
 * Batch process addresses to get CEX labels
 * @param {Array<string>} addresses - Array of Solana wallet addresses
 * @param {number} concurrency - Maximum concurrent requests (default: 5)
 * @returns {Promise<Object>} - Object mapping addresses to their CEX labels
 */
async function batchGetCexLabels(addresses, concurrency = 5) {
  const results = {};
  
  const processAddress = async (address) => {
    const label = await getCexLabel(address);
    results[address] = label;
  };

  // Process in smaller chunks with delays to avoid rate limits
  for (let i = 0; i < addresses.length; i += concurrency) {
    const chunk = addresses.slice(i, i + concurrency);
    await Promise.all(chunk.map(processAddress));
    
    // Add delay between chunks to be respectful to APIs
    if (i + concurrency < addresses.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

/**
 * Get statistics about the wallet_labels table
 * @returns {Promise<Object>} - Statistics object
 */
async function getLabelsStats() {
  try {
    const { data, error } = await supabase
      .from('wallet_labels')
      .select('labels');

    if (error) {
      throw new Error(`Failed to get labels stats: ${error.message}`);
    }

    const stats = {
      total_addresses: data.length,
      total_labels: 0,
      labels_by_type: {},
      labels_by_source: {}
    };

    data.forEach(record => {
      const labels = record.labels || [];
      stats.total_labels += labels.length;

      labels.forEach(label => {
        // Count by type
        stats.labels_by_type[label.type] = (stats.labels_by_type[label.type] || 0) + 1;
        
        // Count by source
        stats.labels_by_source[label.source] = (stats.labels_by_source[label.source] || 0) + 1;
      });
    });

    return stats;
  } catch (error) {
    console.error('Error getting labels stats:', error.message);
    return null;
  }
}

module.exports = {
  getCexLabel,
  getCachedCexLabel,
  getHeliusExchangeLabel,
  upsertLabel,
  getAllLabels,
  getLabelsByType,
  removeLabel,
  batchGetCexLabels,
  getLabelsStats
};
