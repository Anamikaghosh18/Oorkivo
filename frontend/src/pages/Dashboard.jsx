import { Navigate, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, CheckCircle2 } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import FeatureIcon from '../components/visual/FeatureIcon';
import IdentityMark from '../components/visual/IdentityMark';
import { useDashboard } from '../hooks/useDashboard';
import styles from './Dashboard.module.css';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function isSameDay(first, second) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function formatDate(value) {
  if (!value) return 'No deadline';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function formatTime(value) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ProjectMark({ name = '' }) {
  return <IdentityMark name={name} size={30} className={styles.projectMark} />;
}

function getTaskCounts(tasks, projectId) {
  const projectTasks = tasks.filter((task) => String(task.project?.id) === String(projectId));
  const completed = projectTasks.filter((task) => task.status === 'COMPLETED').length;
  return { total: projectTasks.length, completed };
}

function DashboardIllustration() {
  return (
    <div className={styles.bannerArt} aria-hidden="true">
      <svg viewBox="0 0 240 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M145 22C171 12 204 23 218 48C232 72 219 103 198 117C176 132 143 126 130 105C117 84 120 37 145 22Z" fill="#D8CBB9" fillOpacity=".48" />
        <path d="M145 22C171 12 204 23 218 48C232 72 219 103 198 117" stroke="#B69D89" strokeOpacity=".62" strokeWidth="1.2" />
        <path d="M42 108C54 86 81 80 101 91C119 100 128 122 117 137H39C36 128 37 117 42 108Z" fill="#B2B9AA" fillOpacity=".42" />
        <path d="M35 132H211" stroke="#737A76" strokeOpacity=".28" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M69 52H139C145 52 150 57 150 63V111H58V63C58 57 63 52 69 52Z" fill="#FFFDF8" stroke="#D9D5CC" strokeWidth="1.4" />
        <path d="M70 68H125M70 79H112" stroke="#B69D89" strokeOpacity=".74" strokeWidth="2" strokeLinecap="round" />
        <circle cx="135" cy="79" r="5" fill="#64745F" fillOpacity=".72" />
        <path d="M74 94H91" stroke="#899583" strokeWidth="3" strokeLinecap="round" />
        <path d="M102 94H126" stroke="#D8CBB9" strokeWidth="3" strokeLinecap="round" />
        <circle cx="184" cy="42" r="3" fill="#64745F" fillOpacity=".78" />
        <path d="M177 66L183 72L194 59" stroke="#64745F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M48 43C53 38 60 38 65 43" stroke="#B69D89" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function Dashboard() {
  const location = useLocation();
  const overlayState = { backgroundLocation: location };
  const {
    projects, tasks, activity, user, org, loading, error,
    taskDataError, activityError,
  } = useDashboard();
  const today = new Date();
  const todayTasks = tasks.filter((task) => task.due_date && isSameDay(new Date(`${task.due_date}T00:00:00`), today));
  const overdueTasks = tasks.filter((task) => task.due_date
    && task.status !== 'COMPLETED'
    && new Date(`${task.due_date}T00:00:00`) < new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const assignedTasks = tasks.filter((task) => String(task.assigned_to?.id) === String(user?.id));
  const completedTasks = tasks.filter((task) => task.status === 'COMPLETED');
  const activeProjects = projects.filter((project) => project.status === 'ACTIVE').slice(0, 4);
  const upcomingTasks = tasks
    .filter((task) => task.status !== 'COMPLETED' && task.due_date && new Date(`${task.due_date}T00:00:00`) >= new Date(today.getFullYear(), today.getMonth(), today.getDate()))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 4);
  const notifications = [...activity].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const taskDataReady = !loading && !taskDataError;
  if (!loading && !org) return <Navigate to="/onboarding" replace />;

  return (
    <AppShell org={org} user={user}>
      <div className={styles.page}>
        <header className={styles.welcomeBanner}>
          <div className={styles.bannerText}>
            <span className={styles.eyebrow}>{org?.name ?? 'Your workspace'}</span>
            <h1 className={styles.heading}>
              {getGreeting()}{user?.first_name ? `, ${user.first_name}` : ''}
            </h1>
            <p className={styles.subheading}>Here’s what’s happening across your workspace today.</p>
          </div>
          <DashboardIllustration />
        </header>

        {error && <div className={styles.errorBanner} role="alert">{error}</div>}

        <section className={styles.overview} aria-label="Workspace overview">
          <div className={styles.overviewHeading}>
            <span className={styles.sectionEyebrow}>Your work</span>
            <span className={styles.overviewPeriod}>Workspace overview</span>
          </div>
          <div className={styles.overviewMetrics}>
            <div className={styles.overviewMetric}>
              <strong>{taskDataReady ? assignedTasks.length : '—'}</strong>
              <span>assigned to you</span>
            </div>
            <div className={styles.overviewMetric}>
              <strong>{taskDataReady ? todayTasks.length : '—'}</strong>
              <span>due today</span>
            </div>
            <div className={`${styles.overviewMetric} ${overdueTasks.length ? styles.metricAttention : ''}`}>
              <strong>{taskDataReady ? overdueTasks.length : '—'}</strong>
              <span>overdue</span>
            </div>
            <div className={styles.overviewMetric}>
              <strong>{taskDataReady ? completedTasks.length : '—'}</strong>
              <span>completed</span>
            </div>
          </div>
          {taskDataError && <p className={styles.dataNotice} role="status">{taskDataError}</p>}
        </section>

        <section className={styles.projectsSection}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>In motion</span>
              <h2>Active projects</h2>
            </div>
            <NavLink to="/projects" className={styles.viewAll}>View all <ArrowUpRight size={14} /></NavLink>
          </div>

          {loading ? (
            <div className={styles.projectLoading}>Loading active projects…</div>
          ) : activeProjects.length ? (
            <div className={styles.projectList}>
              {activeProjects.map((project) => {
                const counts = getTaskCounts(tasks, project.id);
                const progress = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
                return (
                  <NavLink className={styles.projectRow} to={`/projects/${project.id}`} state={overlayState} key={project.id}>
                    <ProjectMark name={project.name} />
                    <div className={styles.projectMain}>
                      <div className={styles.projectTitleLine}>
                        <strong>{project.name}</strong>
                        <span className={styles.projectStatus}>Active</span>
                      </div>
                      <div className={styles.progressLine}>
                        <div className={styles.progressTrack}>
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <span>{taskDataReady && counts.total ? `${progress}%` : '—'}</span>
                      </div>
                      <div className={styles.projectMeta}>
                        <span>{taskDataReady ? `${counts.total} tasks · ${counts.completed} completed` : 'Task totals unavailable'}</span>
                        <span>{project.target_end_date ? `Due ${formatDate(project.target_end_date)}` : 'No deadline'}</span>
                      </div>
                    </div>
                    <ArrowUpRight className={styles.projectArrow} size={15} />
                  </NavLink>
                );
              })}
            </div>
          ) : (
            <div className={styles.sectionEmpty}>
              <FeatureIcon name="projects" size={18} />
              <span>No active projects right now.</span>
              <NavLink to="/projects">Browse projects</NavLink>
            </div>
          )}
        </section>

        <div className={styles.lowerGrid}>
          <section className={styles.activitySection}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.sectionEyebrow}>Workspace pulse</span>
                <h2>Recent activity</h2>
              </div>
            </div>
            {activityError ? (
              <p className={styles.sectionNote}>{activityError}</p>
            ) : notifications.length ? (
              <ol className={styles.activityList}>
                {notifications.map((item) => (
                  <li className={styles.activityItem} key={item.id}>
                    <span className={styles.activityDot} />
                    <div>
                      <p>{item.message}</p>
                      <time>{formatTime(item.created_at)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.sectionNote}>No recent notifications to show.</p>
            )}
          </section>

          <section className={styles.upcomingSection}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.sectionEyebrow}>Keep in view</span>
                <h2>Upcoming deadlines</h2>
              </div>
              <CalendarDays size={16} className={styles.sectionIcon} />
            </div>
            {!taskDataReady ? (
              <p className={styles.sectionNote}>{loading ? 'Loading deadlines…' : 'Deadline data is unavailable.'}</p>
            ) : upcomingTasks.length ? (
              <ul className={styles.upcomingList}>
                {upcomingTasks.map((task) => (
                  <li key={task.id}>
                    <NavLink to={`/tasks/${task.id}`} state={overlayState}>
                      <span className={styles.deadlineDate}>{formatDate(task.due_date)}</span>
                      <span className={styles.deadlineTask}>
                        <strong>{task.title}</strong>
                        <small>{task.project?.name}</small>
                      </span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.sectionNote}><CheckCircle2 size={15} /> No upcoming deadlines.</div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
