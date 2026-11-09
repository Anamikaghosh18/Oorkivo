import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Circle, Clock3, FolderKanban, Users, Plus, ChevronDown, Activity as ActivityIcon, UserPlus, FileText, Eye, Pencil, Trash2, Bold, Italic, Code, Link, List, Search, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import OverlayDetailShell from '../components/layout/OverlayDetailShell';
import Avatar from '../components/Avatar';
import TimelineGanttView from '../components/timeline/TimelineGanttView';
import OrganizationMemberSelector from '../components/OrganizationMemberSelector';
import { selectCurrentOrganization } from '../utils/organizationContext';
import { authApi, organizationsApi, projectsApi, tasksApi } from '../services/api';
import styles from './ProjectDetail.module.css';

const PROJECT_STATUS = {
  PLANNING: 'Planning',
  ACTIVE: 'In progress',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
};

const TASK_STATUS = {
  BACKLOG: 'Backlog',
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

function ProjectMembers({ members, error }) {
  if (error) return <p className={styles.inlineError}>{error}</p>;
  if (!members.length) return <p className={styles.quietMessage}>No project members are available.</p>;
  return (
    <ul className={styles.memberList}>
      {members.map((membership, index) => (
        <li className={styles.member} key={membership.id ?? index}>
          <Avatar user={membership.user} size={29} />
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

function RecentDiscussion({ comments, error, taskLinkState }) {
  if (error) return <p className={styles.inlineError}>{error}</p>;
  if (!comments.length) return <p className={styles.quietMessage}>No comments on recently updated tasks.</p>;
  return (
    <ol className={styles.discussionList}>
      {comments.map(({ comment, task }) => (
        <li className={styles.discussionItem} key={`${task.id}-${comment.id}`}>
          <Avatar user={comment.author} size={29} />
          <div className={styles.discussionContent}>
            <div className={styles.discussionMeta}>
              <strong>{fullName(comment.author)}</strong>
              <time>{new Date(comment.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</time>
            </div>
            <p>{comment.content}</p>
            <NavLink to={`/tasks/${task.id}`} state={taskLinkState}>{task.title}</NavLink>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TaskRow({ task, taskLinkState }) {
  return (
    <NavLink className={styles.taskRow} to={`/tasks/${task.id}`} state={taskLinkState}>
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

function ActivityFeed({ items, tasks, error, taskLinkState }) {
  if (error) return <p className={styles.inlineError}>{error}</p>;
  if (!items.length) return <p className={styles.quietMessage}>Project updates will appear here as work moves forward.</p>;
  const taskById = new Map(tasks.map((task) => [String(task.id), task]));
  const eventText = (event) => {
    const task = taskById.get(String(event.task));
    const details = event.details || {};
    if (event.action === 'STATUS_CHANGED') return `changed status from ${TASK_STATUS[details.old] || details.old} to ${TASK_STATUS[details.new] || details.new}`;
    if (event.action === 'PRIORITY_CHANGED') return `changed priority from ${details.old} to ${details.new}`;
    if (event.action === 'ASSIGNED') return 'updated the task assignment';
    if (event.action === 'DUE_DATE_CHANGED') return 'updated the due date';
    if (event.action === 'COMMENTED') return 'added a comment';
    if (event.action === 'MILESTONE_COMPLETED') return `completed milestone “${details.milestone_title}”`;
    if (event.action === 'MEMBER_ADDED') {
      return details.team_name
        ? `added a member to the ${details.team_name} team`
        : 'added a project member';
    }
    if (event.action === 'MEMBER_REMOVED') {
      return details.team_name
        ? `removed a member from the ${details.team_name} team`
        : 'removed a project member';
    }
    if (event.action === 'SPRINT_CREATED') return `created sprint “${details.sprint_name}”`;
    if (event.action === 'SPRINT_STARTED') return `started sprint “${details.sprint_name}”`;
    if (event.action === 'SPRINT_COMPLETED') return `completed sprint “${details.sprint_name}”`;
    if (event.action === 'TASK_MOVED_TO_SPRINT') return details.new_sprint_name ? `moved a task to “${details.new_sprint_name}”` : 'moved a task to the backlog';
    if (event.action === 'COMPLETED') return 'completed a task';
    if (event.action === 'CREATED' && details.parent_task_title) return `added a subtask to “${details.parent_task_title}”`;
    return 'created a task';
  };
  return (
    <ol className={styles.activityList}>
      {items.map((item) => (
        <li className={styles.activityItem} key={item.id}>
          <span className={styles.activityMarker}><ActivityIcon size={13} /></span>
          <div>
            <p><strong>{fullName(item.actor)}</strong> {eventText(item)}{taskById.get(String(item.task)) && <> · <NavLink to={`/tasks/${item.task}`} state={taskLinkState}>{taskById.get(String(item.task)).title}</NavLink></>}</p>
            <time>{new Date(item.created_at).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const hasBackground = Boolean(location.state?.backgroundLocation);
  const taskLinkState = { backgroundLocation: location };
  const closeDetail = () => {
    if (hasBackground) navigate(-1);
    else navigate('/projects', { replace: true });
  };
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [organizationMembers, setOrganizationMembers] = useState([]);
  const [selectedProjectMemberIds, setSelectedProjectMemberIds] = useState([]);
  const [memberRole, setMemberRole] = useState('CONTRIBUTOR');
  const [memberFormOpen, setMemberFormOpen] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');
  const [organizationMembersError, setOrganizationMembersError] = useState('');
  const [discussion, setDiscussion] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [activity, setActivity] = useState([]);
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [backlogSearch, setBacklogSearch] = useState('');
  const [backlogPriority, setBacklogPriority] = useState('ALL');
  const [backlogStatus, setBacklogStatus] = useState('ALL');
  const [sprintForm, setSprintForm] = useState({ name: '', goal: '', start_date: '', end_date: '' });
  const [editingSprintId, setEditingSprintId] = useState(null);
  const [sprintError, setSprintError] = useState('');
  const [sprintSaving, setSprintSaving] = useState(false);
  const [sprintActionError, setSprintActionError] = useState('');
  const [sprintFormOpen, setSprintFormOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState('MINE');
  const [openMilestone, setOpenMilestone] = useState(null);
  const [milestoneForm, setMilestoneForm] = useState({ title: '', description: '', target_date: '', tasks: [] });
  const [milestoneSaving, setMilestoneSaving] = useState(false);
  const [milestoneError, setMilestoneError] = useState('');
  const [teamName, setTeamName] = useState('');
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tasksError, setTasksError] = useState('');
  const [membersError, setMembersError] = useState('');
  const [discussionError, setDiscussionError] = useState('');
  const [milestonesError, setMilestonesError] = useState('');
  const [activityError, setActivityError] = useState('');
  const [documents, setDocuments] = useState([]);
  const [documentForm, setDocumentForm] = useState({ id: null, title: '', content: '' });
  const [documentEditorOpen, setDocumentEditorOpen] = useState(false);
  const [documentPreviewMode, setDocumentPreviewMode] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [documentVersions, setDocumentVersions] = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const [documentSearch, setDocumentSearch] = useState('');
  const [tableOfContents, setTableOfContents] = useState([]);
  const documentTextareaRef = useRef(null);
  const loadRequest = useRef(0);

  const insertMarkdown = (prefix, suffix = '') => {
    const textarea = documentTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const selected = text.substring(start, end);
    const after = text.substring(end);
    const newText = before + prefix + selected + suffix + after;
    setDocumentForm((form) => ({ ...form, content: newText }));
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length + suffix.length);
  };

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    const isCurrent = () => loadRequest.current === requestId;
    setLoading(true);
    setError('');
    setTasksError('');
    setMembersError('');
    setOrganizationMembersError('');
    setDiscussionError('');
    setMilestonesError('');
    setActivityError('');
    setMilestoneError('');
    setDiscussion([]);
    setMilestones([]);
    setActivity([]);
    setSprints([]);
    try {
      const userResult = await authApi.me();
      if (!isCurrent()) return;
      const userOrg = selectCurrentOrganization(userResult.data);
      const projectResult = await projectsApi.get(id);
      if (!isCurrent()) return;
      const loadedProject = projectResult.data;
      setProject(loadedProject);
      setUser(userResult.data);
      const projectOrgId = loadedProject.organization?.id ?? loadedProject.organization;
      const currentOrg = String(userOrg?.id) === String(projectOrgId) ? userOrg : null;
      setOrg(currentOrg);

      const [tasksResult, membersResult, teamsResult] = await Promise.allSettled([
        projectsApi.tasks(id),
        projectsApi.members(id),
        currentOrg?.id ? organizationsApi.teams(currentOrg.id) : Promise.resolve({ data: [] }),
      ]);
      if (!isCurrent()) return;
      if (currentOrg?.id) {
        try {
          const organizationMembersResult = await organizationsApi.members(currentOrg.id);
          if (!isCurrent()) return;
          setOrganizationMembers(getRows(organizationMembersResult.data).filter(
            (membership) => membership.status === 'ACTIVE' && membership.is_active !== false,
          ));
        } catch (organizationMembersError) {
          if (!isCurrent()) return;
          setOrganizationMembers([]);
          setOrganizationMembersError('Organization members could not be loaded, so project members cannot be added.');
        }
      } else {
        setOrganizationMembers([]);
      }
      const [milestonesResult, activityResult, sprintsResult, documentsResult] = await Promise.allSettled([
        projectsApi.milestones(id),
        projectsApi.activity(id),
        projectsApi.sprints(id),
        projectsApi.documents(id),
      ]);
      if (!isCurrent()) return;
      if (milestonesResult.status === 'fulfilled') setMilestones(getRows(milestonesResult.value.data));
      else setMilestonesError('Project milestones could not be loaded.');
      if (activityResult.status === 'fulfilled') setActivity(getRows(activityResult.value.data));
      else setActivityError('Project activity could not be loaded.');
      if (sprintsResult.status === 'fulfilled') setSprints(getRows(sprintsResult.value.data));
      else setSprintActionError('Project sprints could not be loaded.');
      if (documentsResult.status === 'fulfilled') setDocuments(getRows(documentsResult.value.data));
      else setDocumentError('Project documents could not be loaded.');
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
        if (!isCurrent()) return;
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
      if (!isCurrent()) return;
      const status = loadError.response?.status;
      if (status === 404) setError('This project could not be found.');
      else if (status === 401) setError('Your session has expired. Please log in again.');
      else if (status === 403) setError('You do not have permission to view this project.');
      else setError('Project details could not be loaded. Please try again.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    authApi.preferences().then(({ data }) => {
      if (active && ['OVERVIEW', 'TASKS', 'ACTIVITY'].includes(data.default_project_view)) {
        setActiveTab(data.default_project_view);
      }
    }).catch((preferenceError) => {
      console.error('Unable to load project view preferences.', preferenceError);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    load();
    return () => { loadRequest.current += 1; };
  }, [load]);

  const completedCount = tasks.filter((task) => task.status === 'COMPLETED').length;
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const myTaskCount = tasks.filter((task) => String(task.assigned_to?.id) === String(user?.id)).length;
  const filteredTasks = tasks.filter((task) => {
    if (taskFilter === 'MINE') return String(task.assigned_to?.id) === String(user?.id);
    if (taskFilter === 'DUE_SOON') {
      if (!task.due_date || task.status === 'COMPLETED') return false;
      const days = Math.ceil((new Date(`${task.due_date}T00:00:00`) - new Date(new Date().toDateString())) / 86400000);
      return days >= 0 && days <= 7;
    }
    if (taskFilter === 'OVERDUE') {
      return Boolean(task.due_date && task.status !== 'COMPLETED' && new Date(`${task.due_date}T00:00:00`) < new Date(new Date().toDateString()));
    }
    if (taskFilter === 'COMPLETED') return task.status === 'COMPLETED';
    return true;
  });
  const taskGroups = useMemo(() => [
    { key: 'BACKLOG', label: 'Backlog' },
    { key: 'IN_PROGRESS', label: 'In progress' },
    { key: 'TODO', label: 'To do' },
    { key: 'IN_REVIEW', label: 'In review' },
    { key: 'BLOCKED', label: 'Blocked' },
    { key: 'COMPLETED', label: 'Completed' },
  ].map((group) => ({
    ...group,
    tasks: filteredTasks.filter((task) => task.status === group.key),
  })).filter((group) => group.tasks.length > 0), [filteredTasks]);
  const timelineEvents = useMemo(() => {
    const entries = [];
    if (project?.start_date) entries.push({ date: project.start_date, label: 'Project started' });
    milestones.forEach((milestone) => {
      if (milestone.target_date) entries.push({ date: milestone.target_date, label: milestone.title });
    });
    tasks.filter((task) => task.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 3)
      .forEach((task) => entries.push({ date: task.due_date, label: `${task.title} due` }));
    if (project?.target_end_date) entries.push({ date: project.target_end_date, label: 'Project deadline' });
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }, [project, milestones, tasks]);
  const canManageMilestones = members.some((membership) =>
    String(membership.user?.id) === String(user?.id) &&
    ['MANAGER', 'CONTRIBUTOR'].includes(membership.role)
  ) || Boolean(org?.permissions?.can_manage_members);
  const canManageSprints = members.some((membership) =>
    String(membership.user?.id) === String(user?.id) && membership.role === 'MANAGER'
  ) || Boolean(org?.permissions?.can_manage_members);
  const canManageProject = members.some((membership) =>
    String(membership.user?.id) === String(user?.id) && membership.role === 'MANAGER'
  ) || Boolean(org?.permissions?.can_manage_members);
  const addProjectMember = async (event) => {
    event.preventDefault();
    if (!canManageProject) return;
    setMemberSaving(true);
    setAddMemberError('');
    try {
      const currentByUser = new Map(members.map((membership) => [
        String(membership.user?.id ?? membership.user),
        membership,
      ]));
      const selected = new Set(selectedProjectMemberIds.map(String));
      const toAdd = selectedProjectMemberIds.filter((userId) => !currentByUser.has(String(userId)));
      const toRemove = members.filter((membership) =>
        !selected.has(String(membership.user?.id ?? membership.user)));
      const results = await Promise.allSettled([
        ...toAdd.map((userId) => projectsApi.addMember(id, {
          user_id: Number(userId),
          role: memberRole,
        })),
        ...toRemove.map((membership) => projectsApi.removeMember(id, membership.id)),
      ]);
      if (results.some((result) => result.status === 'rejected')) {
        const refreshedMembers = await projectsApi.members(id);
        setMembers(getRows(refreshedMembers.data));
        throw new Error('Some project member changes could not be applied. Review the selected members and save again.');
      }
      const updatedMembers = await projectsApi.members(id);
      setMembers(getRows(updatedMembers.data));
      const updatedActivity = await projectsApi.activity(id);
      setActivity(getRows(updatedActivity.data));
      setMemberFormOpen(false);
      setSelectedProjectMemberIds([]);
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setAddMemberError(typeof detail === 'string' ? detail : (requestError.message || 'Could not update project members.'));
    } finally {
      setMemberSaving(false);
    }
  };
  const backlogTasks = tasks.filter((task) => !task.sprint).filter((task) => {
    const query = backlogSearch.trim().toLocaleLowerCase();
    return (backlogPriority === 'ALL' || task.priority === backlogPriority)
      && (backlogStatus === 'ALL' || task.status === backlogStatus)
      && (!query || `${task.title} ${task.description} ${task.assigned_to?.first_name ?? ''} ${task.assigned_to?.last_name ?? ''}`.toLocaleLowerCase().includes(query));
  }).sort((a, b) => (a.backlog_order ?? 0) - (b.backlog_order ?? 0));

  const handleCreateMilestone = async (event) => {
    event.preventDefault();
    if (!milestoneForm.title.trim()) return;
    setMilestoneSaving(true);
    setMilestoneError('');
    try {
      const response = await projectsApi.createMilestone(id, {
        ...milestoneForm,
        title: milestoneForm.title.trim(),
        target_date: milestoneForm.target_date || null,
        tasks: milestoneForm.tasks.map(Number),
      });
      setMilestones((current) => [...current, response.data].sort((a, b) => (a.target_date || '').localeCompare(b.target_date || '')));
      setMilestoneForm({ title: '', description: '', target_date: '', tasks: [] });
    } catch (saveError) {
      const detail = saveError.response?.data?.detail;
      setMilestoneError(typeof detail === 'string' ? detail : 'Milestone could not be saved. Check your access and try again.');
    } finally {
      setMilestoneSaving(false);
    }
  };

  const handleSaveSprint = async (event) => {
    event.preventDefault();
    setSprintError('');
    setSprintSaving(true);
    const payload = {
      ...sprintForm,
      name: sprintForm.name.trim(),
      start_date: sprintForm.start_date,
      end_date: sprintForm.end_date,
    };
    try {
      const response = editingSprintId
        ? await projectsApi.updateSprint(id, editingSprintId, payload)
        : await projectsApi.createSprint(id, payload);
      setSprints((current) => {
        const next = editingSprintId
          ? current.map((sprint) => sprint.id === editingSprintId ? response.data : sprint)
          : [response.data, ...current];
        return next.sort((a, b) => b.start_date.localeCompare(a.start_date));
      });
      setSprintForm({ name: '', goal: '', start_date: '', end_date: '' });
      setEditingSprintId(null);
      setSprintFormOpen(false);
    } catch (saveError) {
      const detail = saveError.response?.data?.detail;
      setSprintError(typeof detail === 'string' ? detail : 'Sprint could not be saved. Check the dates and your permissions.');
    } finally {
      setSprintSaving(false);
    }
  };

  const editSprint = (sprint) => {
    setEditingSprintId(sprint.id);
    setSprintForm({
      name: sprint.name,
      goal: sprint.goal || '',
      start_date: sprint.start_date,
      end_date: sprint.end_date,
    });
    setSprintFormOpen(true);
  };

  const changeSprintStatus = async (sprint, action) => {
    setSprintActionError('');
    try {
      const response = action === 'start'
        ? await projectsApi.startSprint(id, sprint.id)
        : await projectsApi.completeSprint(id, sprint.id);
      setSprints((current) => current.map((item) => item.id === sprint.id ? response.data : item));
      const history = await projectsApi.activity(id);
      setActivity(getRows(history.data));
    } catch (statusError) {
      const detail = statusError.response?.data?.detail;
      setSprintActionError(typeof detail === 'string' ? detail : 'Sprint status could not be changed. Check that no other sprint is active.');
    }
  };

  const moveTask = async (task, sprintValue) => {
    setSprintActionError('');
    try {
      const response = await tasksApi.update(task.id, { sprint_id: sprintValue ? Number(sprintValue) : null });
      setTasks((current) => current.map((item) => item.id === task.id ? {
        ...item,
        ...response.data,
        sprint: sprintValue ? sprints.find((sprint) => String(sprint.id) === sprintValue) : null,
      } : item));
    } catch (moveError) {
      const detail = moveError.response?.data?.detail;
      setSprintActionError(typeof detail === 'string' ? detail : 'Task could not be moved. Only the assignee or project manager can move it.');
    }
  };

  const canManageDocuments = members.some((membership) =>
    String(membership.user?.id) === String(user?.id) &&
    ['MANAGER', 'CONTRIBUTOR'].includes(membership.role)
  ) || Boolean(org?.permissions?.can_manage_members);

  const openDocument = async (document) => {
    setDocumentForm({
      id: document.id,
      title: document.title,
      content: document.content,
    });
    setDocumentPreviewMode(false);
    setDocumentEditorOpen(true);
    setDocumentVersions([]);
    setShowVersions(false);
    if (document.id) {
      try {
        const response = await projectsApi.documentVersions(id, document.id);
        setDocumentVersions(response.data);
      } catch (err) {
        console.error('Failed to load versions', err);
      }
    }
  };

  const closeDocument = () => {
    setDocumentForm({ id: null, title: '', content: '' });
    setDocumentPreviewMode(false);
    setDocumentEditorOpen(false);
    setDocumentError('');
  };

  const createDocument = () => {
    setDocumentForm({ id: null, title: '', content: '' });
    setDocumentPreviewMode(false);
    setDocumentEditorOpen(true);
  };

  const saveDocument = async (event) => {
    event.preventDefault();
    if (!documentForm.title.trim()) return;
    setDocumentSaving(true);
    setDocumentError('');
    try {
      let response;
      if (documentForm.id) {
        response = await projectsApi.updateDocument(id, documentForm.id, {
          title: documentForm.title,
          content: documentForm.content,
        });
        setDocuments((current) => current.map((doc) => doc.id === documentForm.id ? response.data : doc));
      } else {
        response = await projectsApi.createDocument(id, {
          title: documentForm.title,
          content: documentForm.content,
        });
        setDocuments((current) => [response.data, ...current]);
      }
      const history = await projectsApi.activity(id);
      setActivity(getRows(history.data));
      closeDocument();
    } catch (saveError) {
      const detail = saveError.response?.data?.detail;
      setDocumentError(typeof detail === 'string' ? detail : 'Document could not be saved. Check your permissions.');
    } finally {
      setDocumentSaving(false);
    }
  };

  const deleteDocument = async (documentId) => {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    setDocumentSaving(true);
    setDocumentError('');
    try {
      await projectsApi.deleteDocument(id, documentId);
      setDocuments((current) => current.filter((doc) => doc.id !== documentId));
      const history = await projectsApi.activity(id);
      setActivity(getRows(history.data));
      closeDocument();
    } catch (deleteError) {
      const detail = deleteError.response?.data?.detail;
      setDocumentError(typeof detail === 'string' ? detail : 'Document could not be deleted. Check your permissions.');
    } finally {
      setDocumentSaving(false);
    }
  };

  const togglePin = async (document) => {
    try {
      const response = await projectsApi.pinDocument(id, document.id);
      setDocuments((current) => current.map((doc) => doc.id === document.id ? response.data : doc));
    } catch (err) {
      console.error('Failed to pin document', err);
    }
  };

  const revertToVersion = async (version) => {
    if (!confirm(`Revert to version from ${new Date(version.created_at).toLocaleString()}?`)) return;
    setDocumentSaving(true);
    setDocumentError('');
    try {
      const response = await projectsApi.updateDocument(id, documentForm.id, {
        title: version.title,
        content: version.content,
        change_summary: `Reverted to version from ${new Date(version.created_at).toLocaleString()}`,
      });
      setDocumentForm({
        id: response.data.id,
        title: response.data.title,
        content: response.data.content,
      });
      const versionsResponse = await projectsApi.documentVersions(id, response.data.id);
      setDocumentVersions(versionsResponse.data);
      const history = await projectsApi.activity(id);
      setActivity(getRows(history.data));
    } catch (err) {
      const detail = err.response?.data?.detail;
      setDocumentError(typeof detail === 'string' ? detail : 'Failed to revert version.');
    } finally {
      setDocumentSaving(false);
    }
  };

  return (
    <OverlayDetailShell
      centerTitle="Project workspace"
      ariaLabel="Project details"
      onClose={closeDetail}
      backLabel="Back to projects"
    >
      <div className={styles.detailScroller}>
      <div className={styles.page}>
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
              <span className={styles.projectMark} aria-hidden="true">
                <FolderKanban size={21} />
              </span>
              <div className={styles.projectIdentity}>
                <span className={styles.eyebrow}>Project</span>
                <div className={styles.titleLine}>
                  <h1>{project.name}</h1>
                  <span className={`${styles.projectStatus} ${styles[`project${project.status}`]}`}>{PROJECT_STATUS[project.status] || project.status}</span>
                </div>
                <p>{project.description || 'No project description has been added.'}</p>
              </div>
            </header>

            <nav className={styles.projectTabs} aria-label="Project workspace sections" role="tablist">
              {[
                ['OVERVIEW', 'Overview'],
                ['BACKLOG', 'Backlog'],
                ['SPRINTS', 'Sprints'],
                ['TASKS', 'Tasks'],
                ['TIMELINE', 'Timeline'],
                ['ACTIVITY', 'Activity'],
                ['DOCS', 'Docs'],
              ].map(([key, label]) => (
                <button key={key} id={`project-tab-${key.toLowerCase()}`} type="button" role="tab" aria-selected={activeTab === key} aria-controls={`project-panel-${key.toLowerCase()}`} className={activeTab === key ? styles.projectTabActive : ''} onClick={() => setActiveTab(key)}>
                  {label}
                  {key === 'BACKLOG' && <span>{tasks.filter((task) => !task.sprint).length}</span>}
                  {key === 'SPRINTS' && <span>{sprints.length}</span>}
                </button>
              ))}
            </nav>

            {activeTab === 'OVERVIEW' && <section className={styles.projectFacts} aria-label="Project overview">
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
                <span className={styles.factIcon}><CalendarDays size={15} /></span>
                <span><small>Start date</small><strong>{formatDate(project.start_date)}</strong></span>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factIcon}><Users size={15} /></span>
                <span><small>Team</small><strong>{teamName || 'Cross-functional'}</strong></span>
              </div>
              <div className={styles.factItem}>
                <span className={styles.factIcon}><Circle size={15} /></span>
                <span><small>Your tasks</small><strong>{myTaskCount}</strong></span>
              </div>
            </section>}

            {activeTab === 'OVERVIEW' && <section className={styles.roadmapGrid} aria-label="Project roadmap and timeline">
              <div className={styles.roadmapSection}>
                <div className={styles.sectionHeading}>
                  <div><span className={styles.sectionEyebrow}>Project roadmap</span><h2>Milestones</h2></div>
                  <span className={styles.taskTotal}>{milestones.length}</span>
                </div>
                {milestonesError ? (
                  <p className={styles.inlineError}>{milestonesError}</p>
                ) : milestones.length ? (
                  <ol className={styles.milestoneList}>
                    {milestones.map((milestone) => {
                      const milestoneTasks = tasks.filter((task) => milestone.tasks?.some((taskId) => String(taskId) === String(task.id)));
                      return (
                        <li key={milestone.id}>
                          <button type="button" className={styles.milestoneButton} onClick={() => setOpenMilestone(openMilestone === milestone.id ? null : milestone.id)} aria-expanded={openMilestone === milestone.id}>
                            <span className={styles.milestoneName}><strong>{milestone.title}</strong><small>{milestone.target_date ? formatDate(milestone.target_date) : 'No target date'}</small></span>
                            <span className={styles.milestoneProgress}><span style={{ width: `${milestone.completion}%` }} /></span>
                            <span className={styles.milestonePercent}>{milestone.completion}%</span>
                            <ChevronDown size={15} className={openMilestone === milestone.id ? styles.chevronOpen : ''} />
                          </button>
                          {openMilestone === milestone.id && (
                            <div className={styles.milestoneDetails}>
                              {milestone.description && <p>{milestone.description}</p>}
                              {milestoneTasks.length
                                ? milestoneTasks.map((task) => <NavLink key={task.id} to={`/tasks/${task.id}`} state={taskLinkState}>{task.title}<small>{TASK_STATUS[task.status] || task.status}</small></NavLink>)
                                : <span>No tasks are linked to this milestone.</span>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                ) : <p className={styles.quietMessage}>Milestones will make the project’s next delivery points clear.</p>}

                {canManageMilestones && (
                  <details className={styles.milestoneCreate}>
                    <summary><Plus size={14} /> Add milestone</summary>
                    <form onSubmit={handleCreateMilestone}>
                      <label>Title<input required value={milestoneForm.title} onChange={(event) => setMilestoneForm((form) => ({ ...form, title: event.target.value }))} maxLength={255} /></label>
                      <label>Description<textarea value={milestoneForm.description} onChange={(event) => setMilestoneForm((form) => ({ ...form, description: event.target.value }))} rows={2} /></label>
                      <label>Target date<input type="date" value={milestoneForm.target_date} onChange={(event) => setMilestoneForm((form) => ({ ...form, target_date: event.target.value }))} /></label>
                      <label>Associated tasks<select multiple value={milestoneForm.tasks} onChange={(event) => setMilestoneForm((form) => ({ ...form, tasks: Array.from(event.target.selectedOptions, (option) => option.value) }))}>
                        {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                      </select></label>
                      {milestoneError && <p className={styles.inlineError} role="alert">{milestoneError}</p>}
                      <button type="submit" disabled={milestoneSaving}>{milestoneSaving ? 'Saving…' : 'Save milestone'}</button>
                    </form>
                  </details>
                )}
              </div>

              <div className={styles.timelineSection}>
                <div className={styles.sectionHeading}>
                  <div><span className={styles.sectionEyebrow}>Key dates</span><h2>Project timeline</h2></div>
                </div>
                {timelineEvents.length
                  ? <ol className={styles.projectTimeline}>{timelineEvents.map((event, index) => <li key={`${event.date}-${event.label}-${index}`}><time>{formatDate(event.date)}</time><span>{event.label}</span></li>)}</ol>
                  : <p className={styles.quietMessage}>Project dates and milestone targets will appear here.</p>}
              </div>
            </section>}

            {activeTab === 'OVERVIEW' && <div className={styles.contentGrid}>
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
                {!tasksError && (
                  <nav className={styles.taskFilters} aria-label="Filter project tasks">
                    {[
                      ['ALL', 'All'],
                      ['MINE', `Assigned to me · ${myTaskCount}`],
                      ['DUE_SOON', 'Due soon'],
                      ['OVERDUE', 'Overdue'],
                      ['COMPLETED', 'Completed'],
                    ].map(([value, label]) => <button type="button" key={value} className={taskFilter === value ? styles.taskFilterActive : ''} aria-pressed={taskFilter === value} onClick={() => setTaskFilter(value)}>{label}</button>)}
                  </nav>
                )}
                {tasksError ? (
                  <div className={styles.inlineError} role="status">{tasksError}</div>
                ) : tasks.length === 0 ? (
                  <div className={styles.emptyTasks}><FolderKanban size={20} /><strong>No tasks in this project</strong><span>Tasks added to the project will appear here.</span></div>
                ) : filteredTasks.length === 0 ? (
                  <div className={styles.emptyTasks}><FolderKanban size={20} /><strong>No tasks match this filter</strong><span>Choose another view to see more project work.</span></div>
                ) : (
                  <div className={styles.taskGroups}>
                    {taskGroups.map((group) => (
                      <section className={styles.taskGroup} key={group.key}>
                        <h3>{group.label}<span>{group.tasks.length}</span></h3>
                        {group.tasks.map((task) => <TaskRow key={task.id} task={task} taskLinkState={taskLinkState} />)}
                      </section>
                    ))}
                  </div>
                )}
                <section className={styles.discussionSection}>
                  <div className={styles.sectionHeading}>
                    <div><span className={styles.sectionEyebrow}>Conversation</span><h2>Recent discussion</h2></div>
                    <span className={styles.discussionHint}>On recently updated tasks</span>
                  </div>
                  <RecentDiscussion comments={discussion} error={discussionError} taskLinkState={taskLinkState} />
                </section>
              </section>
              <aside className={styles.membersSection}>
                <div className={styles.sectionHeading}>
                  <div><span className={styles.sectionEyebrow}>People</span><h2>Project team</h2></div>
                  <div className={styles.memberHeadingActions}>
                    {!membersError && <span className={styles.taskTotal}>{members.length}</span>}
                    {canManageProject && (
                      <button
                        type="button"
                        className={styles.addProjectMemberButton}
                        onClick={() => {
                          setAddMemberError('');
                          setSelectedProjectMemberIds(members.map((membership) =>
                            String(membership.user?.id ?? membership.user)));
                          setMemberFormOpen((open) => !open);
                        }}
                          disabled={Boolean(organizationMembersError)}
                      >
                        <UserPlus size={14} /> Add member
                      </button>
                    )}
                  </div>
                </div>
                {memberFormOpen && canManageProject && (
                  <form className={styles.addProjectMemberForm} onSubmit={addProjectMember}>
                    <OrganizationMemberSelector
                      organizationId={org?.id}
                      members={organizationMembers}
                      selectedIds={selectedProjectMemberIds}
                      onChange={setSelectedProjectMemberIds}
                      label="Project members"
                      canInvite={Boolean(org?.permissions?.can_manage_members)}
                      canInviteAdmins={Boolean(org?.permissions?.can_manage_organization)}
                      disabled={memberSaving}
                    />
                    <label>
                      Role for newly added members
                      <select value={memberRole} onChange={(event) => setMemberRole(event.target.value)}>
                        <option value="CONTRIBUTOR">Contributor</option>
                        <option value="MANAGER">Manager</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    </label>
                    <button type="submit" disabled={memberSaving}>
                      {memberSaving ? 'Saving…' : 'Save members'}
                    </button>
                  </form>
                )}
                {organizationMembersError && <p className={styles.inlineError} role="alert">{organizationMembersError}</p>}
                {addMemberError && <p className={styles.inlineError} role="alert">{addMemberError}</p>}
                <ProjectMembers members={members} error={membersError} />
                <section className={styles.activitySection}>
                  <div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>What changed</span><h2>Recent activity</h2></div></div>
                  <ActivityFeed items={activity} tasks={tasks} error={activityError} taskLinkState={taskLinkState} />
                </section>
              </aside>
            </div>}

            {activeTab === 'BACKLOG' && <section className={styles.workspacePanel} id="project-panel-backlog" role="tabpanel" aria-labelledby="project-tab-backlog">
              <div className={styles.sectionHeading}>
                <div><span className={styles.sectionEyebrow}>Unscheduled work</span><h2>Backlog</h2></div>
                <span className={styles.taskTotal}>{backlogTasks.length} tasks</span>
              </div>
              <div className={styles.backlogFilters}>
                <input type="search" value={backlogSearch} onChange={(event) => setBacklogSearch(event.target.value)} placeholder="Search backlog" aria-label="Search backlog" />
                <select value={backlogPriority} onChange={(event) => setBacklogPriority(event.target.value)} aria-label="Filter backlog by priority">
                  <option value="ALL">All priorities</option>
                  {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select value={backlogStatus} onChange={(event) => setBacklogStatus(event.target.value)} aria-label="Filter backlog by status">
                  <option value="ALL">All statuses</option>
                  {Object.entries(TASK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              {sprintActionError && <p className={styles.inlineError} role="alert">{sprintActionError}</p>}
              {tasksError ? <p className={styles.inlineError}>{tasksError}</p> : backlogTasks.length ? (
                <ul className={styles.backlogList}>
                  {backlogTasks.map((task) => (
                    <li key={task.id}>
                      <NavLink to={`/tasks/${task.id}`} state={taskLinkState}><span className={`${styles.backlogPriority} ${styles[`priority${task.priority}`]}`}><i />{PRIORITY[task.priority] || task.priority}</span><strong>{task.title}</strong><small>{fullName(task.assigned_to)} · {TASK_STATUS[task.status] || task.status}</small></NavLink>
                      {(canManageSprints || String(task.assigned_to?.id) === String(user?.id)) && (
                        <select value="" onChange={(event) => moveTask(task, event.target.value)} aria-label={`Move ${task.title} to sprint`}>
                          <option value="">Move to sprint…</option>
                          {sprints.filter((sprint) => sprint.status !== 'COMPLETED').map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <div className={styles.emptyTasks}><FolderKanban size={20} /><strong>{tasks.length ? 'No backlog tasks match these filters' : 'The backlog is clear'}</strong><span>Unassigned-sprint project tasks will appear here.</span></div>}
            </section>}

            {activeTab === 'SPRINTS' && <section className={styles.workspacePanel} id="project-panel-sprints" role="tabpanel" aria-labelledby="project-tab-sprints">
              <div className={styles.sectionHeading}>
                <div><span className={styles.sectionEyebrow}>Iterations</span><h2>Project sprints</h2></div>
                <div className={styles.sprintHeaderActions}>
                  <span className={styles.taskTotal}>{sprints.length} sprints</span>
                  {canManageSprints && <button type="button" className={styles.sprintFormToggle} onClick={() => {
                    setSprintError('');
                    setEditingSprintId(null);
                    setSprintForm({ name: '', goal: '', start_date: '', end_date: '' });
                    setSprintFormOpen(true);
                  }}><Plus size={14} /> Create sprint</button>}
                </div>
              </div>
              {sprintActionError && <p className={styles.inlineError} role="alert">{sprintActionError}</p>}
              {sprints.length ? <div className={styles.sprintList}>
                {sprints.map((sprint) => {
                  const sprintTasks = tasks.filter((task) => String(task.sprint?.id) === String(sprint.id));
                  const complete = sprintTasks.filter((task) => task.status === 'COMPLETED').length;
                  const blocked = sprintTasks.filter((task) => task.status === 'BLOCKED').length;
                  const percent = sprintTasks.length ? Math.round((complete / sprintTasks.length) * 100) : 0;
                  return <article className={styles.sprintCard} key={sprint.id}>
                    <div className={styles.sprintHeading}>
                      <div><span className={styles.sectionEyebrow}>Sprint</span><h3>{sprint.name}</h3></div>
                      <span className={`${styles.sprintStatus} ${styles[`sprint${sprint.status}`]}`}>{sprint.status.toLowerCase()}</span>
                    </div>
                    <p className={styles.sprintDates}>{formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}</p>
                    <p className={styles.sprintGoal}>{sprint.goal || 'No sprint goal has been added.'}</p>
                    <div className={styles.sprintProgress}><span style={{ width: `${percent}%` }} /></div>
                    <div className={styles.sprintStats}>
                      <span><strong>{sprintTasks.length}</strong> tasks</span>
                      <span><strong>{complete}</strong> completed</span>
                      <span><strong>{sprintTasks.length - complete}</strong> remaining</span>
                      <span className={blocked ? styles.blockedCount : ''}><strong>{blocked}</strong> blocked</span>
                    </div>
                    {sprintTasks.length > 0 && <details className={styles.sprintTasks}>
                      <summary>View sprint tasks</summary>
                      {sprintTasks.map((task) => <div key={task.id} className={styles.sprintTaskRow}><NavLink to={`/tasks/${task.id}`} state={taskLinkState}>{task.title}<small>{TASK_STATUS[task.status] || task.status}</small></NavLink>{(canManageSprints || String(task.assigned_to?.id) === String(user?.id)) && <button type="button" onClick={() => moveTask(task, '')}>Move to backlog</button>}</div>)}
                    </details>}
                    {canManageSprints && <div className={styles.sprintActions}>
                      <button type="button" onClick={() => editSprint(sprint)}>Edit</button>
                      {sprint.status === 'PLANNED' && <button type="button" onClick={() => changeSprintStatus(sprint, 'start')}>Start sprint</button>}
                      {sprint.status === 'ACTIVE' && <button type="button" onClick={() => changeSprintStatus(sprint, 'complete')}>Complete sprint</button>}
                    </div>}
                  </article>;
                })}
              </div> : <div className={styles.emptyTasks}><FolderKanban size={20} /><strong>No sprints yet</strong><span>Plan an iteration for this project’s upcoming work.</span></div>}
              {sprintFormOpen && createPortal(
                <div className={styles.sprintModalBackdrop} role="presentation" onMouseDown={(event) => {
                  if (event.target === event.currentTarget && !sprintSaving) setSprintFormOpen(false);
                }}>
                  <section className={styles.sprintModal} role="dialog" aria-modal="true" aria-labelledby="sprint-modal-title">
                    <div className={styles.sprintFormHeading}>
                      <div><span className={styles.sectionEyebrow}>{editingSprintId ? 'Update iteration' : 'Plan project work'}</span><h3 id="sprint-modal-title">{editingSprintId ? 'Edit sprint' : 'Create sprint'}</h3></div>
                      <button type="button" className={styles.sprintFormClose} aria-label="Close sprint form" disabled={sprintSaving} onClick={() => setSprintFormOpen(false)}>×</button>
                    </div>
                    <form onSubmit={handleSaveSprint} className={styles.sprintForm}>
                      <label className={styles.sprintNameField}>Sprint name<input required maxLength={255} value={sprintForm.name} onChange={(event) => setSprintForm((form) => ({ ...form, name: event.target.value }))} placeholder="e.g. Sprint 1" /></label>
                      <label>Start date<input required type="date" value={sprintForm.start_date} onChange={(event) => setSprintForm((form) => ({ ...form, start_date: event.target.value }))} /></label>
                      <label>End date<input required type="date" min={sprintForm.start_date || undefined} value={sprintForm.end_date} onChange={(event) => setSprintForm((form) => ({ ...form, end_date: event.target.value }))} /></label>
                      <label className={styles.sprintGoalField}>Sprint goal<textarea rows={3} value={sprintForm.goal} onChange={(event) => setSprintForm((form) => ({ ...form, goal: event.target.value }))} placeholder="What should the team accomplish?" /></label>
                      {sprintError && <p className={styles.inlineError} role="alert">{sprintError}</p>}
                      <div className={styles.sprintFormActions}><button type="button" className={styles.sprintCancel} disabled={sprintSaving} onClick={() => setSprintFormOpen(false)}>Cancel</button><button type="submit" disabled={sprintSaving || !sprintForm.name.trim() || !sprintForm.start_date || !sprintForm.end_date}>{sprintSaving ? 'Saving…' : editingSprintId ? 'Save changes' : 'Create sprint'}</button></div>
                    </form>
                  </section>
                </div>,
                document.body,
              )}
            </section>}

            {activeTab === 'TASKS' && <section className={styles.workspacePanel} id="project-panel-tasks" role="tabpanel" aria-labelledby="project-tab-tasks">
              <div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Delivery</span><h2>Project tasks</h2></div><span className={styles.taskTotal}>{tasks.length} total</span></div>
              {!tasksError && <nav className={styles.taskFilters} aria-label="Filter project tasks">{[['ALL', 'All'], ['MINE', `Assigned to me · ${myTaskCount}`], ['DUE_SOON', 'Due soon'], ['OVERDUE', 'Overdue'], ['COMPLETED', 'Completed']].map(([value, label]) => <button type="button" key={value} className={taskFilter === value ? styles.taskFilterActive : ''} aria-pressed={taskFilter === value} onClick={() => setTaskFilter(value)}>{label}</button>)}</nav>}
              {tasksError ? <p className={styles.inlineError}>{tasksError}</p> : <div className={styles.taskGroups}>{taskGroups.map((group) => <section className={styles.taskGroup} key={group.key}><h3>{group.label}<span>{group.tasks.length}</span></h3>{group.tasks.map((task) => <TaskRow key={task.id} task={task} taskLinkState={taskLinkState} />)}</section>)}</div>}
            </section>}

            {activeTab === 'TIMELINE' && <section className={styles.workspacePanel} id="project-panel-timeline" role="tabpanel" aria-labelledby="project-tab-timeline">
              <div className={styles.sectionHeading}>
                <div><span className={styles.sectionEyebrow}>Roadmap & Dependencies</span><h2>Interactive Timeline & Gantt</h2></div>
                <span className={styles.taskTotal}>{tasks.length} tasks · {milestones.length} milestones · {sprints.length} sprints</span>
              </div>
              <TimelineGanttView
                tasks={tasks}
                sprints={sprints}
                milestones={milestones}
                project={project}
                onTaskClick={(task) => navigate(`/tasks/${task.id}`, { state: taskLinkState })}
              />
            </section>}

            {activeTab === 'ACTIVITY' && <section className={styles.workspacePanel} id="project-panel-activity" role="tabpanel" aria-labelledby="project-tab-activity">
              <div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Project history</span><h2>Recent activity</h2></div></div>
              <ActivityFeed items={activity} tasks={tasks} error={activityError} taskLinkState={taskLinkState} />
              <section className={styles.discussionSection}><div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Conversation</span><h2>Recent discussion</h2></div></div><RecentDiscussion comments={discussion} error={discussionError} taskLinkState={taskLinkState} /></section>
            </section>}

            {activeTab === 'DOCS' && <section className={styles.workspacePanel} id="project-panel-docs" role="tabpanel" aria-labelledby="project-tab-docs">
              <div className={styles.sectionHeading}>
                <div><span className={styles.sectionEyebrow}>Knowledge</span><h2>Project documents</h2></div>
                {canManageDocuments && <button type="button" className={styles.primaryButton} onClick={createDocument}><Plus size={14} /> New document</button>}
              </div>
              <div className={styles.documentSearch}>
                <input type="search" value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Search documents..." />
              </div>
              {documentError && <p className={styles.inlineError} role="alert">{documentError}</p>}
              {documentEditorOpen ? (
                <div className={styles.documentEditor}>
                  <div className={styles.documentEditorHeader}>
                    <div className={styles.documentEditorTitle}>
                      <input value={documentForm.title} onChange={(event) => setDocumentForm((form) => ({ ...form, title: event.target.value }))} placeholder="Document title" maxLength={255} disabled={!canManageDocuments} />
                      <div className={styles.documentEditorActions}>
                        {documentForm.id && <button type="button" onClick={() => setShowVersions((prev) => !prev)} className={styles.secondaryButton}>{showVersions ? 'Hide versions' : 'View history'}</button>}
                        {canManageDocuments && <button type="button" onClick={() => setDocumentPreviewMode((prev) => !prev)} className={styles.secondaryButton}>{documentPreviewMode ? <Pencil size={14} /> : <Eye size={14} />}{documentPreviewMode ? 'Edit' : 'Preview'}</button>}
                        {canManageDocuments && documentForm.id && <button type="button" onClick={() => deleteDocument(documentForm.id)} className={styles.dangerButton}><Trash2 size={14} /> Delete</button>}
                        <button type="button" onClick={closeDocument} className={styles.secondaryButton}>Cancel</button>
                        {canManageDocuments && <button type="button" onClick={saveDocument} disabled={documentSaving} className={styles.primaryButton}>{documentSaving ? 'Saving…' : 'Save'}</button>}
                      </div>
                    </div>
                  </div>
                  {showVersions && documentVersions.length > 0 && (
                    <div className={styles.versionHistory}>
                      <h4>Version history</h4>
                      <ul>
                        {documentVersions.map((version) => (
                          <li key={version.id}>
                            <div>
                              <strong>{new Date(version.created_at).toLocaleString()}</strong>
                              <small>by {fullName(version.created_by)}</small>
                            </div>
                            {version.change_summary && <p>{version.change_summary}</p>}
                            <button type="button" onClick={() => revertToVersion(version)} className={styles.secondaryButton}>Revert to this version</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {documentPreviewMode ? (
                    <div className={styles.documentPreviewContainer}>
                      {tableOfContents.length > 0 && (
                        <aside className={styles.tableOfContents}>
                          <h4><BookOpen size={14} /> Contents</h4>
                          <ul>
                            {tableOfContents.map((item, index) => (
                              <li key={index} style={{ marginLeft: `${item.level * 12}px` }}>
                                <a href={`#${item.id}`}>{item.text}</a>
                              </li>
                            ))}
                          </ul>
                        </aside>
                      )}
                      <div className={styles.documentPreview}><ReactMarkdown remarkPlugins={[remarkGfm]}>{documentForm.content}</ReactMarkdown></div>
                    </div>
                  ) : (
                    <div className={styles.documentEditorWithToolbar}>
                      <div className={styles.markdownToolbar}>
                        <button type="button" onClick={() => insertMarkdown('**', '**')} title="Bold"><Bold size={14} /></button>
                        <button type="button" onClick={() => insertMarkdown('*', '*')} title="Italic"><Italic size={14} /></button>
                        <button type="button" onClick={() => insertMarkdown('`', '`')} title="Code"><Code size={14} /></button>
                        <button type="button" onClick={() => insertMarkdown('[', '](url)')} title="Link"><Link size={14} /></button>
                        <button type="button" onClick={() => insertMarkdown('\n- ')} title="List"><List size={14} /></button>
                        <button type="button" onClick={() => insertMarkdown('\n## ')} title="Heading"><Search size={14} /></button>
                      </div>
                      <textarea ref={documentTextareaRef} value={documentForm.content} onChange={(event) => setDocumentForm((form) => ({ ...form, content: event.target.value }))} placeholder="Write Markdown here..." disabled={!canManageDocuments} />
                    </div>
                  )}
                </div>
              ) : documents.filter((doc) => !documentSearch || doc.title.toLowerCase().includes(documentSearch.toLowerCase())).length ? (
                <ul className={styles.documentList}>
                  {documents.filter((doc) => !documentSearch || doc.title.toLowerCase().includes(documentSearch.toLowerCase())).map((document) => (
                    <li key={document.id}>
                      <button type="button" onClick={() => openDocument(document)} className={styles.documentCard}>
                        <span className={styles.documentIcon}><FileText size={16} /></span>
                        <div className={styles.documentInfo}>
                          <strong>{document.title}{document.is_pinned && ' 📌'}</strong>
                          <small>Updated {new Date(document.updated_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })} by {fullName(document.updated_by)}</small>
                        </div>
                        {canManageDocuments && <button type="button" onClick={(e) => { e.stopPropagation(); togglePin(document); }} className={styles.pinButton} title={document.is_pinned ? 'Unpin' : 'Pin'}>{document.is_pinned ? '📌' : '📌'}</button>}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <div className={styles.emptyTasks}><FileText size={20} /><strong>{documents.length ? 'No matching documents' : 'No documents yet'}</strong><span>{documents.length ? 'Try a different search term.' : 'Project specifications and RFCs will appear here.'}</span></div>}
            </section>}
          </>
        ) : null}
      </div>
      </div>
    </OverlayDetailShell>
  );
}
