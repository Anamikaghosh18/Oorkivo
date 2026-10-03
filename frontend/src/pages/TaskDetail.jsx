import { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Circle,
  Flag,
  UserRound,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Timeline from '../components/communication/Timeline';
import DropdownSelect from '../components/DropdownSelect';
import { useDashboard } from '../hooks/useDashboard';
import { communicationApi, projectsApi, tasksApi } from '../services/api';
import styles from './TaskDetail.module.css';

const STATUS_META = {
  TODO: { cls: 'planning', label: 'To Do' },
  IN_PROGRESS: { cls: 'active', label: 'In Progress' },
  IN_REVIEW: { cls: 'hold', label: 'In Review' },
  COMPLETED: { cls: 'done', label: 'Completed' },
  BLOCKED: { cls: 'urgent', label: 'Blocked' },
};

const PRIORITY_META = {
  URGENT: { cls: 'urgent', label: 'Urgent' },
  HIGH: { cls: 'high', label: 'High' },
  MEDIUM: { cls: 'medium', label: 'Medium' },
  LOW: { cls: 'low', label: 'Low' },
};

function getErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return fallback;
}

function getUserName(person) {
  if (!person) return 'Unassigned';
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
  return name || person.email || 'Unknown user';
}

function formatDate(value) {
  if (!value) return 'Not set';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function MetaField({ label, icon: Icon, children }) {
  return (
    <label className={styles.metaControl}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValueWrap}>
        {Icon && <Icon size={13} />}
        {children}
      </span>
    </label>
  );
}

function StatusPill({ label, variant }) {
  return <span className={`${styles.pill} ${styles[variant]}`}>{label}</span>;
}

