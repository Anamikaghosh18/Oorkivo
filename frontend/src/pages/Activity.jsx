import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowUpRight, Check, CircleAlert, Clock3, Filter, RefreshCw, Search } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Avatar from '../components/Avatar';
import { useAuth } from '../hooks/useAuth';
import { organizationsApi } from '../services/api';
import styles from './Activity.module.css';

const FILTERS = [
  { id: 'ALL', label: 'All activity' },
  { id: 'TASKS', label: 'Tasks' },
  { id: 'PROJECTS', label: 'Projects' },
  { id: 'PEOPLE', label: 'People' },
];

const ACTION_COPY = {
  CREATED: 'created a task in',
  ASSIGNED: 'changed the assignee for',
  STATUS_CHANGED: 'changed the status of',
  PRIORITY_CHANGED: 'changed the priority of',
  COMPLETED: 'completed',
  DUE_DATE_CHANGED: 'changed the due date for',
  COMMENTED: 'commented on',
  MILESTONE_COMPLETED: 'completed a milestone in',
  MEMBER_ADDED: 'added a member to',
  MEMBER_REMOVED: 'removed a member from',
  MEMBER_ROLE_CHANGED: 'changed a member role in',
  PROJECT_ARCHIVED: 'archived the project',
  PROJECT_RESTORED: 'restored the project',
  TASK_ARCHIVED: 'archived',
  TASK_RESTORED: 'restored',
  PROJECT_UPDATED: 'updated the project',
  TASK_UPDATED: 'updated',
  SPRINT_CREATED: 'created a sprint in',
  SPRINT_STARTED: 'started a sprint in',
  SPRINT_COMPLETED: 'completed a sprint in',
  TASK_MOVED_TO_SPRINT: 'moved a task into a sprint in',
};

function getRows(data) {
  const rows = data?.results ?? data;
  return Array.isArray(rows) ? rows : [];
}

function displayName(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return name || user?.email || 'Workspace member';
}

function isPeopleActivity(activity) {
  return ['MEMBER_ADDED', 'MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED'].includes(activity.action);
}

function getActivityCategory(activity) {
  if (isPeopleActivity(activity)) return 'PEOPLE';
  return activity.task ? 'TASKS' : 'PROJECTS';
}

function getSubject(activity) {
  if (activity.task_title) return activity.task_title;
  return activity.project_name || 'this project';
}

function getDetails(activity) {
  const details = activity.details ?? {};
  if (details.old != null && details.new != null) {
    return `${details.old}  ->  ${details.new}`;
  }
  if (details.member_name) return details.member_name;
  if (details.new_role) return `Role changed to ${details.new_role.toLowerCase()}`;
  return '';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((today - day) / 86400000);
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  if (dayDifference === 0) return `Today, ${time}`;
  if (dayDifference === 1) return `Yesterday, ${time}`;
  return `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)}, ${time}`;
}

function getErrorMessage(error) {
  const detail = error.response?.data?.detail;
  return typeof detail === 'string' ? detail : 'Activity could not be loaded. Try again.';
}

export default function Activity() {
  const { user, org, loading: authLoading } = useAuth();
  const [activities, setActivities] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    if (!org?.id) return undefined;
    let active = true;
    const loadActivity = async () => {
      setError('');
      try {
        const response = await organizationsApi.activity(org.id);
        if (active) setActivities(getRows(response.data));
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError));
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    loadActivity();
    return () => { active = false; };
  }, [org?.id, requestKey]);

  const filteredActivities = useMemo(() => activities.filter((activity) => {
    if (filter !== 'ALL' && getActivityCategory(activity) !== filter) return false;
    if (!query.trim()) return true;
    const searchText = [
      displayName(activity.actor),
      activity.project_name,
      activity.task_title,
      activity.action,
      getDetails(activity),
    ].filter(Boolean).join(' ').toLowerCase();
    return searchText.includes(query.trim().toLowerCase());
  }), [activities, filter, query]);

  const counts = useMemo(() => ({
    ALL: activities.length,
    TASKS: activities.filter((activity) => getActivityCategory(activity) === 'TASKS').length,
    PROJECTS: activities.filter((activity) => getActivityCategory(activity) === 'PROJECTS').length,
    PEOPLE: activities.filter((activity) => getActivityCategory(activity) === 'PEOPLE').length,
  }), [activities]);

  const refresh = () => {
    setRefreshing(true);
    setRequestKey((current) => current + 1);
  };

  if (authLoading) return null;
  if (user && !org) return <Navigate to="/onboarding" replace />;

  return (
    <AppShell org={org} user={user}>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Workspace</span>
            <h1>Activity</h1>
            <p>Changes and updates across your workspace.</p>
          </div>
          <button type="button" className={styles.refreshButton} onClick={refresh} disabled={refreshing} aria-label="Refresh activity" title="Refresh activity">
            <RefreshCw size={16} className={refreshing ? styles.spinning : ''} />
            <span>Refresh</span>
          </button>
        </header>

        <section className={styles.activitySurface} aria-label="Workspace activity">
          <div className={styles.toolbar}>
            <div className={styles.filters} role="tablist" aria-label="Filter activity">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === item.id}
                  className={filter === item.id ? styles.filterActive : ''}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}<span>{counts[item.id]}</span>
                </button>
              ))}
            </div>
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity" aria-label="Search activity" />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
            </label>
          </div>

          {error && <div className={styles.error} role="alert"><CircleAlert size={16} />{error}</div>}
          {loading ? (
            <div className={styles.loading} role="status"><span />Loading activity…</div>
          ) : !filteredActivities.length ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}><Filter size={19} /></span>
              <strong>{activities.length ? 'No matching activity' : 'No activity yet'}</strong>
              <p>{activities.length ? 'Try another category or search term.' : 'Workspace changes will appear here as your team works.'}</p>
            </div>
          ) : (
            <ol className={styles.timeline}>
              {filteredActivities.map((activity) => {
                const target = activity.task
                  ? `/tasks/${activity.task}`
                  : `/projects/${activity.project}`;
                const copy = ACTION_COPY[activity.action] ?? activity.action.toLowerCase().replaceAll('_', ' ');
                return (
                  <li className={styles.event} key={activity.id}>
                    <Avatar user={activity.actor} size={34} className={styles.avatar} />
                    <div className={styles.eventContent}>
                      <div className={styles.eventTopline}>
                        <p><strong>{displayName(activity.actor)}</strong> {copy}</p>
                        <time dateTime={activity.created_at}><Clock3 size={12} />{formatDate(activity.created_at)}</time>
                      </div>
                      <Link className={styles.subject} to={target}>
                        <span>{getSubject(activity)}</span><ArrowUpRight size={13} />
                      </Link>
                      {getDetails(activity) && <span className={styles.details}>{getDetails(activity)}</span>}
                      <span className={styles.context}>{activity.project_name}{activity.task_title ? ` · ${activity.task_title}` : ''}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {!loading && filteredActivities.length > 0 && (
            <footer className={styles.footer}><Check size={14} /> Showing {filteredActivities.length} of {activities.length} recent updates</footer>
          )}
        </section>
      </main>
    </AppShell>
  );
}
