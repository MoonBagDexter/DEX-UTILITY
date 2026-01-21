'use client';

import { useState, useEffect, useCallback } from 'react';
import TokenCard from './TokenCard';
import TokenCardSkeleton from './TokenCardSkeleton';
import styles from './TokenFeed.module.css';

export default function TokenFeed({ initialStatus = 'new' }) {
  const [tokens, setTokens] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(null);

  const LIMIT = 500; // Load all tokens at once

  // Filter tokens by search query (name, ticker, description, links)
  const filteredTokens = tokens.filter(token => {
    if (!search.trim()) return true;
    const query = search.toLowerCase().trim();

    const name = (token.name || '').toLowerCase();
    const ticker = (token.ticker || '').toLowerCase();
    const description = (token.description || '').toLowerCase();
    const links = (token.links || [])
      .map(l => (l.url || '').toLowerCase())
      .join(' ');

    return name.includes(query) ||
           ticker.includes(query) ||
           description.includes(query) ||
           links.includes(query);
  });

  const fetchTokens = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        status: initialStatus,
        limit: LIMIT.toString(),
        offset: '0',
        sortBy: 'created_at',
        sortOrder: 'desc',
        _t: Date.now().toString(), // Cache buster
      });

      const res = await fetch(`/api/tokens?${params}`, { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch tokens');
      }

      setTokens(data.tokens);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [initialStatus]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleStatusChange = (ca, newStatus) => {
    // Remove the token from current view if status changed
    setTokens(prev => prev.filter(t => t.ca !== ca));
    setTotal(prev => prev - 1);
  };

  const handleExportKept = () => {
    // Get tokens to export (use filtered if search is active, otherwise all)
    const tokensToExport = search.trim() ? filteredTokens : tokens;

    if (tokensToExport.length === 0) {
      setMessage({ type: 'error', text: 'No tokens to export' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    // Generate timestamp for filename
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    const filename = `kept_coins_${timestamp}.txt`;

    // Build file content
    let content = `Kept Coins Export\n`;
    content += `Exported: ${now.toLocaleString()}\n`;
    content += `Total: ${tokensToExport.length} coins\n`;
    content += `${'='.repeat(60)}\n\n`;

    tokensToExport.forEach((token, index) => {
      content += `${index + 1}. ${token.name || 'Unknown'} (${token.ticker || 'N/A'})\n`;
      content += `${'-'.repeat(40)}\n`;

      // Contract Address
      content += `CA: ${token.ca}\n`;

      // Description
      if (token.description) {
        content += `Description: ${token.description}\n`;
      }

      // Websites
      const websites = (token.links || []).filter(l =>
        l.type === 'website' || l.type === 'Website'
      );
      if (websites.length > 0) {
        content += `Websites:\n`;
        websites.forEach(w => content += `  - ${w.url}\n`);
      }

      // X/Twitter links
      const xLinks = (token.links || []).filter(l =>
        l.type?.toLowerCase() === 'twitter' ||
        l.type?.toLowerCase() === 'x' ||
        (l.url && l.url.includes('x.com')) ||
        (l.url && l.url.includes('twitter.com'))
      );
      if (xLinks.length > 0) {
        content += `X Links:\n`;
        xLinks.forEach(x => content += `  - ${x.url}\n`);
      }

      // Other links
      const otherLinks = (token.links || []).filter(l => {
        const type = l.type?.toLowerCase() || '';
        const url = l.url || '';
        const isWebsite = type === 'website';
        const isX = type === 'twitter' || type === 'x' ||
                    url.includes('x.com') || url.includes('twitter.com');
        return !isWebsite && !isX;
      });
      if (otherLinks.length > 0) {
        content += `Other Links:\n`;
        otherLinks.forEach(l => content += `  - [${l.type || 'link'}] ${l.url}\n`);
      }

      content += `\n`;
    });

    // Create and download file
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setMessage({ type: 'success', text: `Exported ${tokensToExport.length} coins to ${filename}` });
    setTimeout(() => setMessage(null), 5000);
  };

  return (
    <div className={styles.feed}>
      <div className={styles.searchWrapper}>
        <input
          type="text"
          placeholder="Search name, ticker, description, links..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.stats}>
        <span className={styles.count}>
          {search ? `${filteredTokens.length} of ${total}` : total} {total === 1 ? 'token' : 'tokens'}
        </span>
        <div className={styles.buttons}>
          {initialStatus === 'kept' && (
            <button
              onClick={handleExportKept}
              disabled={tokens.length === 0}
              className={styles.exportBtn}
            >
              Export
            </button>
          )}
          <button
            onClick={() => fetchTokens()}
            disabled={isLoading}
            className={styles.refreshBtn}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.type === 'success' ? '✓ ' : '✗ '}{message.text}
        </div>
      )}

      {error && (
        <div className={styles.error}>
          {error}
          <button onClick={() => fetchTokens()} className={styles.retryBtn}>
            Retry
          </button>
        </div>
      )}

      {!isLoading && filteredTokens.length === 0 && !error && (
        <div className={styles.empty}>
          {search ? `No tokens matching "${search}"` : `No ${initialStatus} tokens found`}
        </div>
      )}

      <div className={styles.grid}>
        {isLoading && tokens.length === 0 && (
          <>
            {[...Array(6)].map((_, i) => (
              <TokenCardSkeleton key={i} />
            ))}
          </>
        )}
        {filteredTokens.map(token => (
          <TokenCard
            key={token.ca}
            token={token}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>

    </div>
  );
}
