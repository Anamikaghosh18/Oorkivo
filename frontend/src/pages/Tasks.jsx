import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarDays, CheckCircle2, CircleDot, Search, ListTodo } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import DropdownSelect from '../components/DropdownSelect';
import { useDashboard } from '../hooks/useDashboard';
import { projectsApi, tasksApi } from '../services/api';
import styles from './Tasks.module.css';

const STATUS_META = {
  TODO: { label: 'To do', className: 'todo' },
  IN_PROGRESS: { label: 'In progress', className: 'inProgress' },
  IN_REVIEW: { label: 'In review', className: 'inReview' },
  COMPLETED: { label: 'Completed', className: 'completed' },
  BLOCKED: { label: 'Blocked', className: 'blocked' },
};

const PRIORITY_META = {
  URGENT: { label: 'Urgent', className: 'urgent' },
  HIGH: { label: 'High', className: 'high' },
  MEDIUM: { label: 'Medium', className: 'medium' },
  LOW: { label: 'Low', className: 'low' },
};

function getRows(data) {
  const rows = data?.results ?? data;
  return Array.isArray(rows) ? rows : [];
}

function getErrorMessage(error) {
  const detail = error.response?.data?.detail;
  return typeof detail === 'string'
    ? detail
    : 'Could not load tasks for one or more projects.';
}

function formatDate(value) {
  if (!value) return 'No due date';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  });
}

function isOverdue(task) {
  if (!task.due_date || task.status === 'COMPLETED') return false;
  const due = new Date(`${task.due_date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function StatusBadge({ value }) {
  const meta = STATUS_META[value] ?? { label: value || 'Unknown', className: 'todo' };
  return <span className={`${styles.badge} ${styles[meta.className]}`}>{meta.label}</span>;
}

function PriorityBadge({ value }) {
  const meta = PRIORITY_META[value] ?? { label: value || 'Unknown', className: 'medium' };
  return <span className={`${styles.priority} ${styles[meta.className]}`}>{meta.label}</span>;
}

export default function Tasks() {
  const { user, org } = useDashboard();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    let active = true;

    async function loadTasks() {
      setLoading(true);
      setError('');
      try {
        const projectsResponse = await projectsApi.list();
        const projects = getRows(projectsResponse.data);
        const results = await Promise.allSettled(
          projects.map(async (project) => {
            const response = await tasksApi.list(project.id);
            return getRows(response.data).map((task) => ({
              ...task,
              project: task.project ?? { id: project.id, name: project.name },
            }));
          })
        );
        if (!active) return;

        const loadedTasks = [];
        const failures = [];
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            loadedTasks.push(...result.value);
          } else {
            failures.push(projects[index]?.name ?? 'A project');
          }
        });
        setTasks(loadedTasks);
        if (failures.length) {
          setError(`Could not load tasks from: ${failures.join(', ')}.`);
        }
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadTasks();
    return () => {
      active = false;
    };
  }, []);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return tasks.filter((task) => {
      const matchesStatus = statusFilter === 'ALL' || task.status === statusFilter;
      const matchesQuery = !query || [
        task.title,
        task.description,
        task.project?.name,
        task.assigned_to?.first_name,
        task.assigned_to?.last_name,
      ].some((value) => value?.toLocaleLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [tasks, search, statusFilter]);

  const completedCount = tasks.filter((task) => task.status === 'COMPLETED').length;
  const overdueCount = tasks.filter(isOverdue).length;
  const assignedCount = tasks.filter((task) => task.assigned_to?.id === user?.id).length;

  return (
    <AppShell org={org} user={user}>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.titleGroup}>
            <span className={styles.eyebrow}>Work management</span>
            <h1 className={styles.title}>Tasks</h1>
            <p className={styles.subtitle}>Track work and priorities across your projects.</p>
          </div>
          <div className={styles.taskCount}>
            <ListTodo size={16} />
            {loading ? 'Loading' : `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}
          </div>
        </header>

        <section className={styles.metrics} aria-label="Task summary">
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Assigned to me</span>
            <strong>{loading ? '—' : assignedCount}</strong>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Completed</span>
            <strong>{loading ? '—' : completedCount}</strong>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Overdue</span>
            <strong className={overdueCount ? styles.overdueValue : ''}>{loading ? '—' : overdueCount}</strong>
          </div>
        </section>

        <div className={styles.toolbar}>
          <label className={styles.searchBox}>
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks or projects"
              aria-label="Search tasks or projects"
            />
          </label>
          <DropdownSelect
            variant="compact"
            prefix="Status"
            value={statusFilter}
            ariaLabel="Filter tasks by status"
            options={[
              { value: 'ALL', label: 'All statuses' },
              ...Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
            ]}
            onChange={setStatusFilter}
          />
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <section className={styles.listPanel} aria-label="Tasks">
          <div className={`${styles.row} ${styles.columnHeader}`}>
            <span>Task</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Assignee</span>
            <span>Due date</span>
          </div>

          {loading ? (
            <div className={styles.state}>Loading tasks…</div>
          ) : filteredTasks.length ? (
            filteredTasks.map((task) => (
              <NavLink to={`/tasks/${task.id}`} className={styles.row} key={task.id}>
                <span className={styles.taskName}>
                  <CircleDot size={15} />
                  <span>
                    <strong>{task.title}</strong>
                    <small>{task.project?.name ?? 'Project'}</small>
                  </span>
                </span>
                <span className={styles.statusCell}><StatusBadge value={task.status} /></span>
                <span className={styles.priorityCell}><PriorityBadge value={task.priority} /></span>
                <span className={styles.assignee}>
                  {task.assigned_to
                    ? [task.assigned_to.first_name, task.assigned_to.last_name].filter(Boolean).join(' ') || task.assigned_to.email
                    : 'Unassigned'}
                </span>
                <span className={`${styles.dueDate} ${isOverdue(task) ? styles.overdue : ''}`}>
                  {task.due_date && (isOverdue(task) ? <CalendarDays size={13} /> : <CheckCircle2 size={13} />)}
                  {isOverdue(task) ? `Overdue · ${formatDate(task.due_date)}` : formatDate(task.due_date)}
                </span>
              </NavLink>
            ))
          ) : (
            <div className={styles.empty}>
              <ListTodo size={22} />
              <strong>{tasks.length ? 'No tasks match these filters' : 'No tasks yet'}</strong>
              <span>{tasks.length ? 'Try another search or status.' : 'Tasks from your accessible projects will appear here.'}</span>
            </div>
          )}
        </section>

        {!loading && filteredTasks.length > 0 && (
          <p className={styles.resultCount}>Showing {filteredTasks.length} of {tasks.length} tasks</p>
        )}
      </div>
    </AppShell>
  );
}
