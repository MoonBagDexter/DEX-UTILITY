'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Nav.module.css';

export default function Nav() {
  const pathname = usePathname();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState(null);

  const links = [
    { href: '/', label: 'New' },
    { href: '/kept', label: 'Kept' },
    { href: '/deleted', label: 'Deleted' },
  ];

  const handleFetchAndAnalyze = async () => {
    setIsRunning(true);
    setMessage(null);

    try {
      // Step 1: Fetch new tokens from DexScreener
      setMessage({ type: 'info', text: 'Fetching new tokens...' });
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error });
        setIsRunning(false);
        setTimeout(() => setMessage(null), 5000);
        return;
      }

      const added = data.added || 0;

      // Step 2: Auto-analyze all new tokens in batches
      setMessage({ type: 'info', text: added > 0 ? `Added ${added} tokens. Analyzing...` : 'Analyzing tokens...' });

      let totalKept = 0, totalDeleted = 0, totalProcessed = 0;

      while (true) {
        const analyzeRes = await fetch('/api/auto-analyze', { method: 'POST' });
        const analyzeData = await analyzeRes.json();

        if (!analyzeRes.ok || !analyzeData.total || analyzeData.total === 0) {
          break;
        }

        totalKept += analyzeData.kept || 0;
        totalDeleted += analyzeData.deleted || 0;
        totalProcessed += analyzeData.total || 0;

        setMessage({
          type: 'info',
          text: `Analyzing... ${totalProcessed} done (${totalKept} kept, ${totalDeleted} deleted)`
        });
      }

      if (totalProcessed === 0 && added === 0) {
        setMessage({ type: 'success', text: 'No new tokens to fetch or analyze' });
        setIsRunning(false);
        setTimeout(() => setMessage(null), 5000);
        return;
      }

      const parts = [];
      if (added > 0) parts.push(`fetched ${added}`);
      if (totalProcessed > 0) parts.push(`analyzed ${totalProcessed} (${totalKept} kept, ${totalDeleted} deleted)`);

      setMessage({
        type: 'success',
        text: `Done! ${parts.join(', ')}`
      });

      // Reload the page to show updated data
      setTimeout(() => window.location.reload(), 1500);

    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      setIsRunning(false);
      setTimeout(() => setMessage(null), 8000);
    }
  };

  return (
    <nav className={styles.nav}>
      <div className={`container ${styles.navInner}`}>
        <Link href="/" className={styles.logo}>
          Util Finder
        </Link>
        <div className={styles.rightSection}>
          <div className={styles.links}>
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.link} ${pathname === link.href ? styles.linkActive : ''}`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <button
            onClick={handleFetchAndAnalyze}
            disabled={isRunning}
            className={`${styles.fetchBtn} ${isRunning ? styles.running : ''}`}
          >
            {isRunning ? 'Running...' : 'Fetch & Analyze'}
          </button>
        </div>
      </div>
      {message && (
        <div className={`${styles.messageBar} ${styles[message.type]}`}>
          {message.type === 'success' ? '✓ ' : message.type === 'error' ? '✗ ' : '⏳ '}{message.text}
        </div>
      )}
    </nav>
  );
}
