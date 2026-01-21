/**
 * Helius API utilities for token metadata fallback
 */

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

/**
 * Fetch token metadata from Helius RPC as fallback
 * @param {string} tokenAddress - Solana token address
 * @returns {Promise<object|null>} Token metadata or null
 */
export async function fetchHeliusMetadata(tokenAddress) {
  if (!HELIUS_API_KEY) return null;

  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'getAsset',
        params: { id: tokenAddress }
      })
    });

    if (!res.ok) return null;

    const data = await res.json();
    const result = data.result;

    if (!result) return null;

    const metadata = result.content?.metadata || {};
    const links = result.content?.links || {};

    return {
      name: metadata.name || null,
      symbol: metadata.symbol || null,
      description: metadata.description || null,
      image: links.image || result.content?.files?.[0]?.uri || null,
      externalUrl: links.external_url || null
    };
  } catch (e) {
    console.error('Helius API error:', e.message);
    return null;
  }
}
