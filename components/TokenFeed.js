'use client';

import { useState, useEffect, useCallback } from 'react';
import TokenCard from './TokenCard';
import TokenCardSkeleton from './TokenCardSkeleton';
import styles from './TokenFeed.module.css';

export default function TokenFeed({ initialStatus = 'new' }) {
  const [tokens, setTokens] = useState([]);
  const [status, setStatus] = useState(initialStatus);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState(null);

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
        status,
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
  }, [status]);

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

  const handleTabChange = (newStatus) => {
    if (newStatus !== status) {
      setStatus(newStatus);
      setOffset(0);
    }
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

  const tabs = [
    { id: 'new', label: 'New' },
    { id: 'kept', label: 'Kept' },
    { id: 'deleted', label: 'Deleted' },
  ];

  return (
    <div className={styles.feed}>
      <div className={styles.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`${styles.tab} ${status === tab.id ? styles.tabActive : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
          <button
            onClick={handleFetchNew}
            disabled={isRefreshing}
            className={styles.fetchBtn}
          >
            {isRefreshing ? 'Fetching...' : 'Fetch New'}
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
          {refreshMessage.text}
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
          {search ? `No tokens matching "${search}"` : `No ${status} tokens found`}
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
