import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Archive,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Columns3,
  FolderKanban,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Plus,
  Rows3,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Avatar from '../components/Avatar';
import DropdownSelect from '../components/DropdownSelect';
import OrganizationMemberSelector from '../components/OrganizationMemberSelector';
import { useDashboard } from '../hooks/useDashboard';
import { authApi, organizationsApi, projectsApi, tasksApi, teamsApi } from '../services/api';
import styles from './Tasks.module.css';

const STATUS_META = {
  BACKLOG: { label: 'Backlog', className: 'backlog' },
  TODO: { label: 'To do', className: 'todo' },
  IN_PROGRESS: { label: 'In progress', className: 'inProgress' },
  IN_REVIEW: { label: 'In review', className: 'inReview' },
  COMPLETED: { label: 'Done', className: 'completed' },
  BLOCKED: { label: 'Blocked', className: 'blocked' },
};

const PRIORITY_META = {
  URGENT: { label: 'Urgent', className: 'urgent' },
  HIGH: { label: 'High', className: 'high' },
  MEDIUM: { label: 'Medium', className: 'medium' },
  LOW: { label: 'Low', className: 'low' },
};

const BOARD_STATUSES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'];
const TASK_VIEWS = [
  ['MY_WORK', 'My Work'],
  ['SPRINTS', 'Sprint'],
  ['BACKLOG', 'Backlog'],
];

function getRows(data) {
  const rows = data?.results ?? data;
  return Array.isArray(rows) ? rows : [];
}

