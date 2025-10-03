const { sb } = require('../lib/db.js');

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  
  const { type, token, timeframe = '24h' } = req.query;
  
  try {
    if (type === 'token-searches') {
      // Get search count for a specific token
      if (!token) {
        return res.status(400).json({ error: 'token parameter required' });
      }
      
      const timeframeHours = getTimeframeHours(timeframe);
      const sinceIso = new Date(Date.now() - timeframeHours * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await sb
        .from('token_searches')
        .select('*', { count: 'exact' })
        .eq('token_address', token)
        .gte('searched_at', sinceIso);
      
      if (error) throw error;
      
      return res.json({
        token_address: token,
        timeframe: timeframe,
        search_count: data.length,
        searches: data
      });
      
    } else if (type === 'trending') {
      // Get trending tokens by search count
      const timeframeHours = getTimeframeHours(timeframe);
      const sinceIso = new Date(Date.now() - timeframeHours * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await sb
        .from('token_searches')
        .select('token_address')
        .gte('searched_at', sinceIso);
      
      if (error) throw error;
      
      // Count searches per token
      const tokenCounts = {};
      data.forEach(search => {
        tokenCounts[search.token_address] = (tokenCounts[search.token_address] || 0) + 1;
      });
      
      // Sort by search count
      const trending = Object.entries(tokenCounts)
        .map(([token_address, count]) => ({ token_address, search_count: count }))
        .sort((a, b) => b.search_count - a.search_count)
        .slice(0, 50); // Top 50
      
      return res.json({
        timeframe: timeframe,
        trending_tokens: trending,
        total_searches: data.length,
        unique_tokens: trending.length
      });
      
    } else {
      return res.status(400).json({ 
        error: 'Invalid type. Use "token-searches" or "trending"' 
      });
    }
    
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ 
      error: 'Analytics query failed',
      details: error.message 
    });
  }
}

function getTimeframeHours(timeframe) {
  const timeframes = {
    '1h': 1,
    '6h': 6,
    '24h': 24,
    '7d': 24 * 7,
    '30d': 24 * 30
  };
  return timeframes[timeframe] || 24; // Default to 24h
}

module.exports = { handler };
