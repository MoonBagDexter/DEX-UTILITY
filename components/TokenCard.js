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
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getDexType = () => {
    const dexId = token.dex_id?.toLowerCase();

    if (dexId === 'pumpfun' || dexId === 'pump') return 'pumpfun';
    if (dexId === 'bags' || dexId === 'letsbag') return 'bags';

    // Fallback: check CA suffix
    const ca = token.ca?.toLowerCase();
    if (ca?.endsWith('pump')) return 'pumpfun';
    if (ca?.endsWith('bags')) return 'bags';

    // Fallback: check links for Bags
    if (token.links?.some(link =>
      link.url?.toLowerCase().includes('bags.fm')
    )) return 'bags';

    return null; // No badge (Raydium/unknown)
  };

  const dexType = getDexType();

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.imageContainer}>
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
          {dexType && (
            <div className={styles.dexBadge}>
              <img
                src={`/icons/${dexType}.png`}
                alt={dexType}
                className={styles.dexBadgeIcon}
              />
            </div>
          )}
        </div>
        <div className={styles.titleGroup}>
          <h3 className={styles.name}>{token.name || 'Unknown'}</h3>
          <span className={styles.ticker}>${token.ticker || 'UNKNOWN'}</span>
        </div>
        <span className={styles.age}>{formatAge(token.pair_created_at)}</span>
      </div>

      <p className={styles.description}>
        {token.description || '\u00A0'}
      </p>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>MCap</span>
          <span className={styles.statValue}>
            {formatNumber(token.stats?.marketCap)}
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
          {token.links.map((link, i) => {
            const url = link.url || '';
            const isCommunity = url.startsWith('https://x.com/i/communities');
            const isTweet = url.includes('/status/');
            const isSpace = url.startsWith('https://x.com/i/spaces');
            const isSearch = url.includes('x.com/search');
            const isArticle = url.includes('/article/');

            let displayText = link.type;
            if (isCommunity) {
              displayText = `${link.type} (Community)`;
            } else if (isSpace) {
              displayText = `${link.type} (Space)`;
            } else if (isSearch) {
              displayText = `${link.type} (Search)`;
            } else if (isArticle) {
              displayText = `${link.type} (Article)`;
            } else if (isTweet) {
              displayText = `${link.type} (Tweet)`;
            }

            return (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                {displayText}
              </a>
            );
          })}
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
        </div>
      )}

      <div className={styles.spacer} />

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

      {token.ca && (
        <a
          href={`https://axiom.trade/t/${token.ca}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.dexLink}
        >
          Open in Axiom
        </a>
      )}
    </div>
  );
}