function getErrorMessage(error, fallback = 'The request could not be completed.') {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

function formatDate(value, options = { month: 'short', day: 'numeric' }) {
  if (!value) return 'No due date';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en', options);
}

function isOverdue(task) {
  if (!task.due_date || task.status === 'COMPLETED') return false;
  const due = new Date(`${task.due_date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function isDueToday(task) {
  if (!task.due_date || task.status === 'COMPLETED') return false;
  const today = new Date();
  const due = new Date(`${task.due_date}T00:00:00`);
  return due.toDateString() === today.toDateString();
}

function isDueSoon(task) {
  if (!task.due_date || task.status === 'COMPLETED' || isOverdue(task)) return false;
  if (isDueToday(task)) return true;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return new Date(`${task.due_date}T00:00:00`).toDateString() === tomorrow.toDateString();
}

function isUpcoming(task) {
  return Boolean(task.due_date)
    && task.status !== 'COMPLETED'
    && !isOverdue(task)
    && !isDueToday(task);
}

function dueLabel(task) {
  if (!task.due_date) return 'No due date';
  if (task.status === 'COMPLETED') return `Due ${formatDate(task.due_date)}`;
  if (isOverdue(task)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(`${task.due_date}T00:00:00`) - today) / 86400000);
    return `${Math.abs(days)}d overdue`;
  }
  if (isDueToday(task)) return 'Due today';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (new Date(`${task.due_date}T00:00:00`).toDateString() === tomorrow.toDateString()) return 'Due tomorrow';
  return `Due ${formatDate(task.due_date)}`;
}

function fullName(person) {
  return [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim()
    || person?.email
    || 'Unassigned';
}

function initials(person) {
  if (!person) return '—';
  const name = fullName(person);
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function StatusLabel({ value }) {
  const meta = STATUS_META[value] ?? { label: value || 'Unknown', className: 'todo' };
  return <span className={`${styles.statusLabel} ${styles[meta.className]}`}>{meta.label}</span>;
}

function PriorityLabel({ value }) {
  const meta = PRIORITY_META[value] ?? { label: value || 'Medium', className: 'medium' };
  return <span className={`${styles.priorityLabel} ${styles[meta.className]}`}><i />{meta.label}</span>;
}

function TaskLink({ task, children, className, linkState }) {
  return <NavLink to={`/tasks/${task.id}`} state={linkState} className={className}>{children}</NavLink>;
}

function EmptyState({ title, detail }) {
  return (
    <div className={styles.emptyState}>
      <ListTodo size={20} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function TaskActions({ task, canEdit, canArchive, onEdit, onArchive }) {
  const [open, setOpen] = useState(false);
  if (!canEdit && !canArchive) return null;
  return (
    <details className={styles.taskActions} open={open} onToggle={(event) => setOpen(event.currentTarget.open)} onClick={(event) => event.stopPropagation()}>
      <summary aria-label={`Actions for ${task.title}`}><MoreHorizontal size={16} /></summary>
      <div>
        {canEdit && <button type="button" onClick={() => { setOpen(false); onEdit(task); }}><Pencil size={13} /> Edit task</button>}
        {canArchive && <button type="button" className={styles.archiveTaskAction} onClick={() => { setOpen(false); onArchive(task); }}><Archive size={13} /> Archive task</button>}
      </div>
    </details>
  );
}

export default function Tasks() {
  const { user, org, loading: workspaceLoading } = useDashboard();
  const navigate = useNavigate();
  const location = useLocation();
  const taskLinkState = { backgroundLocation: location };
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [projectMembers, setProjectMembers] = useState({});
  const [teamMembers, setTeamMembers] = useState({});
  const [organizationMembers, setOrganizationMembers] = useState([]);
  const [assigneeLoadError, setAssigneeLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [permissionWarning, setPermissionWarning] = useState(false);
  const [workspaceView, setWorkspaceView] = useState('MY_WORK');
  const [layoutView, setLayoutView] = useState('LIST');
  const [myWorkFilter, setMyWorkFilter] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [sprintFilter, setSprintFilter] = useState('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');
  const [dueFilter, setDueFilter] = useState('ALL');
  const [quickView, setQuickView] = useState('ALL');
  const [sortBy, setSortBy] = useState('DUE_DATE');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [dragTargetStatus, setDragTargetStatus] = useState('');
  const [savedViews, setSavedViews] = useState([]);
  const [savedViewName, setSavedViewName] = useState('');
  const [savedViewError, setSavedViewError] = useState('');
  const [savedViewsLoading, setSavedViewsLoading] = useState(false);
  const [backlogSearch, setBacklogSearch] = useState('');
  const [backlogPriority, setBacklogPriority] = useState('ALL');
  const [backlogAssignee, setBacklogAssignee] = useState('ALL');
  const [backlogSort, setBacklogSort] = useState('PRIORITY');
  const [selectedSprintId, setSelectedSprintId] = useState(null);
  const [sprintActionError, setSprintActionError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [sprintFormOpen, setSprintFormOpen] = useState(false);
  const [sprintSaving, setSprintSaving] = useState(false);
  const [sprintError, setSprintError] = useState('');
  const [newSprint, setNewSprint] = useState({ name: '', start_date: '', end_date: '', goal: '' });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [newTask, setNewTask] = useState({
    projectId: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    status: 'TODO',
    assigned_to: '',
    due_date: '',
    sprintId: '',
  });

  useEffect(() => {
    if (workspaceLoading) return undefined;
    if (!org) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    authApi.preferences().then(({ data }) => {
      if (active && ['LIST', 'BOARD'].includes(data.default_task_view)) {
        setLayoutView(data.default_task_view);
      }
    }).catch((preferenceError) => {
      if (active) setActionError(getErrorMessage(preferenceError, 'Could not load task preferences.'));
    });
    return () => { active = false; };
  }, [workspaceLoading, org?.id]);

  useEffect(() => {
    if (!org?.id) {
      setOrganizationMembers([]);
      setAssigneeLoadError('');
      return undefined;
    }
    let active = true;
    organizationsApi.members(org.id).then(({ data }) => {
      if (!active) return;
      setOrganizationMembers(getRows(data).filter((membership) =>
        membership.status === 'ACTIVE' && membership.is_active !== false));
      setAssigneeLoadError('');
    }).catch((membersError) => {
      if (!active) return;
      setAssigneeLoadError(getErrorMessage(membersError, 'Organization members could not be loaded for assignment.'));
    });
    return () => { active = false; };
  }, [org?.id]);

  useEffect(() => {
    if (workspaceLoading) return undefined;
    if (!org?.id) {
      setProjects([]);
      setTasks([]);
      setSprints([]);
      setProjectMembers({});
      setTeamMembers({});
      setLoading(false);
      return undefined;
    }
    let active = true;
    setProjects([]);
    setTasks([]);
    setSprints([]);
    setProjectMembers({});
    setTeamMembers({});

    async function loadWorkspace() {
      setLoading(true);
      setError('');
      try {
        const projectsResponse = await projectsApi.list();
        const loadedProjects = getRows(projectsResponse.data);
        if (!active) return;
        setProjects(loadedProjects);

        const teamIds = [...new Set(loadedProjects
          .map((project) => project.team?.id ?? project.team)
          .filter((teamId) => teamId != null)
          .map(String))];
        const [taskResults, sprintResults, memberResults, teamMemberResults] = await Promise.all([
          Promise.allSettled(loadedProjects.map(async (project) => {
            const response = await tasksApi.list(project.id);
            return getRows(response.data).map((task) => ({
              ...task,
              project: task.project ?? { id: project.id, name: project.name },
            }));
          })),
          Promise.allSettled(loadedProjects.map((project) => projectsApi.sprints(project.id))),
          Promise.allSettled(loadedProjects.map((project) => projectsApi.members(project.id))),
          Promise.allSettled(teamIds.map((teamId) => teamsApi.members(teamId))),
        ]);
        if (!active) return;

        const loadedTasks = [];
        const failedProjects = [];
        taskResults.forEach((result, index) => {
          if (result.status === 'fulfilled') loadedTasks.push(...result.value);
          else failedProjects.push(loadedProjects[index]?.name ?? 'A project');
        });
        setTasks(loadedTasks);
        setSprints(sprintResults.flatMap((result, index) => result.status === 'fulfilled'
          ? getRows(result.value.data).map((sprint) => ({
            ...sprint,
            project: loadedProjects[index] ? { id: loadedProjects[index].id, name: loadedProjects[index].name } : null,
          }))
          : []));
        const memberMap = {};
        let membersUnavailable = false;
        memberResults.forEach((result, index) => {
          if (result.status === 'fulfilled') memberMap[String(loadedProjects[index].id)] = getRows(result.value.data);
          else membersUnavailable = true;
        });
        setProjectMembers(memberMap);
        const teamMemberMap = {};
        teamMemberResults.forEach((result, index) => {
          if (result.status === 'fulfilled') teamMemberMap[teamIds[index]] = getRows(result.value.data);
        });
        setTeamMembers(teamMemberMap);
        setPermissionWarning(membersUnavailable);
        if (failedProjects.length) setError(`Could not load tasks from: ${failedProjects.join(', ')}.`);
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError, 'Could not load tasks for your projects.'));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadWorkspace();
    return () => { active = false; };
  }, [workspaceLoading, org?.id]);

  useEffect(() => {
    let active = true;
    tasksApi.savedViews().then((response) => {
      if (active) setSavedViews(getRows(response.data));
    }).catch(() => {
      if (active) setSavedViewError('Saved views could not be loaded.');
    });
    return () => { active = false; };
  }, []);

  const canManageProject = (projectId) => (
    Boolean(org?.permissions?.can_manage_members)
    || (projectMembers[String(projectId)] ?? []).some((membership) =>
      String(membership.user?.id) === String(user?.id) && membership.role === 'MANAGER')
  );
  const isProjectManager = (projectId) => (
    (projectMembers[String(projectId)] ?? []).some((membership) =>
      String(membership.user?.id) === String(user?.id) && membership.role === 'MANAGER')
  );
  const canManageTask = (task) => canManageProject(task.project?.id) || isProjectManager(task.project?.id);
  const canEditTask = (task) => canManageTask(task) || String(task.assigned_to?.id) === String(user?.id);
  const manageableProjects = projects.filter((project) => canManageProject(project.id));
  const canCreateTask = manageableProjects.length > 0
    || Boolean(org?.permissions?.can_manage_members);
  const taskFormProjects = useMemo(() => {
    if (!editingTask?.project) return manageableProjects;
    const currentId = String(editingTask.project.id ?? editingTask.project);
    if (manageableProjects.some((project) => String(project.id) === currentId)) return manageableProjects;
    return [{ id: editingTask.project.id ?? editingTask.project, name: editingTask.project.name ?? 'Current project' }, ...manageableProjects];
  }, [editingTask, manageableProjects]);
  const createTaskAssignees = useMemo(() => {
    const project = projects.find((item) => String(item.id) === String(newTask.projectId));
    const teamId = project?.team?.id ?? project?.team;
    const eligibleIds = new Set([
      ...(projectMembers[newTask.projectId] ?? [])
        .filter((membership) => membership.role !== 'VIEWER')
        .map((membership) => String(membership.user?.id ?? membership.user)),
      ...(teamMembers[String(teamId)] ?? []).map((membership) => String(membership.user?.id ?? membership.user)),
    ]);
    if (editingTask?.assigned_to?.id != null) eligibleIds.add(String(editingTask.assigned_to.id));
    return organizationMembers
      .filter((membership) => eligibleIds.has(String(membership.user?.id ?? membership.user)))
      .sort((a, b) => fullName(a.user).localeCompare(fullName(b.user)));
  }, [projectMembers, teamMembers, projects, newTask.projectId, organizationMembers, editingTask]);

  useEffect(() => {
    if (!newTask.projectId && manageableProjects.length) {
      setNewTask((current) => ({ ...current, projectId: String(manageableProjects[0].id) }));
    }
  }, [manageableProjects.length]);

  const myTasks = tasks;
  const myActiveTasks = myTasks.filter((task) => task.status !== 'COMPLETED');
  const myDueToday = myActiveTasks.filter(isDueToday);
  const myOverdue = myActiveTasks.filter(isOverdue);
  const completedCount = myTasks.filter((task) => task.status === 'COMPLETED').length;

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const result = tasks.filter((task) => {
      const mine = String(task.assigned_to?.id) === String(user?.id);
      const matchesQuickView = quickView === 'ALL'
        || (quickView === 'MY_TASKS' && mine)
        || (quickView === 'TODAY' && isDueToday(task))
        || (quickView === 'UPCOMING' && isUpcoming(task))
        || (quickView === 'OVERDUE' && isOverdue(task))
        || (quickView === 'HIGH_PRIORITY' && ['HIGH', 'URGENT'].includes(task.priority))
        || (quickView === 'CURRENT_SPRINT' && task.sprint?.status === 'ACTIVE')
        || (quickView === 'BLOCKED' && task.status === 'BLOCKED');
      const matchesStatus = statusFilter === 'ALL' || task.status === statusFilter;
      const matchesPriority = priorityFilter === 'ALL' || task.priority === priorityFilter;
      const matchesProject = projectFilter === 'ALL' || String(task.project?.id) === projectFilter;
      const matchesSprint = sprintFilter === 'ALL'
        || (sprintFilter === 'BACKLOG' ? !task.sprint : String(task.sprint?.id) === sprintFilter);
      const matchesAssignee = assigneeFilter === 'ALL'
        || (assigneeFilter === 'UNASSIGNED' && !task.assigned_to)
        || (assigneeFilter === 'ME' && mine)
        || String(task.assigned_to?.id) === assigneeFilter;
      const matchesDue = dueFilter === 'ALL'
        || (dueFilter === 'TODAY' && isDueToday(task))
        || (dueFilter === 'UPCOMING' && isUpcoming(task))
        || (dueFilter === 'OVERDUE' && isOverdue(task))
        || (dueFilter === 'NONE' && !task.due_date);
      const matchesQuery = !query || [
        task.title,
        task.description,
        task.project?.name,
        task.assigned_to?.first_name,
        task.assigned_to?.last_name,
      ].some((value) => value?.toLocaleLowerCase().includes(query));
      return matchesQuickView && matchesStatus && matchesPriority && matchesProject
        && matchesSprint && matchesAssignee && matchesDue && matchesQuery;
    });
    const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...result].sort((a, b) => {
      if (sortBy === 'TITLE') return a.title.localeCompare(b.title);
      if (sortBy === 'PRIORITY') return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
      if (sortBy === 'STATUS') return (BOARD_STATUSES.indexOf(a.status) - BOARD_STATUSES.indexOf(b.status));
      return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
    });
  }, [tasks, search, statusFilter, priorityFilter, projectFilter, sprintFilter, assigneeFilter, dueFilter, quickView, sortBy, user?.id]);

  const visibleMyTasks = useMemo(() => {
    const filtered = filteredTasks;
    if (myWorkFilter === 'TODAY') return filtered.filter(isDueToday);
    if (myWorkFilter === 'UPCOMING') return filtered.filter(isUpcoming);
    if (myWorkFilter === 'OVERDUE') return filtered.filter(isOverdue);
    if (myWorkFilter === 'COMPLETED') return filtered.filter((task) => task.status === 'COMPLETED');
    return filtered.filter((task) => task.status !== 'COMPLETED');
  }, [myTasks, myActiveTasks, myWorkFilter, filteredTasks]);

  const backlogTasks = useMemo(() => {
    const query = backlogSearch.trim().toLocaleLowerCase();
    const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return tasks.filter((task) => !task.sprint)
      .filter((task) => backlogPriority === 'ALL' || task.priority === backlogPriority)
      .filter((task) => backlogAssignee === 'ALL'
        || (backlogAssignee === 'UNASSIGNED' && !task.assigned_to)
        || (backlogAssignee === 'ME' && String(task.assigned_to?.id) === String(user?.id))
        || String(task.assigned_to?.id) === backlogAssignee)
      .filter((task) => !query || `${task.title} ${task.project?.name ?? ''} ${fullName(task.assigned_to)}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => {
        if (backlogSort === 'TITLE') return a.title.localeCompare(b.title);
        if (backlogSort === 'DUE_DATE') return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
        return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
      });
  }, [tasks, backlogSearch, backlogPriority, backlogAssignee, backlogSort, user?.id]);

  const selectedSprint = sprints.find((sprint) => String(sprint.id) === String(selectedSprintId));
  const selectedSprintTasks = selectedSprint
    ? tasks.filter((task) => String(task.sprint?.id) === String(selectedSprint.id))
    : [];
  const assigneeOptions = useMemo(() => Array.from(new Map(
    tasks.filter((task) => task.assigned_to).map((task) => [
      String(task.assigned_to.id),
      { value: String(task.assigned_to.id), label: fullName(task.assigned_to) },
    ]),
  ).values()), [tasks]);

  const applySavedView = (savedView) => {
    const filters = savedView.filters || {};
    setWorkspaceView('LIST');
    setQuickView(filters.quick_view || 'ALL');
    setStatusFilter(filters.status?.length === 1 ? filters.status[0] : 'ALL');
    setPriorityFilter(filters.priority?.length === 1 ? filters.priority[0] : 'ALL');
    setProjectFilter(filters.project ? String(filters.project) : 'ALL');
    setSprintFilter(filters.sprint ? String(filters.sprint) : 'ALL');
    setAssigneeFilter(filters.assignee === 'me' ? 'ME' : filters.assignee ? String(filters.assignee) : 'ALL');
    setDueFilter(filters.due_date?.toUpperCase() ?? 'ALL');
  };

  const handleSaveView = async (event) => {
    event.preventDefault();
    if (!savedViewName.trim()) return;
    setSavedViewError('');
    setSavedViewsLoading(true);
    const filters = {};
    if (statusFilter !== 'ALL') filters.status = [statusFilter];
    if (priorityFilter !== 'ALL') filters.priority = [priorityFilter];
    if (projectFilter !== 'ALL') filters.project = Number(projectFilter);
    if (sprintFilter !== 'ALL' && sprintFilter !== 'BACKLOG') filters.sprint = Number(sprintFilter);
    if (assigneeFilter === 'ME') filters.assignee = 'me';
    else if (assigneeFilter !== 'ALL' && assigneeFilter !== 'UNASSIGNED') filters.assignee = Number(assigneeFilter);
    if (dueFilter !== 'ALL') filters.due_date = dueFilter.toLowerCase();
    if (quickView !== 'ALL') filters.quick_view = quickView;
    try {
      const response = await tasksApi.createSavedView({ name: savedViewName.trim(), filters });
      setSavedViews((current) => [...current, response.data]);
      setSavedViewName('');
    } catch (saveError) {
      setSavedViewError(getErrorMessage(saveError, 'Could not save this view.'));
    } finally {
      setSavedViewsLoading(false);
    }
  };

  const handleDeleteSavedView = async (savedViewId) => {
    setSavedViewError('');
    try {
      await tasksApi.deleteSavedView(savedViewId);
      setSavedViews((current) => current.filter((savedView) => savedView.id !== savedViewId));
    } catch (deleteError) {
      setSavedViewError(getErrorMessage(deleteError, 'Could not delete this view.'));
    }
  };

  const updateTask = async (task, payload) => {
    setActionError('');
    try {
      const response = await tasksApi.update(task.id, payload);
      setTasks((current) => current.map((item) => item.id === task.id
        ? { ...response.data, project: response.data.project ?? task.project }
        : item));
      return true;
    } catch (updateError) {
      setActionError(getErrorMessage(updateError, 'Could not update this task.'));
      return false;
    }
  };

  const openCreateTask = () => {
    setEditingTask(null);
    setCreateError('');
    setSprintFormOpen(false);
    setSprintError('');
    setNewSprint({ name: '', start_date: '', end_date: '', goal: '' });
    setNewTask({
      projectId: String(manageableProjects[0]?.id ?? ''),
      title: '', description: '', priority: 'MEDIUM', status: 'TODO',
      assigned_to: '', due_date: '', sprintId: '',
    });
    setCreateOpen(true);
  };

  const openEditTask = (task) => {
    if (!canEditTask(task)) return;
    setEditingTask(task);
    setCreateError('');
    setSprintFormOpen(false);
    setSprintError('');
    setNewSprint({ name: '', start_date: '', end_date: '', goal: '' });
    setNewTask({
      projectId: String(task.project?.id ?? task.project ?? ''),
      title: task.title ?? '',
      description: task.description ?? '',
      priority: task.priority ?? 'MEDIUM',
      status: task.status ?? 'TODO',
      assigned_to: String(task.assigned_to?.id ?? ''),
      due_date: task.due_date ?? '',
      sprintId: String(task.sprint?.id ?? ''),
    });
    setCreateOpen(true);
  };

  const archiveTask = async () => {
    if (!archiveTarget) return;
    setArchiveSaving(true);
    setArchiveError('');
    try {
      await tasksApi.delete(archiveTarget.id);
      setTasks((current) => current.filter((task) => task.id !== archiveTarget.id));
      setArchiveTarget(null);
    } catch (deleteError) {
      setArchiveError(getErrorMessage(deleteError, 'Could not archive this task.'));
    } finally {
      setArchiveSaving(false);
    }
  };

  const changeSprintStatus = async (sprint, action) => {
    setSprintActionError('');
    try {
      const response = action === 'start'
        ? await projectsApi.startSprint(sprint.project.id, sprint.id)
        : await projectsApi.completeSprint(sprint.project.id, sprint.id);
      setSprints((current) => current.map((item) => item.id === sprint.id ? { ...item, ...response.data } : item));
    } catch (statusError) {
      setSprintActionError(getErrorMessage(statusError, 'Sprint status could not be changed. Check that no other sprint is active.'));
    }
  };

  const createSprintForTask = async () => {
    const project = projects.find((item) => String(item.id) === newTask.projectId);
    if (!project || !canManageProject(project.id) || !newSprint.name.trim()) return;
    setSprintSaving(true);
    setSprintError('');
    try {
      const response = await projectsApi.createSprint(project.id, {
        name: newSprint.name.trim(),
        start_date: newSprint.start_date,
        end_date: newSprint.end_date,
        goal: newSprint.goal.trim(),
      });
      const sprint = {
        ...response.data,
        project: { id: project.id, name: project.name },
      };
      setSprints((current) => [sprint, ...current.filter((item) => item.id !== sprint.id)]);
      setNewTask((current) => ({ ...current, sprintId: String(sprint.id) }));
      setSprintFormOpen(false);
      setNewSprint({ name: '', start_date: '', end_date: '', goal: '' });
    } catch (requestError) {
      setSprintError(getErrorMessage(requestError, 'Could not create a sprint for this project.'));
    } finally {
      setSprintSaving(false);
    }
  };

  const handleCreateTask = async (event) => {
    event.preventDefault();
    const project = projects.find((item) => String(item.id) === newTask.projectId);
    const canSave = editingTask ? canEditTask(editingTask) : canManageProject(project?.id);
    if (!project || !canSave || !newTask.title.trim()) return;
    setCreateSaving(true);
    setCreateError('');
    try {
      const payload = {
        title: newTask.title.trim(),
        description: newTask.description.trim(),
        status: newTask.status,
        priority: newTask.priority,
        assigned_to: newTask.assigned_to ? Number(newTask.assigned_to) : null,
        due_date: newTask.due_date || null,
        sprint_id: newTask.sprintId ? Number(newTask.sprintId) : null,
      };
      const response = editingTask
        ? await tasksApi.update(editingTask.id, { ...payload, project_id: project.id })
        : await tasksApi.create(project.id, payload);
      const assignedMember = createTaskAssignees.find((member) => String(member.id) === String(newTask.assigned_to));
      const savedTask = {
        ...response.data,
        assigned_to: assignedMember ?? response.data.assigned_to ?? null,
        project: response.data.project ?? { id: project.id, name: project.name },
      };
      setTasks((current) => editingTask
        ? current.map((item) => item.id === editingTask.id ? savedTask : item)
        : [savedTask, ...current]);
      setCreateOpen(false);
      setEditingTask(null);
      setNewTask((current) => ({ ...current, title: '', description: '', priority: 'MEDIUM', status: 'TODO', assigned_to: '', due_date: '', sprintId: '' }));
    } catch (createErrorValue) {
      setCreateError(getErrorMessage(createErrorValue, 'Could not create this task. Check your project access and try again.'));
    } finally {
      setCreateSaving(false);
    }
  };

  const renderTaskFilters = () => (
    <>
      <div className={`${styles.filterControls} ${filtersOpen ? styles.filterControlsOpen : ''}`}>
        <DropdownSelect
          variant="compact"
          prefix="Status"
          value={statusFilter}
          ariaLabel="Filter tasks by status"
          options={[{ value: 'ALL', label: 'All statuses' }, ...Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))]}
          onChange={setStatusFilter}
        />
        <DropdownSelect
          variant="compact"
          prefix="Priority"
          value={priorityFilter}
          ariaLabel="Filter tasks by priority"
          options={[{ value: 'ALL', label: 'All priorities' }, ...Object.entries(PRIORITY_META).map(([value, meta]) => ({ value, label: meta.label }))]}
          onChange={setPriorityFilter}
        />
        <DropdownSelect
          variant="compact"
          prefix="Project"
          value={projectFilter}
          ariaLabel="Filter tasks by project"
          options={[{ value: 'ALL', label: 'All projects' }, ...projects.map((project) => ({ value: String(project.id), label: project.name }))]}
          onChange={setProjectFilter}
        />
        <DropdownSelect
          variant="compact"
          prefix="Sprint"
          value={sprintFilter}
          ariaLabel="Filter tasks by sprint"
          options={[{ value: 'ALL', label: 'All sprints' }, { value: 'BACKLOG', label: 'Backlog' }, ...sprints.map((sprint) => ({ value: String(sprint.id), label: `${sprint.name} · ${sprint.project?.name ?? 'Project'}` }))]}
          onChange={setSprintFilter}
        />
        <DropdownSelect
          variant="compact"
          prefix="Assignee"
          value={assigneeFilter}
          ariaLabel="Filter tasks by assignee"
          options={[{ value: 'ALL', label: 'Anyone' }, { value: 'ME', label: 'Assigned to me' }, { value: 'UNASSIGNED', label: 'Unassigned' }, ...assigneeOptions]}
          onChange={setAssigneeFilter}
        />
        <DropdownSelect
          variant="compact"
          prefix="Due"
          value={dueFilter}
          ariaLabel="Filter tasks by due date"
          options={[
            { value: 'ALL', label: 'Any due date' },
            { value: 'TODAY', label: 'Due today' },
            { value: 'UPCOMING', label: 'Upcoming' },
            { value: 'OVERDUE', label: 'Overdue' },
            { value: 'NONE', label: 'No due date' },
          ]}
          onChange={setDueFilter}
        />
        <DropdownSelect
          variant="compact"
          prefix="Sort"
          value={sortBy}
          ariaLabel="Sort tasks"
          options={[
            { value: 'DUE_DATE', label: 'Due date' },
            { value: 'PRIORITY', label: 'Priority' },
            { value: 'TITLE', label: 'Title' },
            { value: 'STATUS', label: 'Status' },
          ]}
          onChange={setSortBy}
        />
      </div>
      <button type="button" className={styles.mobileFiltersButton} onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
        <SlidersHorizontal size={15} /> Filters
      </button>
    </>
  );

  const renderCompactStatus = (task) => (
    <select
      className={styles.quickStatus}
      value={task.status}
      aria-label={`Change status for ${task.title}`}
      disabled={!canEditTask(task)}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => updateTask(task, { status: event.target.value })}
    >
      {Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
    </select>
  );

  const renderWorkRow = (task) => (
    <article className={styles.workRow} key={task.id}>
      <TaskLink task={task} linkState={taskLinkState} className={styles.workTaskTitle}>{task.title}</TaskLink>
      <div className={styles.workTaskMeta}>
        <StatusLabel value={task.status} />
        <PriorityLabel value={task.priority} />
        <span className={styles.workContext}>{task.project?.name ?? 'Project'}{task.sprint?.name ? ` · ${task.sprint.name}` : ''}</span>
        <span className={`${styles.workDue} ${isOverdue(task) ? styles.overdueText : isDueSoon(task) ? styles.dueSoon : ''}`}>{dueLabel(task)}</span>
      </div>
      {(canEditTask(task) || canManageTask(task)) && (
        <TaskActions
          task={task}
          canEdit={canEditTask(task)}
          canArchive={canManageTask(task)}
          onEdit={openEditTask}
          onArchive={(item) => { setArchiveError(''); setArchiveTarget(item); }}
        />
      )}
    </article>
  );

  const renderLayoutToggle = () => (
    <div className={styles.viewToggle} aria-label="Task layout">
      <button type="button" className={layoutView === 'LIST' ? styles.viewActive : ''} onClick={() => setLayoutView('LIST')} aria-pressed={layoutView === 'LIST'}><Rows3 size={14} /> List</button>
      <button type="button" className={layoutView === 'BOARD' ? styles.viewActive : ''} onClick={() => setLayoutView('BOARD')} aria-pressed={layoutView === 'BOARD'}><Columns3 size={14} /> Board</button>
    </div>
  );

  const renderMyWork = () => {
    const groups = myWorkFilter === 'ACTIVE'
      ? [
        { title: 'TODAY', items: visibleMyTasks.filter(isDueToday) },
        { title: 'OVERDUE', items: visibleMyTasks.filter(isOverdue) },
        { title: 'UPCOMING', items: visibleMyTasks.filter(isUpcoming) },
        { title: 'IN PROGRESS', items: visibleMyTasks.filter((task) => task.status === 'IN_PROGRESS' && !task.due_date) },
        { title: 'NO DUE DATE', items: visibleMyTasks.filter((task) => !task.due_date && task.status !== 'IN_PROGRESS') },
      ]
      : [{ title: myWorkFilter === 'COMPLETED' ? 'COMPLETED' : myWorkFilter, items: visibleMyTasks }];
    const nonEmptyGroups = groups.map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31')),
    })).filter((group) => group.items.length);
    return (
      <>
        <header className={styles.workHeader}>
          <div>
            <h2>My Work</h2>
            <p>{loading ? 'Loading your work…' : `${myActiveTasks.length} active tasks · ${myDueToday.length} due today · ${myOverdue.length} overdue`}</p>
          </div>
          <span className={styles.quietCompleted}>{completedCount} completed</span>
        </header>
        <nav className={styles.myWorkFilters} aria-label="Filter my work">
          {[
            ['ACTIVE', 'All active'],
            ['TODAY', 'Today'],
            ['UPCOMING', 'Upcoming'],
            ['OVERDUE', 'Overdue'],
            ['COMPLETED', 'Completed'],
          ].map(([value, label]) => (
            <button type="button" key={value} className={myWorkFilter === value ? styles.myWorkFilterActive : ''} onClick={() => setMyWorkFilter(value)} aria-pressed={myWorkFilter === value}>
              {label}
              {value === 'TODAY' && <span>{myDueToday.length}</span>}
              {value === 'OVERDUE' && <span>{myOverdue.length}</span>}
            </button>
          ))}
        </nav>
        <div className={styles.toolbar}>
          <label className={styles.searchBox}>
            <Search size={15} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" aria-label="Search tasks" />
          </label>
          {renderLayoutToggle()}
        </div>
        <details className={styles.advancedFilters}>
          <summary><SlidersHorizontal size={14} /> More filters</summary>
          {renderTaskFilters()}
        </details>
        {(savedViews.length > 0 || savedViewError) && (
          <details className={styles.savedViews}>
            <summary><Bookmark size={14} /> Saved views{savedViews.length > 0 && <span>{savedViews.length}</span>}</summary>
            <div className={styles.savedViewContent}>
              {savedViews.map((savedView) => (
                <div className={styles.savedViewItem} key={savedView.id}>
                  <button type="button" onClick={() => applySavedView(savedView)}>{savedView.name}</button>
                  <button type="button" aria-label={`Delete ${savedView.name}`} onClick={() => handleDeleteSavedView(savedView.id)}><Trash2 size={13} /></button>
                </div>
              ))}
              <form className={styles.saveViewForm} onSubmit={handleSaveView}>
                <input value={savedViewName} onChange={(event) => setSavedViewName(event.target.value)} placeholder="Name this view" maxLength={100} aria-label="Saved view name" />
                <button type="submit" disabled={savedViewsLoading || !savedViewName.trim()}><Bookmark size={13} /> Save current filters</button>
              </form>
              {savedViewError && <p className={styles.inlineError} role="alert">{savedViewError}</p>}
            </div>
          </details>
        )}
        {loading ? <div className={styles.stateMessage}>Loading tasks…</div> : visibleMyTasks.length
          ? layoutView === 'BOARD'
            ? renderBoard(visibleMyTasks)
            : myWorkFilter === 'ACTIVE' && !search.trim() && statusFilter === 'ALL' && priorityFilter === 'ALL' && projectFilter === 'ALL' && sprintFilter === 'ALL' && assigneeFilter === 'ALL' && dueFilter === 'ALL'
              ? <div className={styles.workGroups}>{nonEmptyGroups.map((group) => (
                <section className={styles.workGroup} key={group.title}>
                  <h3>{group.title}<span>{group.items.length}</span></h3>
                  {group.items.map(renderWorkRow)}
                </section>
              ))}</div>
              : renderList(visibleMyTasks)
          : <EmptyState title={myWorkFilter === 'COMPLETED' ? 'No completed tasks yet' : 'No tasks found'} detail={myWorkFilter === 'ACTIVE' ? 'Tasks across your projects will appear here.' : 'No tasks match this view right now.'} />}
        {!loading && <p className={styles.resultCount}>Showing {visibleMyTasks.length} of {tasks.length} tasks</p>}
      </>
    );
  };

  const renderBoard = (boardTasks = filteredTasks, showBacklogSprintMove = false, showSprintBacklogMove = false) => (
    <div className={styles.board} aria-label="Task board">
      {BOARD_STATUSES.map((status) => {
        const meta = STATUS_META[status];
        const columnTasks = boardTasks.filter((task) => task.status === status);
        const isDropTarget = dragTargetStatus === status && draggingTaskId !== null;
        return (
          <section
            className={`${styles.boardColumn} ${isDropTarget ? styles.boardColumnDropTarget : ''}`}
            key={status}
            onDragOver={(event) => { event.preventDefault(); setDragTargetStatus(status); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragTargetStatus(''); }}
            onDrop={(event) => {
              event.preventDefault();
              const task = tasks.find((item) => String(item.id) === String(draggingTaskId));
              if (task && task.status !== status && canEditTask(task)) updateTask(task, { status });
              setDraggingTaskId(null);
              setDragTargetStatus('');
            }}
          >
            <h3><span className={`${styles.columnDot} ${styles[meta.className]}`} />{meta.label}<small>{columnTasks.length}</small></h3>
            <div className={styles.boardCards}>
              {columnTasks.map((task) => (
                <article
                  className={`${styles.boardTask} ${draggingTaskId === task.id ? styles.boardTaskDragging : ''}`}
                  key={task.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open task ${task.title}`}
                  onClick={(event) => {
                    if (event.target.closest('a, button, select')) return;
                      navigate(`/tasks/${task.id}`, { state: taskLinkState });
                  }}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      navigate(`/tasks/${task.id}`, { state: taskLinkState });
                    }
                  }}
                  draggable={canEditTask(task)}
                  onDragStart={(event) => {
                    setDraggingTaskId(task.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(task.id));
                  }}
                  onDragEnd={() => { setDraggingTaskId(null); setDragTargetStatus(''); }}
                >
                  <div className={styles.boardTaskTop}>
                    <TaskLink task={task} linkState={taskLinkState} className={styles.boardTaskTitle}>{task.title}</TaskLink>
                    {renderCompactStatus(task)}
                  </div>
                  <div className={styles.boardTaskMeta}>
                    <PriorityLabel value={task.priority} />
                    <span className={styles.boardAssignee}>
                      {task.assigned_to ? <Avatar user={task.assigned_to} size={24} /> : <span className={styles.avatar} aria-hidden="true"><UserRound size={13} /></span>}
                      <span>{fullName(task.assigned_to)}</span>
                    </span>
                  </div>
                  <span className={styles.boardProject}>{task.project?.name ?? 'Project'}</span>
                  {task.due_date && <time className={isOverdue(task) ? styles.overdueText : isDueSoon(task) ? styles.dueSoon : ''}>{dueLabel(task)}</time>}
                  {showBacklogSprintMove && canEditTask(task) && <select className={styles.sprintMove} value="" aria-label={`Move ${task.title} to sprint`} onClick={(event) => event.stopPropagation()} onChange={(event) => updateTask(task, { sprint_id: event.target.value ? Number(event.target.value) : null })}>
                    <option value="">Move to sprint…</option>
                    {sprints.filter((sprint) => String(sprint.project?.id) === String(task.project?.id) && sprint.status !== 'COMPLETED').map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}
                  </select>}
                  {showSprintBacklogMove && canEditTask(task) && <button type="button" className={styles.textAction} onClick={() => updateTask(task, { sprint_id: null })}>Move to backlog</button>}
                  {(canEditTask(task) || canManageTask(task)) && (
        <TaskActions
          task={task}
          canEdit={canEditTask(task)}
          canArchive={canManageTask(task)}
          onEdit={openEditTask}
          onArchive={(item) => { setArchiveError(''); setArchiveTarget(item); }}
        />
      )}
                </article>
              ))}
              {!columnTasks.length && <p className={styles.boardEmpty}>Drop a task here</p>}
            </div>
          </section>
        );
      })}
    </div>
  );

  const renderList = (listTasks = filteredTasks, showSprintBacklogMove = false) => (
    <div className={styles.listPanel}>
      <div className={`${styles.listRow} ${styles.listHeader}`} aria-hidden="true">
        <span>Task</span><span>Status</span><span>Priority</span><span>Due</span>
      </div>
      {loading ? <div className={styles.stateMessage}>Loading tasks…</div> : listTasks.length
        ? listTasks.map((task) => (
          <div className={`${styles.listRow} ${showSprintBacklogMove ? styles.listRowWithAction : ''}`} key={task.id}>
            <div className={styles.listTask}>
              <CircleDot size={15} />
              <div><TaskLink task={task} linkState={taskLinkState} className={styles.listTaskTitle}>{task.title}</TaskLink><small>{task.project?.name ?? 'Project'}</small></div>
              {(canEditTask(task) || canManageTask(task)) && (
        <TaskActions
          task={task}
          canEdit={canEditTask(task)}
          canArchive={canManageTask(task)}
          onEdit={openEditTask}
          onArchive={(item) => { setArchiveError(''); setArchiveTarget(item); }}
        />
      )}
            </div>
            {renderCompactStatus(task)}
            <PriorityLabel value={task.priority} />
            <span className={`${styles.listDue} ${isOverdue(task) ? styles.overdueText : isDueSoon(task) ? styles.dueSoon : ''}`}>{dueLabel(task)}</span>
            {showSprintBacklogMove && canEditTask(task) && <button type="button" className={styles.textAction} onClick={() => updateTask(task, { sprint_id: null })}>Move to backlog</button>}
          </div>
        ))
        : <EmptyState title={tasks.length ? 'No tasks match these filters' : 'No tasks found'} detail="Try another search or adjust your filters." />}
    </div>
  );

  const renderBacklog = () => {
    const groups = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((priority) => ({
      priority,
      tasks: backlogTasks.filter((task) => task.priority === priority),
    })).filter((group) => group.tasks.length);
    return (
      <>
        <header className={styles.sectionHeader}>
          <div><h2>Backlog</h2><p>{backlogTasks.length === tasks.filter((task) => !task.sprint).length
            ? `${backlogTasks.length} unscheduled tasks`
            : `${backlogTasks.length} of ${tasks.filter((task) => !task.sprint).length} unscheduled tasks`}</p></div>
        </header>
        <div className={styles.backlogToolbar}>
          <label className={styles.searchBox}>
            <Search size={15} />
            <input type="search" value={backlogSearch} onChange={(event) => setBacklogSearch(event.target.value)} placeholder="Search backlog" aria-label="Search backlog" />
          </label>
          <DropdownSelect variant="compact" prefix="Priority" value={backlogPriority} ariaLabel="Filter backlog by priority" options={[{ value: 'ALL', label: 'All priorities' }, ...Object.entries(PRIORITY_META).map(([value, meta]) => ({ value, label: meta.label }))]} onChange={setBacklogPriority} />
          <DropdownSelect variant="compact" prefix="Assignee" value={backlogAssignee} ariaLabel="Filter backlog by assignee" options={[{ value: 'ALL', label: 'Anyone' }, { value: 'ME', label: 'Assigned to me' }, { value: 'UNASSIGNED', label: 'Unassigned' }, ...assigneeOptions]} onChange={setBacklogAssignee} />
          <DropdownSelect variant="compact" prefix="Sort" value={backlogSort} ariaLabel="Sort backlog tasks" options={[{ value: 'PRIORITY', label: 'Priority' }, { value: 'DUE_DATE', label: 'Due date' }, { value: 'TITLE', label: 'Title' }]} onChange={setBacklogSort} />
          {renderLayoutToggle()}
        </div>
        {loading ? <div className={styles.stateMessage}>Loading backlog…</div> : backlogTasks.length ? layoutView === 'BOARD'
          ? renderBoard(backlogTasks, true)
          : (
          <div className={styles.backlogGroups}>
            {groups.map((group) => (
              <section className={styles.backlogGroup} key={group.priority}>
                <h3><PriorityLabel value={group.priority} /><span>{group.tasks.length}</span></h3>
                {group.tasks.map((task) => {
                  const eligibleSprints = sprints.filter((sprint) => String(sprint.project?.id) === String(task.project?.id) && sprint.status !== 'COMPLETED');
                  return (
                    <article className={styles.backlogRow} key={task.id}>
                      <TaskLink task={task} linkState={taskLinkState} className={styles.backlogTaskTitle}>{task.title}</TaskLink>
                      <span className={styles.backlogMeta}>{task.project?.name ?? 'Project'} · {fullName(task.assigned_to)}</span>
                      <span className={styles.backlogMeta}>{STATUS_META[task.status]?.label ?? task.status} · {dueLabel(task)}</span>
                      {canEditTask(task) && <select className={styles.sprintMove} value="" aria-label={`Move ${task.title} to sprint`} onChange={(event) => updateTask(task, { sprint_id: event.target.value ? Number(event.target.value) : null })}>
                        <option value="">Move to sprint…</option>
                        {eligibleSprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}
                      </select>}
                      {(canEditTask(task) || canManageTask(task)) && (
        <TaskActions
          task={task}
          canEdit={canEditTask(task)}
          canArchive={canManageTask(task)}
          onEdit={openEditTask}
          onArchive={(item) => { setArchiveError(''); setArchiveTarget(item); }}
        />
      )}
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
        ) : <EmptyState title={tasks.some((task) => !task.sprint) ? 'No backlog tasks match these filters' : 'The backlog is clear'} detail="Tasks without a sprint will appear here." />}
      </>
    );
  };

  const renderSprintWorkspace = () => {
    const sprintGroups = [
      ['ACTIVE', 'CURRENT'],
      ['PLANNED', 'UPCOMING'],
      ['COMPLETED', 'COMPLETED'],
    ];
    if (selectedSprint) {
      const canManage = canManageProject(selectedSprint.project?.id);
      const completed = selectedSprintTasks.filter((task) => task.status === 'COMPLETED').length;
      const percentage = selectedSprintTasks.length ? Math.round((completed / selectedSprintTasks.length) * 100) : 0;
      return (
        <>
          <button type="button" className={styles.backToSprints} onClick={() => setSelectedSprintId(null)}><ArrowLeft size={15} /> All sprints</button>
          <header className={styles.sectionHeader}>
            <div><span className={styles.sectionEyebrow}>{selectedSprint.project?.name ?? 'Project'} · Sprint workspace</span><h2>{selectedSprint.name}</h2><p>{formatDate(selectedSprint.start_date)} — {formatDate(selectedSprint.end_date)}</p></div>
            {canManage && selectedSprint.status === 'PLANNED' && <button type="button" className={styles.secondaryAction} onClick={() => changeSprintStatus(selectedSprint, 'start')}>Start sprint</button>}
            {canManage && selectedSprint.status === 'ACTIVE' && <button type="button" className={styles.secondaryAction} onClick={() => changeSprintStatus(selectedSprint, 'complete')}>Complete sprint</button>}
          </header>
          <div className={styles.sprintProgressSummary}><div className={styles.sprintProgressTrack}><span style={{ width: `${percentage}%` }} /></div><span>{completed} / {selectedSprintTasks.length} tasks completed</span></div>
          <div className={styles.workspaceActions}>{renderLayoutToggle()}</div>
          {sprintActionError && <p className={styles.error} role="alert">{sprintActionError}</p>}
          {selectedSprintTasks.length
            ? layoutView === 'BOARD'
              ? renderBoard(selectedSprintTasks, false, true)
              : renderList(selectedSprintTasks, true)
            : <EmptyState title="No tasks in this sprint" detail="Move work here from the backlog when it is ready." />}
          <NavLink className={styles.projectLink} to={`/projects/${selectedSprint.project?.id}`} state={taskLinkState}>Open project workspace <ChevronRight size={14} /></NavLink>
        </>
      );
    }
    return (
      <>
        <header className={styles.sectionHeader}><div><h2>Sprints</h2><p>Plan and follow work by iteration.</p></div></header>
        <div className={styles.workspaceActions}>{renderLayoutToggle()}</div>
        {sprintActionError && <p className={styles.error} role="alert">{sprintActionError}</p>}
        {loading ? <div className={styles.stateMessage}>Loading sprints…</div> : sprints.length ? (
          layoutView === 'LIST' ? <div className={styles.sprintGroups}>
            {sprintGroups.map(([status, label]) => {
              const items = sprints.filter((sprint) => sprint.status === status);
              if (!items.length) return null;
              return (
                <section className={styles.sprintGroup} key={status}>
                  <h3>{label}</h3>
                  {items.map((sprint) => {
                    const sprintTasks = tasks.filter((task) => String(task.sprint?.id) === String(sprint.id));
                    const completed = sprintTasks.filter((task) => task.status === 'COMPLETED').length;
                    const percent = sprintTasks.length ? Math.round((completed / sprintTasks.length) * 100) : 0;
                    return (
                      <article className={styles.sprintCard} key={sprint.id}>
                        <div className={styles.sprintCardHeader}>
                          <div><span>{sprint.project?.name ?? 'Project'}</span><h4>{sprint.name}</h4></div>
                          <span className={styles.sprintStatus}>{label}</span>
                        </div>
                        {sprint.goal && <p className={styles.sprintGoal}>{sprint.goal}</p>}
                        <p className={styles.sprintDates}>{formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}</p>
                        <div className={styles.sprintProgressTrack}><span style={{ width: `${percent}%` }} /></div>
                        <div className={styles.sprintCardFooter}><span>{completed} / {sprintTasks.length} tasks completed</span><button type="button" className={styles.textAction} onClick={() => setSelectedSprintId(sprint.id)}>View sprint <ChevronRight size={14} /></button></div>
                        {canManageProject(sprint.project?.id) && status === 'PLANNED' && <button type="button" className={styles.sprintAction} onClick={() => changeSprintStatus(sprint, 'start')}>Start sprint</button>}
                        {canManageProject(sprint.project?.id) && status === 'ACTIVE' && <button type="button" className={styles.sprintAction} onClick={() => changeSprintStatus(sprint, 'complete')}>Complete sprint</button>}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div> : <div className={styles.sprintBoard}>
            {sprintGroups.map(([status, label]) => {
              const items = sprints.filter((sprint) => sprint.status === status);
              return (
                <section className={styles.sprintBoardColumn} key={status}>
                  <h3>{label}<span>{items.length}</span></h3>
                  {items.map((sprint) => {
                    const sprintTasks = tasks.filter((task) => String(task.sprint?.id) === String(sprint.id));
                    const completed = sprintTasks.filter((task) => task.status === 'COMPLETED').length;
                    const percent = sprintTasks.length ? Math.round((completed / sprintTasks.length) * 100) : 0;
                    return (
                      <article className={styles.sprintCard} key={sprint.id}>
                        <div className={styles.sprintCardHeader}>
                          <div><span>{sprint.project?.name ?? 'Project'}</span><h4>{sprint.name}</h4></div>
                        </div>
                        {sprint.goal && <p className={styles.sprintGoal}>{sprint.goal}</p>}
                        <p className={styles.sprintDates}>{formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}</p>
                        <div className={styles.sprintProgressTrack}><span style={{ width: `${percent}%` }} /></div>
                        <div className={styles.sprintCardFooter}><span>{completed} / {sprintTasks.length} tasks completed</span><button type="button" className={styles.textAction} onClick={() => setSelectedSprintId(sprint.id)}>View sprint <ChevronRight size={14} /></button></div>
                        {canManageProject(sprint.project?.id) && status === 'PLANNED' && <button type="button" className={styles.sprintAction} onClick={() => changeSprintStatus(sprint, 'start')}>Start sprint</button>}
                        {canManageProject(sprint.project?.id) && status === 'ACTIVE' && <button type="button" className={styles.sprintAction} onClick={() => changeSprintStatus(sprint, 'complete')}>Complete sprint</button>}
                      </article>
                    );
                  })}
                  {!items.length && <p className={styles.boardEmpty}>No sprints</p>}
                </section>
              );
            })}
          </div>
        ) : <EmptyState title="No sprints yet" detail="Create a sprint from a project workspace to plan iterations." />}
      </>
    );
  };

  return (
    <AppShell org={org} user={user}>
      <div className={styles.workspace}>
        <header className={styles.pageHeader}>
          <div><span className={styles.eyebrow}>Your workspace</span><h1>Tasks</h1></div>
          {canCreateTask && <button type="button" className={styles.newTaskButton} onClick={openCreateTask}><Plus size={16} /> New task</button>}
        </header>

        <nav className={styles.workspaceTabs} aria-label="Task workspaces" role="tablist">
          {TASK_VIEWS.map(([value, label]) => (
            <button type="button" role="tab" aria-selected={workspaceView === value} className={workspaceView === value ? styles.workspaceTabActive : ''} key={value} onClick={() => { setWorkspaceView(value); setActionError(''); }}>
              {label}
            </button>
          ))}
        </nav>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {permissionWarning && <p className={styles.permissionNotice} role="status">Project permissions could not be confirmed for all projects. Management actions are hidden where access could not be verified.</p>}
        {actionError && <div className={styles.error} role="alert">{actionError}</div>}

        {workspaceView === 'MY_WORK' && renderMyWork()}
        {workspaceView === 'BACKLOG' && renderBacklog()}
        {workspaceView === 'SPRINTS' && renderSprintWorkspace()}

        {createOpen && (
          <div className={styles.drawerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !createSaving) { setCreateOpen(false); setEditingTask(null); } }}>
            <section className={styles.taskDrawer} role="dialog" aria-modal="true" aria-labelledby="create-task-title">
              <div className={styles.dialogHeader}><div><span className={styles.sectionEyebrow}>{editingTask ? 'Task details' : 'Add work'}</span><h2 id="create-task-title">{editingTask ? 'Edit task' : 'Create task'}</h2></div><button type="button" aria-label="Close" onClick={() => { setCreateOpen(false); setEditingTask(null); }} disabled={createSaving}>×</button></div>
              {!editingTask && !manageableProjects.length ? (
                <div className={styles.noTaskProject}>
                  {loading ? <p role="status">Loading projects…</p> : <>
                    <p>A task needs an active project. Create a project first, then you can add work here.</p>
                    <NavLink to="/projects" className={styles.projectLink} onClick={() => setCreateOpen(false)}>Go to projects <ChevronRight size={14} /></NavLink>
                  </>}
                </div>
              ) : (
              <form onSubmit={handleCreateTask}>
                <label>Task title<input required maxLength={255} autoFocus value={newTask.title} onChange={(event) => setNewTask((current) => ({ ...current, title: event.target.value }))} /></label>
                <label>Description<textarea rows={4} value={newTask.description} onChange={(event) => setNewTask((current) => ({ ...current, description: event.target.value }))} /></label>
                <label>Project<select required value={newTask.projectId} disabled={Boolean(editingTask && !canManageTask(editingTask))} onChange={(event) => setNewTask((current) => ({ ...current, projectId: event.target.value, assigned_to: '', sprintId: '' }))}>{taskFormProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                <div className={styles.formRow}>
                  <label>Status<select value={newTask.status} onChange={(event) => setNewTask((current) => ({ ...current, status: event.target.value }))}>{['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'BLOCKED'].map((status) => <option key={status} value={status}>{STATUS_META[status].label}</option>)}</select></label>
                </div>
                <OrganizationMemberSelector
                  organizationId={org?.id}
                  members={createTaskAssignees}
                  selectedIds={newTask.assigned_to ? [newTask.assigned_to] : []}
                  onChange={(ids) => setNewTask((current) => ({ ...current, assigned_to: ids[0] ?? '' }))}
                  multiple={false}
                  label="Assignee"
                  placeholder="Search eligible project or team members"
                  canInvite={Boolean(org?.permissions?.can_manage_members)}
                  canInviteAdmins={Boolean(org?.permissions?.can_manage_organization)}
                  disabled={Boolean(editingTask && !canManageTask(editingTask))}
                />
                <div className={styles.sprintField}>
                  <label>Sprint<select value={newTask.sprintId} onChange={(event) => {
                    if (event.target.value === '__create__') {
                      setSprintError('');
                      setSprintFormOpen(true);
                    } else {
                      setNewTask((current) => ({ ...current, sprintId: event.target.value }));
                      setSprintFormOpen(false);
                    }
                  }}>
                    <option value="">Backlog / no sprint</option>
                    {sprints.filter((sprint) => String(sprint.project?.id ?? sprint.project) === newTask.projectId && sprint.status !== 'COMPLETED')
                      .map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name} · {sprint.status === 'ACTIVE' ? 'Active' : 'Planned'}</option>)}
                    {canManageProject(newTask.projectId) && <option value="__create__">＋ Create a sprint…</option>}
                  </select></label>
                </div>
                {sprintFormOpen && <div className={styles.createSprintForm}>
                  <strong>Create sprint for {projects.find((project) => String(project.id) === newTask.projectId)?.name ?? 'this project'}</strong>
                  <label>Sprint name<input required maxLength={255} value={newSprint.name} onChange={(event) => setNewSprint((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Sprint 1" /></label>
                  <div className={styles.formRow}>
                    <label>Start date<input required type="date" value={newSprint.start_date} onChange={(event) => setNewSprint((current) => ({ ...current, start_date: event.target.value }))} /></label>
                    <label>End date<input required type="date" min={newSprint.start_date || undefined} value={newSprint.end_date} onChange={(event) => setNewSprint((current) => ({ ...current, end_date: event.target.value }))} /></label>
                  </div>
                  <label>Sprint goal<input value={newSprint.goal} onChange={(event) => setNewSprint((current) => ({ ...current, goal: event.target.value }))} placeholder="Optional" /></label>
                  {sprintError && <p className={styles.inlineError} role="alert">{sprintError}</p>}
                  <div className={styles.sprintFormActions}><button type="button" className={styles.cancelButton} onClick={() => setSprintFormOpen(false)} disabled={sprintSaving}>Cancel</button><button type="button" className={styles.newTaskButton} onClick={createSprintForTask} disabled={sprintSaving || !newSprint.name.trim() || !newSprint.start_date || !newSprint.end_date}>{sprintSaving ? 'Creating sprint…' : 'Create sprint'}</button></div>
                </div>}
                {assigneeLoadError && <p className={styles.inlineError} role="alert">{assigneeLoadError}</p>}
                <div className={styles.formRow}>
                  <label>Priority<select value={newTask.priority} onChange={(event) => setNewTask((current) => ({ ...current, priority: event.target.value }))}>{Object.entries(PRIORITY_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
                  <label>Due date<input type="date" value={newTask.due_date} onChange={(event) => setNewTask((current) => ({ ...current, due_date: event.target.value }))} /></label>
                </div>
                {createError && <p className={styles.inlineError} role="alert">{createError}</p>}
                <div className={styles.drawerActions}><button type="button" className={styles.cancelButton} onClick={() => { setCreateOpen(false); setEditingTask(null); }} disabled={createSaving}>Cancel</button><button type="submit" className={styles.newTaskButton} disabled={createSaving || !newTask.title.trim() || !newTask.projectId}>{createSaving ? (editingTask ? 'Saving…' : 'Creating…') : (editingTask ? 'Save changes' : 'Create task')}</button></div>
              </form>
              )}
            </section>
          </div>
        )}
        {archiveTarget && <div className={styles.confirmBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !archiveSaving) setArchiveTarget(null); }}>
          <section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="archive-task-title">
            <h2 id="archive-task-title">Archive task?</h2>
            <p>“{archiveTarget.title}” will be removed from active work. Its comments, attachments and activity history will be kept.</p>
            {archiveError && <p className={styles.inlineError} role="alert">{archiveError}</p>}
            <div className={styles.drawerActions}><button type="button" className={styles.cancelButton} onClick={() => setArchiveTarget(null)} disabled={archiveSaving}>Cancel</button><button type="button" className={styles.archiveConfirm} onClick={archiveTask} disabled={archiveSaving}>{archiveSaving ? 'Archiving…' : 'Archive task'}</button></div>
          </section>
        </div>}
      </div>
    </AppShell>
  );
}
