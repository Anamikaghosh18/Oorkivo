import styles from './RecentProjects.module.css';

const STATUS_META = {
  ACTIVE:    { label: 'Active',    cls: 'active',    dot: '#4E7C5A' },
  PLANNING:  { label: 'Planning',  cls: 'planning',  dot: '#9BA599' },
  ON_HOLD:   { label: 'On Hold',   cls: 'onHold',    dot: '#9C7834' },
  COMPLETED: { label: 'Completed', cls: 'completed', dot: '#5E7260' },
};

const PROJECT_COLORS = [
  '#5E7260', '#4A6FA5', '#8B5E6B', '#7A6A47', '#3D7A6F',
];

function ProjectMonogram({ name }) {
  const initials = name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const colorIdx = name.charCodeAt(0) % PROJECT_COLORS.length;
  return (
    <div
      className={styles.monogram}
      style={{ background: PROJECT_COLORS[colorIdx] }}
    >
      {initials}
    </div>
  );
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.PLANNING;
  return (
    <span className={`${styles.pill} ${styles[meta.cls]}`}>
      <span className={styles.dot} style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short',
  });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function EmptyState() {
  return (
    <div className={styles.empty}>
      {/* Minimal SVG illustration */}
      <svg className={styles.emptyIllustration} width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="8" y="12" width="48" height="36" rx="4" stroke="#D4DDD3" strokeWidth="2" fill="#F4F5F2"/>
        <rect x="16" y="22" width="20" height="2.5" rx="1.25" fill="#C5CFC4"/>
        <rect x="16" y="28" width="32" height="2.5" rx="1.25" fill="#D4DDD3"/>
        <rect x="16" y="34" width="26" height="2.5" rx="1.25" fill="#D4DDD3"/>
        <circle cx="52" cy="44" r="10" fill="#ECF0EB" stroke="#D4DDD3" strokeWidth="1.5"/>
        <path d="M48 44l3 3 5-5" stroke="#5E7260" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <p className={styles.emptyTitle}>No projects yet</p>
      <p className={styles.emptyText}>Create your first project to get started.</p>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className={styles.row}>
      <div className={styles.skeletonMonogram} />
      <div className={styles.projectInfo}>
        <div className={styles.skeletonLine} style={{ width: 140, height: 13 }} />
        <div className={styles.skeletonLine} style={{ width: 80, height: 11, marginTop: 5 }} />
      </div>
      <div className={styles.skeletonLine} style={{ width: 60, height: 20, borderRadius: 999 }} />
      <div className={styles.skeletonLine} style={{ width: 50, height: 13 }} />
    </div>
  );
}

export default function RecentProjects({ projects, loading }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.heading}>Recent projects</h2>
        {!loading && projects.length > 0 && (
          <span className={styles.count}>{projects.length} total</span>
        )}
      </div>

      {!loading && projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={styles.list}>
          {/* Column headers */}
          <div className={`${styles.row} ${styles.headerRow}`}>
            <div className={styles.colProject}>Project</div>
            <div className={styles.colStatus}>Status</div>
            <div className={styles.colDeadline}>Deadline</div>
          </div>

          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
            : projects.map((p) => (
                <div key={p.id} className={styles.row}>
                  <div className={styles.colProject}>
                    <ProjectMonogram name={p.name} />
                    <div className={styles.projectInfo}>
                      <span className={styles.projectName}>{p.name}</span>
                      <span className={styles.teamName}>{p.team}</span>
                    </div>
                  </div>
                  <div className={styles.colStatus}>
                    <StatusPill status={p.status} />
                  </div>
                  <div className={styles.colDeadline}>
                    <span className={isOverdue(p.target_end_date) && p.status !== 'COMPLETED' ? styles.overdue : styles.deadline}>
                      {formatDate(p.target_end_date)}
                    </span>
                  </div>
                </div>
              ))}
        </div>
      )}
    </section>
  );
}
