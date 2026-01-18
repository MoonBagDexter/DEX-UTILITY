import styles from './TokenCardSkeleton.module.css';

export default function TokenCardSkeleton() {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.image} />
        <div className={styles.titleGroup}>
          <div className={styles.name} />
          <div className={styles.ticker} />
        </div>
        <div className={styles.age} />
      </div>
      <div className={styles.description} />
      <div className={styles.stats}>
        <div className={styles.stat} />
        <div className={styles.stat} />
        <div className={styles.stat} />
      </div>
      <div className={styles.actions}>
        <div className={styles.btn} />
        <div className={styles.btnGroup}>
          <div className={styles.btnSmall} />
          <div className={styles.btnSmall} />
        </div>
      </div>
    </div>
  );
}
