/**
 * DEX detection and filtering utilities
 */

import { ALLOWED_DEX_IDS } from './constants';

/**
 * Check if a token is from an allowed DEX (bags, pump, bonk)
 * @param {object} token - Token object with dex_id, ca, and links
 * @returns {boolean} True if token is from an allowed DEX
 */
export function isAllowedDex(token) {
  const dexId = token.dex_id?.toLowerCase();
  const ca = token.ca?.toLowerCase();
  const links = token.links || [];

  // Check DEX ID
  if (dexId) {
    if (ALLOWED_DEX_IDS.pumpfun.includes(dexId)) return true;
    if (ALLOWED_DEX_IDS.bags.includes(dexId)) return true;
    if (ALLOWED_DEX_IDS.bonk.includes(dexId)) return true;
  }

  // Check CA suffix
  if (ca?.endsWith('pump')) return true;
  if (ca?.endsWith('bags')) return true;

  // Check links for bags.fm
  if (links.some(link => link.url?.toLowerCase().includes('bags.fm'))) return true;

  return false;
}

/**
 * Get the DEX type for badge display
 * @param {object} token - Token object with dex_id, ca, and links
 * @returns {string|null} DEX type ('pumpfun', 'bags', 'bonk') or null
 */
export function getDexType(token) {
  const dexId = token.dex_id?.toLowerCase();

  if (ALLOWED_DEX_IDS.pumpfun.includes(dexId)) return 'pumpfun';
  if (ALLOWED_DEX_IDS.bags.includes(dexId)) return 'bags';
  if (ALLOWED_DEX_IDS.bonk.includes(dexId)) return 'bonk';

  // Fallback: check CA suffix
  const ca = token.ca?.toLowerCase();
  if (ca?.endsWith('pump')) return 'pumpfun';
  if (ca?.endsWith('bags')) return 'bags';
  if (ca?.endsWith('bonk')) return 'bonk';

  // Fallback: check links
  if (token.links?.some(link => link.url?.toLowerCase().includes('bags.fm'))) {
    return 'bags';
  }
  if (token.links?.some(link =>
    link.url?.toLowerCase().includes('bonk.fun') ||
    link.url?.toLowerCase().includes('letsbonk')
  )) {
    return 'bonk';
  }

  return null;
}
