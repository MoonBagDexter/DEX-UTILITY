import TokenFeed from '@/components/TokenFeed';
import styles from '../page.module.css';

export const metadata = {
  title: 'Kept Tokens - Util Finder',
  description: 'Tokens you have marked as keepers',
};

export default function KeptPage() {
  return (
    <main className="container">
      <header className={styles.header}>
        <h1 className={styles.title}>Kept Tokens</h1>
        <p className={styles.subtitle}>
          Tokens you have marked as keepers
        </p>
      </header>
      <TokenFeed initialStatus="kept" />
    </main>
  );
}
