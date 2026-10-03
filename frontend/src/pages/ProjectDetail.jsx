import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, Clock3, FolderKanban, Users } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import { authApi, organizationsApi, projectsApi, tasksApi } from '../services/api';
import styles from './ProjectDetail.module.css';

const PROJECT_STATUS = {
  PLANNING: 'Planning',
  ACTIVE: 'In progress',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
};

const TASK_STATUS = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
};

const PRIORITY = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

function getRows(data) {
  const rows = data?.results ?? data;
  return Array.isArray(rows) ? rows : [];
}

function formatDate(value) {
  if (!value) return 'Not set';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fullName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.email || 'Unknown member';
}

function memberInitials(user) {
  return fullName(user).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function ProjectMembers({ members, error }) {
  if (error) return <p className={styles.inlineError}>{error}</p>;
  if (!members.length) return <p className={styles.quietMessage}>No project members are available.</p>;
  return (
    <ul className={styles.memberList}>
      {members.map((membership, index) => (
        <li className={styles.member} key={membership.id ?? index}>
          <span className={`${styles.memberAvatar} ${styles[`avatarTone${index % 4}`]}`}>{memberInitials(membership.user)}</span>
          <span className={styles.memberInfo}>
            <strong>{fullName(membership.user)}</strong>
            {membership.user?.email && <small>{membership.user.email}</small>}
          </span>
          <span className={styles.memberRole}>{membership.role || 'Member'}</span>
        </li>
      ))}
    </ul>
  );
}

function RecentDiscussion({ comments, error }) {
  if (error) return <p className={styles.inlineError}>{error}</p>;
  if (!comments.length) return <p className={styles.quietMessage}>No comments on recently updated tasks.</p>;
  return (
    <ol className={styles.discussionList}>
      {comments.map(({ comment, task }) => (
        <li className={styles.discussionItem} key={`${task.id}-${comment.id}`}>
          <span className={styles.discussionAvatar}>{memberInitials(comment.author)}</span>
          <div className={styles.discussionContent}>
            <div className={styles.discussionMeta}>
              <strong>{fullName(comment.author)}</strong>
              <time>{new Date(comment.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</time>
            </div>
            <p>{comment.content}</p>
            <NavLink to={`/tasks/${task.id}`}>{task.title}</NavLink>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TaskRow({ task }) {
  return (
    <NavLink className={styles.taskRow} to={`/tasks/${task.id}`}>
      <span className={`${styles.taskStatusIcon} ${styles[`task${task.status}`]}`}>
        {task.status === 'COMPLETED' ? <CheckCircle2 size={16} /> : task.status === 'IN_PROGRESS' ? <Clock3 size={16} /> : <Circle size={16} />}
      </span>
      <span className={styles.taskTitleBlock}>
        <strong>{task.title}</strong>
        <small>{task.assigned_to ? fullName(task.assigned_to) : 'Unassigned'}</small>
      </span>
      <span className={`${styles.taskStatus} ${styles[`status${task.status}`]}`}>{TASK_STATUS[task.status] || task.status}</span>
      <span className={`${styles.priority} ${styles[`priority${task.priority}`]}`}>{PRIORITY[task.priority] || task.priority}</span>
      <span className={styles.dueDate}>{formatDate(task.due_date)}</span>
    </NavLink>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [discussion, setDiscussion] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tasksError, setTasksError] = useState('');
  const [membersError, setMembersError] = useState('');
  const [discussionError, setDiscussionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setTasksError('');
    setMembersError('');
    setDiscussionError('');
    setDiscussion([]);
    try {
      const [projectResult, userResult, orgsResult] = await Promise.all([
        projectsApi.get(id),
        authApi.me(),
        organizationsApi.list(),
      ]);
      const loadedProject = projectResult.data;
      setProject(loadedProject);
      setUser(userResult.data);
      const organizations = getRows(orgsResult.data);
      const projectOrgId = loadedProject.organization?.id ?? loadedProject.organization;
      const currentOrg = organizations.find((item) => String(item.id) === String(projectOrgId)) ?? organizations[0] ?? null;
      setOrg(currentOrg);

      const [tasksResult, membersResult, teamsResult] = await Promise.allSettled([
        projectsApi.tasks(id),
        projectsApi.members(id),
        currentOrg?.id ? organizationsApi.teams(currentOrg.id) : Promise.resolve({ data: [] }),
      ]);
      if (tasksResult.status === 'fulfilled') setTasks(getRows(tasksResult.value.data));
      else {
        setTasks([]);
        setTasksError('Project tasks could not be loaded.');
      }
      if (tasksResult.status === 'fulfilled') {
        const projectTasks = getRows(tasksResult.value.data);
        const recentTasks = [...projectTasks]
          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
          .slice(0, 6);
        const commentResults = await Promise.allSettled(recentTasks.map((task) => tasksApi.comments(task.id)));
        const recentComments = [];
        let commentsUnavailable = false;
        commentResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            commentsUnavailable = true;
            return;
          }
          getRows(result.value.data).forEach((comment) => {
            recentComments.push({ comment, task: recentTasks[index] });
          });
        });
        recentComments.sort((a, b) => new Date(b.comment.created_at) - new Date(a.comment.created_at));
        setDiscussion(recentComments.slice(0, 5));
        if (commentsUnavailable) setDiscussionError('Some task discussions could not be loaded.');
      }
      if (membersResult.status === 'fulfilled') setMembers(getRows(membersResult.value.data));
      else {
        setMembers([]);
        setMembersError('Project members could not be loaded.');
      }
      if (teamsResult.status === 'fulfilled') {
        const teamId = loadedProject.team?.id ?? loadedProject.team;
        const team = getRows(teamsResult.value.data).find((item) => String(item.id) === String(teamId));
        setTeamName(loadedProject.team?.name ?? team?.name ?? '');
      } else {
        setTeamName(loadedProject.team?.name ?? '');
      }
    } catch (loadError) {
      const status = loadError.response?.status;
      if (status === 404) setError('This project could not be found.');
      else if (status === 401) setError('Your session has expired. Please log in again.');
      else if (status === 403) setError('You do not have permission to view this project.');
      else setError('Project details could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const completedCount = tasks.filter((task) => task.status === 'COMPLETED').length;
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const taskGroups = useMemo(() => [
    { key: 'IN_PROGRESS', label: 'In progress' },
    { key: 'TODO', label: 'To do' },
    { key: 'IN_REVIEW', label: 'In review' },
    { key: 'BLOCKED', label: 'Blocked' },
    { key: 'COMPLETED', label: 'Completed' },
  ].map((group) => ({
    ...group,
    tasks: tasks.filter((task) => task.status === group.key),
  })).filter((group) => group.tasks.length > 0), [tasks]);

  return (
    <AppShell org={org} user={user}>
      <div className={styles.page}>
        <NavLink to="/projects" className={styles.backLink}><ArrowLeft size={14} /> All projects</NavLink>

        {loading ? (
          <div className={styles.loadingState}>Loading project details…</div>
        ) : error ? (
          <div className={styles.errorState} role="alert">
            <strong>{error}</strong>
            <button type="button" onClick={load}>Try again</button>
          </div>
        ) : project ? (
          <>
            <header className={styles.projectHeader}>
              <div className={styles.projectIdentity}>
                <span className={styles.eyebrow}>Project</span>
                <div className={styles.titleLine}>
                  <h1>{project.name}</h1>
                  <span className={`${styles.projectStatus} ${styles[`project${project.status}`]}`}>{PROJECT_STATUS[project.status] || project.status}</span>
                </div>
                <p>{project.description || 'No project description has been added.'}</p>
              </div>
              <div className={styles.headerArtwork} aria-hidden="true">
                <svg viewBox="0 0 170 125" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M92 15C110 8 133 15 145 31C157 48 149 71 134 83C119 96 96 91 84 76C73 62 74 22 92 15Z" fill="#D9C9B8" fillOpacity=".52" />
                  <path d="M29 95C35 79 51 72 66 78C79 83 85 96 83 108H24C23 104 25 99 29 95Z" fill="#B8BFAF" fillOpacity=".6" />
                  <rect x="48" y="37" width="56" height="43" rx="4" fill="#FFFDF8" stroke="#D9D5CC" />
                  <path d="M57 49H90M57 58H96M57 67H79" stroke="#B69D89" strokeWidth="1.7" strokeLinecap="round" />
                  <circle cx="119" cy="49" r="9" stroke="#64745F" strokeWidth="1.4" />
                  <path d="M115 49L118 52L123 46" stroke="#64745F" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M22 109H151" stroke="#737A76" strokeOpacity=".3" strokeLinecap="round" />
                </svg>
              </div>
            </header>

            <section className={styles.projectFacts} aria-label="Project overview">
              <div className={styles.factItem}>
                <span className={styles.factIcon}><FolderKanban size={15} /></span>
                <span><small>Tasks</small><strong>{tasksError ? 'Unavailable' : tasks.length}</strong></span>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factIcon}><CheckCircle2 size={15} /></span>
                <span><small>Completed</small><strong>{tasksError ? 'Unavailable' : completedCount}</strong></span>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factIcon}><CalendarDays size={15} /></span>
                <span><small>Target date</small><strong>{formatDate(project.target_end_date)}</strong></span>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factIcon}><Users size={15} /></span>
                <span><small>Team</small><strong>{teamName || 'Cross-functional'}</strong></span>
              </div>
            </section>

            <div className={styles.contentGrid}>
              <section className={styles.tasksSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span className={styles.sectionEyebrow}>Delivery</span>
                    <h2>Project tasks</h2>
                  </div>
                  {!tasksError && <span className={styles.taskTotal}>{tasks.length} total</span>}
                </div>

                {!tasksError && tasks.length > 0 && (
                  <div className={styles.progressSummary}>
                    <div className={styles.progressTrack}><span style={{ width: `${progress}%` }} /></div>
                    <strong>{progress}% complete</strong>
                  </div>
                )}

                {tasksError ? (
                  <div className={styles.inlineError} role="status">{tasksError}</div>
                ) : tasks.length === 0 ? (
                  <div className={styles.emptyTasks}>
                    <FolderKanban size={20} />
                    <strong>No tasks in this project</strong>
                    <span>Tasks added to the project will appear here.</span>
                  </div>
                ) : (
                  <div className={styles.taskGroups}>
                    {taskGroups.map((group) => (
                      <section className={styles.taskGroup} key={group.key}>
                        <h3>{group.label}<span>{group.tasks.length}</span></h3>
                        {group.tasks.map((task) => <TaskRow key={task.id} task={task} />)}
                      </section>
                    ))}
                  </div>
                )}
                <section className={styles.discussionSection}>
                  <div className={styles.sectionHeading}>
                    <div>
                      <span className={styles.sectionEyebrow}>Conversation</span>
                      <h2>Recent discussion</h2>
                    </div>
                    <span className={styles.discussionHint}>On recently updated tasks</span>
                  </div>
                  <RecentDiscussion comments={discussion} error={discussionError} />
                </section>
              </section>

              <aside className={styles.membersSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span className={styles.sectionEyebrow}>People</span>
                    <h2>Project team</h2>
                  </div>
                  {!membersError && <span className={styles.taskTotal}>{members.length}</span>}
                </div>
                <ProjectMembers members={members} error={membersError} />
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
