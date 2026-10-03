import AppShell from '../components/layout/AppShell';
import MetricCard from '../components/dashboard/MetricCard';
import RecentProjects from '../components/dashboard/RecentProjects';
import RecentActivity from '../components/dashboard/RecentActivity';
import { useDashboard } from '../hooks/useDashboard';
import styles from './Dashboard.module.css';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { metrics, projects, activity, user, org, loading, error } = useDashboard();

  return (
    <AppShell org={org} user={user}>
      {/* ── Page header ─────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          {loading ? (
            <div className={styles.headingSkeleton} />
          ) : (
            <h1 className={styles.heading}>
              {getGreeting()}, {user?.first_name ?? '—'}
            </h1>
          )}
          <p className={styles.subheading}>
            Here's what's happening across your organization today.
          </p>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────── */}
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* ── Metrics ─────────────────────────────────────────── */}
      <div className={styles.metricsRow}>
        <MetricCard
          label="Teams"
          value={metrics?.teams}
          subtext="active across org"
          loading={loading}
        />
        <MetricCard
          label="Projects"
          value={metrics?.projects}
          subtext="in progress"
          loading={loading}
        />
        <MetricCard
          label="Members"
          value={metrics?.members}
          subtext="in your workspace"
          loading={loading}
        />
      </div>

      {/* ── Content grid ────────────────────────────────────── */}
      <div className={styles.contentGrid}>
        <RecentProjects projects={projects} loading={loading} />
        <RecentActivity activity={activity} loading={loading} />
      </div>
    </AppShell>
  );
}
