/**
 * DexScreener API utilities
 */

import { DEXSCREENER_API, BATCH_SIZE_STATS } from './constants';

/**
 * Fetch latest token profiles from DexScreener
 * @returns {Promise<Array>} Array of token profiles
 */
export async function fetchTokenProfiles() {
  const res = await fetch(`${DEXSCREENER_API}/token-profiles/latest/v1`);
  if (!res.ok) {
    throw new Error(`DexScreener API error: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch token stats for multiple addresses (batched)
 * @param {string[]} addresses - Array of token addresses
 * @returns {Promise<Map>} Map of address to stats
 */
export async function fetchBatchTokenStats(addresses) {
  const tokenStats = new Map();

  for (let i = 0; i < addresses.length; i += BATCH_SIZE_STATS) {
    const batch = addresses.slice(i, i + BATCH_SIZE_STATS);
    const addressList = batch.join(',');

    try {
      const res = await fetch(`${DEXSCREENER_API}/tokens/v1/solana/${addressList}`);
      if (res.ok) {
        const data = await res.json();
        const pairs = Array.isArray(data) ? data : (data.pairs || []);

        for (const pair of pairs) {
          if (!tokenStats.has(pair.baseToken.address)) {
            tokenStats.set(pair.baseToken.address, {
              priceUsd: pair.priceUsd,
              marketCap: pair.marketCap || pair.fdv,
              volume24h: pair.volume?.h24,
              liquidity: pair.liquidity?.usd,
              pairCreatedAt: pair.pairCreatedAt,
              dexId: pair.dexId,
              name: pair.baseToken.name,
              symbol: pair.baseToken.symbol
            });
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch stats for batch:', e.message);
    }
  }

  return tokenStats;
}

/**
 * Fetch stats for a single token
 * @param {string} address - Token address
 * @returns {Promise<object|null>} Token stats or null
 */
export async function fetchTokenStats(address) {
  const res = await fetch(`${DEXSCREENER_API}/tokens/v1/solana/${address}`);

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  const pairs = Array.isArray(data) ? data : (data.pairs || []);

  if (pairs.length === 0) {
    return null;
  }

  const pair = pairs.find(p =>
    p.baseToken?.address?.toLowerCase() === address.toLowerCase()
  ) || pairs[0];

  return {
    priceUsd: pair.priceUsd || null,
    marketCap: pair.marketCap || pair.fdv || null,
    volume24h: pair.volume?.h24 || null,
    liquidity: pair.liquidity?.usd || null,
    pairCreatedAt: pair.pairCreatedAt || null
  };
}

/**
 * Extract links from DexScreener token profile
 * @param {object} token - DexScreener token profile
 * @returns {Array} Array of link objects
 */
export function extractLinks(token) {
  const links = [];

  if (token.website) {
    links.push({ type: 'website', url: token.website });
  }
  if (token.websites && Array.isArray(token.websites)) {
    for (const site of token.websites) {
      links.push({ type: 'website', url: typeof site === 'string' ? site : site.url });
    }
  }
  if (token.links) {
    for (const link of token.links) {
      if (link.type && link.url) {
        links.push({ type: link.type, url: link.url });
      } else if (link.label && link.url) {
        links.push({ type: link.label, url: link.url });
      } else if (typeof link === 'string') {
        links.push({ type: 'link', url: link });
      }
    }
  }
  if (token.socials) {
    for (const social of token.socials) {
      if (social.type && social.url) {
        links.push({ type: social.type, url: social.url });
      }
    }
  }

  return links;
}

/**
 * Extract token name from description (first line or first sentence)
 * @param {string} description - Token description
 * @returns {string} Extracted name or 'Unknown'
 */
export function extractName(description) {
  if (!description) return 'Unknown';
  const firstLine = description.split('\n')[0];
  const firstSentence = firstLine.split('.')[0];
  return firstSentence.slice(0, 100) || 'Unknown';
}
