import TokenFeed from '@/components/TokenFeed';
import styles from '../page.module.css';

export const metadata = {
  title: 'Deleted Tokens - Util Finder',
  description: 'Tokens you have dismissed',
};

export default function DeletedPage() {
  return (
    <main className="container">
      <header className={styles.header}>
        <h1 className={styles.title}>Deleted Tokens</h1>
        <p className={styles.subtitle}>
          Tokens you have dismissed
        </p>
      </header>
      <TokenFeed initialStatus="deleted" />
    </main>
  );
}
