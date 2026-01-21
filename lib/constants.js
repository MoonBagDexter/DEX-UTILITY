/**
 * Shared constants for the Dex Utility Finder application
 */

export const CLAUDE_MODEL = 'claude-3-5-haiku-20241022';
export const DEXSCREENER_API = 'https://api.dexscreener.com';
export const BATCH_SIZE_STATS = 30;
export const BATCH_SIZE_ANALYZE = 20;
export const RATE_LIMIT_MS = 60000;

// Allowed DEX identifiers for token filtering
export const ALLOWED_DEX_IDS = {
  pumpfun: ['pumpfun', 'pump'],
  bags: ['bags', 'letsbag'],
  bonk: ['launchlab', 'bonk', 'bonkfun', 'letsbonk']
};