export default function TaskDetail() {
  const { id } = useParams();
  const { user, org } = useDashboard();
  const [task, setTask] = useState(null);
  const [comments, setComments] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taskError, setTaskError] = useState('');
  const [commentsError, setCommentsError] = useState('');
  const [membersError, setMembersError] = useState('');
  const [actionError, setActionError] = useState('');
  const [savingField, setSavingField] = useState('');

  useEffect(() => {
    let active = true;

    async function loadTask() {
      setLoading(true);
      setTaskError('');
      setCommentsError('');
      setMembersError('');
      setActionError('');
      setTask(null);
      setComments([]);
      setMembers([]);

      try {
        const response = await tasksApi.get(id);
        const loadedTask = response.data;
        if (!active) return;
        setTask(loadedTask);

        const results = await Promise.allSettled([
          tasksApi.comments(id),
          loadedTask.project?.id ? projectsApi.members(loadedTask.project.id) : Promise.resolve({ data: [] }),
        ]);
        if (!active) return;

        const [commentsResult, membersResult] = results;
        if (commentsResult.status === 'fulfilled') {
          const data = commentsResult.value.data?.results ?? commentsResult.value.data;
          setComments(Array.isArray(data) ? data : []);
        } else {
          setCommentsError(getErrorMessage(commentsResult.reason, 'Could not load task comments.'));
        }

        if (membersResult.status === 'fulfilled') {
          const data = membersResult.value.data?.results ?? membersResult.value.data;
          setMembers(Array.isArray(data) ? data : []);
        } else {
          setMembersError(getErrorMessage(membersResult.reason, 'Could not load project members.'));
        }
      } catch (error) {
        if (active) {
          setTaskError(getErrorMessage(error, 'Could not load this task.'));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadTask();
    return () => {
      active = false;
    };
  }, [id]);

  const handleUpdate = async (field, value) => {
    setSavingField(field);
    setActionError('');
    try {
      const response = await tasksApi.update(id, { [field]: value });
      setTask(response.data);
    } catch (error) {
      setActionError(getErrorMessage(error, 'Could not save the task update.'));
    } finally {
      setSavingField('');
    }
  };

  const handleAddComment = async (content) => {
    setActionError('');
    try {
      const response = await tasksApi.addComment(id, { content });
      setComments((current) => [...current, response.data]);
    } catch (error) {
      setActionError(getErrorMessage(error, 'Could not post your comment.'));
    }
  };

  const handleDeleteComment = async (commentId) => {
    setActionError('');
    try {
      await communicationApi.deleteComment(commentId);
      setComments((current) => current.filter((comment) => comment.id !== commentId));
    } catch (error) {
      setActionError(getErrorMessage(error, 'Could not delete this comment.'));
    }
  };

  const status = STATUS_META[task?.status] ?? { cls: 'planning', label: task?.status ?? 'Unknown' };
  const priority = PRIORITY_META[task?.priority] ?? { cls: 'medium', label: task?.priority ?? 'Unknown' };
  const assignedToId = task?.assigned_to?.id?.toString() ?? '';

  return (
    <AppShell org={org} user={user}>
      <div className={styles.pageShell}>
        <NavLink to="/tasks" className={styles.backLink}>
          <ArrowLeft size={14} />
          Tasks
        </NavLink>

        {loading && <p className={styles.stateMessage}>Loading task…</p>}
        {!loading && taskError && <div className={styles.stateError} role="alert">{taskError}</div>}

        {!loading && task && (
          <>
            {actionError && <div className={styles.stateError} role="alert">{actionError}</div>}
            <div className={styles.container}>
              <main className={styles.mainCol}>
                <header className={styles.taskHeader}>
                  <div className={styles.eyebrow}>{task.project?.name ?? 'Project task'}</div>
                  <div className={styles.titleRow}>
                    <h1 className={styles.taskTitle}>{task.title}</h1>
                  </div>

                  <div className={styles.headerBadges}>
                    <StatusPill label={status.label} variant={status.cls} />
                    <StatusPill label={priority.label} variant={priority.cls} />
                    <div className={styles.separator} />
                    <span className={styles.inlineMeta}>
                      Updated {formatDateTime(task.updated_at)}
                    </span>
                  </div>

                  <div className={styles.ownerRow}>
                    <div className={styles.assigneeBlock}>
                      <div className={styles.assigneeAvatar}>
                        {task.assigned_to ? getUserName(task.assigned_to).slice(0, 1).toUpperCase() : <UserRound size={16} />}
                      </div>
                      <div>
                        <span className={styles.detailLabel}>Assigned to</span>
                        <strong className={styles.assigneeName}>{getUserName(task.assigned_to)}</strong>
                      </div>
                    </div>

                    <div className={styles.dueBlock}>
                      <CalendarDays size={14} />
                      <span>{task.due_date ? `Due ${formatDate(task.due_date)}` : 'No due date'}</span>
                    </div>
                  </div>
                </header>

                <section className={styles.section}>
                  <div className={styles.sectionTitleRow}>
                    <span className={styles.sectionLabel}>Description</span>
                  </div>
                  <p className={styles.description}>
                    {task.description || 'No description has been added.'}
                  </p>
                </section>

                <section className={styles.section}>
                  <div className={styles.sectionTitleRow}>
                    <span className={styles.sectionLabel}>Record history</span>
                  </div>
                  <div className={styles.historyRow}>
                    <span>Created {formatDateTime(task.created_at)}</span>
                    <span>Last updated {formatDateTime(task.updated_at)}</span>
                  </div>
                </section>

                {commentsError && <div className={styles.inlineError} role="alert">{commentsError}</div>}
                <Timeline
                  items={comments.map((comment) => ({ ...comment, type: 'COMMENT' }))}
                  currentUserId={user?.id}
                  currentUser={user}
                  onAddComment={handleAddComment}
                  onDeleteComment={handleDeleteComment}
                />
              </main>

              <aside className={styles.sideCol}>
                <div className={styles.detailPanel}>
                  <div className={styles.panelHeader}>Task details</div>

                  <div className={styles.metaGrid}>
                    <MetaField label="Status" icon={Circle}>
                      <DropdownSelect
                        variant="inline"
                        ariaLabel="Task status"
                        value={task.status}
                        options={Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
                        onChange={(value) => handleUpdate('status', value)}
                        disabled={Boolean(savingField)}
                      />
                    </MetaField>
                    <MetaField label="Priority" icon={Flag}>
                      <DropdownSelect
                        variant="inline"
                        ariaLabel="Task priority"
                        value={task.priority}
                        options={Object.entries(PRIORITY_META).map(([value, meta]) => ({ value, label: meta.label }))}
                        onChange={(value) => handleUpdate('priority', value)}
                        disabled={Boolean(savingField)}
                      />
                    </MetaField>
                    <MetaField label="Assignee" icon={UserRound}>
                      <DropdownSelect
                        variant="inline"
                        ariaLabel="Task assignee"
                        value={assignedToId}
                        options={[
                          { value: '', label: 'Unassigned' },
                          ...members.map((member) => ({
                            value: String(member.user.id),
                            label: getUserName(member.user),
                          })),
                        ]}
                        onChange={(value) => handleUpdate('assigned_to', value ? Number(value) : null)}
                        disabled={Boolean(savingField) || Boolean(membersError)}
                      />
                    </MetaField>
                    <MetaField label="Due date" icon={CalendarDays}>
                      <input
                        className={styles.metaInput}
                        type="date"
                        value={task.due_date ?? ''}
                        onChange={(event) => handleUpdate('due_date', event.target.value || null)}
                        disabled={Boolean(savingField)}
                      />
                    </MetaField>
                  </div>
                  {membersError && <div className={styles.panelMessage} role="alert">{membersError}</div>}
                  {savingField && <div className={styles.panelMessage}>Saving changes…</div>}
                </div>

                <div className={styles.contextPanel}>
                  <div className={styles.panelHeader}>Project context</div>
                  <div className={styles.contextRow}>
                    <span className={styles.detailLabel}>Project</span>
                    <strong>{task.project?.name ?? 'Project unavailable'}</strong>
                  </div>
                  <div className={styles.contextRow}>
                    <span className={styles.detailLabel}>Comments</span>
                    <strong>{comments.length}</strong>
                  </div>
                  <div className={styles.contextRow}>
                    <span className={styles.detailLabel}>Created</span>
                    <strong>{formatDate(task.created_at?.slice(0, 10))}</strong>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
