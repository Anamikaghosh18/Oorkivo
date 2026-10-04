import styles from './RecentProjects.module.css';
import IdentityMark from '../visual/IdentityMark';

const STATUS_META = {
  ACTIVE:    { label: 'Active',    cls: 'active',    dot: 'var(--color-sage-dark)' },
  PLANNING:  { label: 'Planning',  cls: 'planning',  dot: 'var(--color-slate)' },
  ON_HOLD:   { label: 'On Hold',   cls: 'onHold',    dot: 'var(--color-amber)' },
  COMPLETED: { label: 'Completed', cls: 'completed', dot: 'var(--color-sage-dark)' },
};

function ProjectMonogram({ name }) {
  return (
    <IdentityMark name={name} size={30} className={styles.monogram} />
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
      <svg className={styles.emptyIllustration} width="100" height="100" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="40" fill="var(--color-bg)" />
        <rect x="30" y="30" width="40" height="40" rx="8" fill="var(--color-surface-raised)" stroke="var(--color-border)" strokeWidth="1.5" />
        <path d="M42 45 C45 42, 55 42, 58 45" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" />
        <path d="M40 55 H60" stroke="var(--color-border-subtle)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="65" cy="65" r="12" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="1.5" />
        <path d="M61 65 L64 68 L69 61" stroke="var(--color-sage)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className={styles.emptyTitle}>No projects yet</p>
      <p className={styles.emptyText}>Create your first project to organize your team's work.</p>
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
