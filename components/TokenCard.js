'use client';

import { useState } from 'react';
import Image from 'next/image';
import styles from './TokenCard.module.css';

export default function TokenCard({ token, onStatusChange }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token),
      });
      const data = await res.json();
      if (res.ok) {
        setAnalysis(data.analysis);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    setIsUpdating(true);
    try {
      const res = await fetch('/api/tokens', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ca: token.ca, status: newStatus }),
      });
      if (res.ok) {
        onStatusChange?.(token.ca, newStatus);
      }
    } catch (error) {
      console.error('Status update failed:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const formatNumber = (num) => {
    if (!num) return '-';
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatAge = (dateStr) => {
    if (!dateStr) return '-';
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        {token.image_url ? (
          <Image
            src={token.image_url}
            alt={token.name || 'Token'}
            width={48}
            height={48}
            className={styles.image}
            unoptimized
          />
        ) : (
          <div className={styles.imagePlaceholder}>
            {token.ticker?.charAt(0) || '?'}
          </div>
        )}
        <div className={styles.titleGroup}>
          <h3 className={styles.name}>{token.name || 'Unknown'}</h3>
          <span className={styles.ticker}>${token.ticker || 'UNKNOWN'}</span>
        </div>
        <span className={styles.age}>{formatAge(token.pair_created_at)}</span>
      </div>

      {token.description && (
        <p className={styles.description}>{token.description}</p>
      )}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>MCap</span>
          <span className={styles.statValue}>
            {formatNumber(token.stats?.marketCap)}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Liq</span>
          <span className={styles.statValue}>
            {formatNumber(token.stats?.liquidity)}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Vol 24h</span>
          <span className={styles.statValue}>
            {formatNumber(token.stats?.volume24h)}
          </span>
        </div>
      </div>

      {token.links && token.links.length > 0 && (
        <div className={styles.links}>
          {token.links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              {link.type}
            </a>
          ))}
        </div>
      )}

      {analysis && (
        <div
          className={`${styles.analysis} ${
            analysis.classification === 'utility'
              ? styles.analysisUtility
              : styles.analysisMeme
          }`}
        >
          <div className={styles.analysisHeader}>
            <span className={styles.classification}>
              {analysis.classification?.toUpperCase()}
            </span>
            <span className={styles.confidence}>
              {analysis.confidence}% confident
            </span>
          </div>
          <p className={styles.reasoning}>{analysis.reasoning}</p>
          {analysis.redFlags?.length > 0 && (
            <div className={styles.redFlags}>
              {analysis.redFlags.map((flag, i) => (
                <span key={i} className={styles.redFlag}>
                  {flag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.actions}>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className={styles.analyzeBtn}
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze'}
        </button>
        <div className={styles.actionGroup}>
          <button
            onClick={() => handleStatusChange('kept')}
            disabled={isUpdating}
            className={styles.keepBtn}
          >
            Keep
          </button>
          <button
            onClick={() => handleStatusChange('deleted')}
            disabled={isUpdating}
            className={styles.deleteBtn}
          >
            Delete
          </button>
        </div>
      </div>

      {token.dex_id && (
        <a
          href={`https://dexscreener.com/solana/${token.dex_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.dexLink}
        >
          View on DexScreener
        </a>
      )}
    </div>
  );
}
