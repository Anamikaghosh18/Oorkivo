import styles from './MetricCard.module.css';

export default function MetricCard({ label, value, subtext, loading }) {
  return (
    <div className={styles.card}>
      <div className={styles.watermark}>
        <svg viewBox="0 0 100 100" fill="none">
          <circle cx="80" cy="80" r="40" fill="currentColor" opacity="0.03" />
          <rect x="50" y="50" width="60" height="60" rx="12" fill="currentColor" opacity="0.02" />
        </svg>
      </div>
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
