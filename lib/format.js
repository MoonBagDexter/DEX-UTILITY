/**
 * Formatting utilities for numbers and dates
 */

/**
 * Format a number with K/M suffixes
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(num) {
  if (num == null) return '-';
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K';
  }
  return num.toFixed(2);
}

/**
 * Format a number as currency with K/M suffixes
 * @param {number} num - Number to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(num) {
  if (num == null) return '-';
  return '$' + formatNumber(num);
}

/**
 * Format a date as relative age (e.g., "5m ago", "2h ago", "3d ago")
 * @param {string|Date} dateStr - Date to format
 * @returns {string} Formatted age string
 */
export function formatAge(dateStr) {
  if (!dateStr) return '-';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
