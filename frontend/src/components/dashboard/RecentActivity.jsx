import styles from './RecentActivity.module.css';

const ACTION_LABELS = {
  joined:   'joined',
  updated:  'updated',
  created:  'created',
  completed: 'completed',
};

function Initials({ name }) {
  const initials = name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  const colors = [
    ['#D4E3D3', '#4A5B4C'], ['#D3DCE3', '#3D4F5E'],
    ['#E3D3D8', '#5E3D47'], ['#E0D9D3', '#5E4E3D'],
    ['#D3E3DC', '#3D5E52'],
  ];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  const [bg, fg] = colors[idx];

  return (
    <div className={styles.avatar} style={{ background: bg, color: fg }}>
      {initials}
    </div>
  );
}

function ActivityItem({ item, loading }) {
  if (loading) {
    return (
      <li className={styles.item}>
        <div className={styles.skeletonAvatar} />
        <div className={styles.content}>
          <div className={styles.skeletonLine} style={{ width: 180 }} />
          <div className={styles.skeletonLine} style={{ width: 60, marginTop: 5 }} />
        </div>
      </li>
    );
  }

  return (
    <li className={styles.item}>
      <Initials name={item.actor} />
      <div className={styles.content}>
        <p className={styles.text}>
          <span className={styles.actor}>{item.actor}</span>{' '}
          <span className={styles.action}>{item.action}</span>{' '}
          <span className={styles.target}>{item.target}</span>
        </p>
        <time className={styles.time}>{item.timestamp}</time>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="16" stroke="#D4DDD3" strokeWidth="1.5" fill="#F4F5F2"/>
        <path d="M14 20h12M20 14v12" stroke="#C5CFC4" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <p>No recent activity</p>
    </div>
  );
}

export default function RecentActivity({ activity, loading }) {
  const items = loading ? Array.from({ length: 4 }) : activity;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.heading}>Recent activity</h2>
      </div>

      {!loading && activity.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className={styles.list}>
          {items.map((item, i) => (
            <ActivityItem key={loading ? i : item.id} item={item} loading={loading} />
          ))}
        </ul>
      )}
    </section>
  );
}
