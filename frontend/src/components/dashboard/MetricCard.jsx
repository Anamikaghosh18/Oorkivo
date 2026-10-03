import styles from './MetricCard.module.css';

export default function MetricCard({ label, value, subtext, loading }) {
  return (
    <div className={styles.card}>
      <span className={styles.label}>{label}</span>
      {loading ? (
        <>
          <div className={`${styles.skeleton} ${styles.skeletonValue}`} />
          <div className={`${styles.skeleton} ${styles.skeletonSub}`} />
        </>
      ) : (
        <>
          <span className={styles.value}>{value ?? '—'}</span>
          {subtext && <span className={styles.subtext}>{subtext}</span>}
        </>
      )}
    </div>
  );
}
