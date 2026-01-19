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
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);

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

  const fetchTokens = useCallback(async (newOffset = 0, append = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        status: initialStatus,
        limit: LIMIT.toString(),
        offset: newOffset.toString(),
        sortBy: 'pair_created_at',
        sortOrder: 'desc',
      });

      const res = await fetch(`/api/tokens?${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch tokens');
      }

      if (append) {
        setTokens(prev => [...prev, ...data.tokens]);
      } else {
        setTokens(data.tokens);
      }

      setTotal(data.total);
      setHasMore(data.hasMore);
      setOffset(newOffset);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [initialStatus]);

  useEffect(() => {
    fetchTokens(0, false);
  }, [fetchTokens]);

  const handleStatusChange = (ca, newStatus) => {
    // Remove the token from current view if status changed
    setTokens(prev => prev.filter(t => t.ca !== ca));
    setTotal(prev => prev - 1);
  };

  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      fetchTokens(offset + LIMIT, true);
    }
  };


  const handleExportKept = () => {
    // Get tokens to export (use filtered if search is active, otherwise all)
    const tokensToExport = search.trim() ? filteredTokens : tokens;

    if (tokensToExport.length === 0) {
      setRefreshMessage({ type: 'error', text: 'No tokens to export' });
      setTimeout(() => setRefreshMessage(null), 3000);
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

    setRefreshMessage({ type: 'success', text: `Exported ${tokensToExport.length} coins to ${filename}` });
    setTimeout(() => setRefreshMessage(null), 5000);
  };

  const handleFetchNew = async () => {
    setIsRefreshing(true);
    setRefreshMessage(null);

    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setRefreshMessage({ type: 'error', text: data.error });
      } else {
        setRefreshMessage({
          type: 'success',
          text: data.added > 0
            ? `Added ${data.added} new token${data.added !== 1 ? 's' : ''}`
            : data.message
        });
        // Reload the token list if new tokens were added
        if (data.added > 0) {
          fetchTokens(0, false);
        }
      }
    } catch (err) {
      setRefreshMessage({ type: 'error', text: err.message });
    } finally {
      setIsRefreshing(false);
      // Clear message after 5 seconds
      setTimeout(() => setRefreshMessage(null), 5000);
    }
  };

  const handleAutoAnalyze = async () => {
    setIsAnalyzing(true);
    setRefreshMessage(null);

    try {
      const res = await fetch('/api/auto-analyze', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setRefreshMessage({ type: 'error', text: data.error });
      } else {
        const { kept = 0, deleted = 0, skipped = 0, total = 0 } = data;
        const remaining = tokens.length - total;
        const remainingMsg = remaining > 0 ? ` (${remaining} remaining - click again)` : '';
        setRefreshMessage({
          type: 'success',
          text: `Analyzed ${total} tokens: ${kept} kept, ${deleted} deleted, ${skipped} skipped${remainingMsg}`
        });
        // Reload the token list to reflect changes
        if (kept > 0 || deleted > 0) {
          fetchTokens(0, false);
        }
      }
    } catch (err) {
      setRefreshMessage({ type: 'error', text: err.message });
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => setRefreshMessage(null), 5000);
    }
  };

  const handleRefreshData = async () => {
    setIsRefreshingData(true);
    setRefreshMessage(null);

    try {
      const res = await fetch('/api/refresh-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: initialStatus })
      });
      const data = await res.json();

      if (!res.ok) {
        setRefreshMessage({ type: 'error', text: data.error });
      } else {
        setRefreshMessage({
          type: 'success',
          text: `Updated ${data.updated} of ${data.total} tokens with latest DexScreener data`
        });
        // Reload the token list to show updated data
        if (data.updated > 0) {
          fetchTokens(0, false);
        }
      }
    } catch (err) {
      setRefreshMessage({ type: 'error', text: err.message });
    } finally {
      setIsRefreshingData(false);
      setTimeout(() => setRefreshMessage(null), 5000);
    }
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
              Export Kept
            </button>
          )}
          {initialStatus === 'new' && (
            <button
              onClick={handleAutoAnalyze}
              disabled={isAnalyzing || tokens.length === 0}
              className={`${styles.analyzeBtn} ${isAnalyzing ? styles.analyzing : ''}`}
            >
              {isAnalyzing ? '🤖 Analyzing...' : '🤖 Auto-Analyze All'}
            </button>
          )}
          <button
            onClick={handleRefreshData}
            disabled={isRefreshingData || tokens.length === 0}
            className={`${styles.refreshDataBtn} ${isRefreshingData ? styles.refreshingData : ''}`}
          >
            {isRefreshingData ? '🔄 Updating...' : '🔄 Refresh Data'}
          </button>
          <button
            onClick={handleFetchNew}
            disabled={isRefreshing}
            className={`${styles.fetchBtn} ${isRefreshing ? styles.fetching : ''}`}
          >
            {isRefreshing ? '⏳ Fetching from DexScreener...' : '🔍 Fetch New'}
          </button>
          <button
            onClick={() => fetchTokens(0, false)}
            disabled={isLoading}
            className={styles.refreshBtn}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {refreshMessage && (
        <div className={`${styles.message} ${styles[refreshMessage.type]}`}>
          {refreshMessage.type === 'success' ? '✅ ' : '❌ '}{refreshMessage.text}
        </div>
      )}

      {error && (
        <div className={styles.error}>
          {error}
          <button onClick={() => fetchTokens(0, false)} className={styles.retryBtn}>
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
