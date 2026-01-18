import TokenFeed from '@/components/TokenFeed';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className="container">
      <header className={styles.header}>
        <h1 className={styles.title}>Util Finder</h1>
        <p className={styles.subtitle}>
          Track and filter new Solana tokens
        </p>
      </header>
      <TokenFeed initialStatus="new" />
    </main>
  );
}
