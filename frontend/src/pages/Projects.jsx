import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ArrowDownUp, CalendarDays, Check, FolderKanban, MoreHorizontal, Pencil, Plus, Search, X } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import DropdownSelect from '../components/DropdownSelect';
import OrganizationMemberSelector from '../components/OrganizationMemberSelector';
import { organizationsApi, projectsApi } from '../services/api';
import { useProjects } from '../hooks/useProjects';
import styles from './Projects.module.css';

const STATUS_META = {
  PLANNING: { label: 'Planning', className: 'planning' },
  ACTIVE: { label: 'In progress', className: 'active' },
  ON_HOLD: { label: 'On hold', className: 'hold' },
  COMPLETED: { label: 'Completed', className: 'completed' },
};

function formatDate(value) {
  if (!value) return 'No deadline';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function isOverdue(value, status) {
  if (!value || status === 'COMPLETED') return false;
  const [year, month, day] = value.split('-').map(Number);
  const dueDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
}

function teamId(project) {
  return project.team?.id ?? project.team ?? '';
}

function ProjectMark({ project }) {
  const initials = project.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const options = [styles.markOrb, styles.markGrid, styles.markSquare, styles.markRing];
  const identity = [...project.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % options.length;
  return <span className={`${styles.projectMark} ${options[identity]}`} aria-hidden="true">{initials}</span>;
}

function MemberAvatars({ members }) {
  if (members === null) return <span className={styles.uncertainMeta}>Members unavailable</span>;
  if (!members?.length) return <span className={styles.uncertainMeta}>No members</span>;
  const visible = members.slice(0, 4);
  return (
    <span className={styles.avatarStack} aria-label={`${members.length} project members`}>
      {visible.map((membership, index) => {
        const person = membership.user;
        const name = [person?.first_name, person?.last_name].filter(Boolean).join(' ') || person?.email || 'Unknown member';
        const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
        return <span className={styles.avatar} key={membership.id ?? index} title={name}>{initials}</span>;
      })}
      {members.length > visible.length && <span className={styles.avatarMore}>+{members.length - visible.length}</span>}
    </span>
  );
}

function ProjectMenu({ project, canManage, onEdit, onArchive, linkState }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setOpen((value) => !value)}
        aria-label={`Actions for ${project.name}`}
        aria-expanded={open}
      >
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div className={styles.menu}>
          <NavLink to={`/projects/${project.id}`} state={linkState} onClick={() => setOpen(false)}>Open project</NavLink>
          {canManage && <>
            <button type="button" onClick={() => { setOpen(false); onEdit(project); }}><Pencil size={13} /> Edit project</button>
            <button type="button" className={styles.deleteAction} onClick={() => { setOpen(false); onArchive(project.id); }}>Archive project</button>
          </>}
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project, teamName, canManage, onEdit, onArchive, linkState }) {
  const status = STATUS_META[project.status] ?? { label: project.status, className: 'planning' };
  const tasks = project.tasks;
  const completed = tasks?.filter((task) => task.status === 'COMPLETED').length ?? 0;
  const total = tasks?.length ?? 0;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const overdue = isOverdue(project.target_end_date, project.status);

  return (
    <article className={styles.projectRow}>
      <NavLink className={styles.projectLink} to={`/projects/${project.id}`} state={linkState}>
        <ProjectMark project={project} />
        <div className={styles.projectContent}>
          <div className={styles.projectTopline}>
            <div className={styles.projectNameBlock}>
              <h2>{project.name}</h2>
              <p>{project.description || 'No project description'}</p>
            </div>
            <span className={`${styles.status} ${styles[status.className]}`}>{status.label}</span>
          </div>

          {tasks ? (
            <div className={styles.progressRow}>
              <div className={styles.progressTrack} aria-label={`${progress}% tasks completed`}>
                <span style={{ width: `${progress}%` }} />
              </div>
              <strong>{progress}%</strong>
            </div>
          ) : (
            <p className={styles.uncertainMeta}>Task progress unavailable</p>
          )}

          <div className={styles.projectMeta}>
            <span className={styles.metaItem}>
              <FolderKanban size={13} />
              {tasks ? `${total} tasks · ${completed} completed` : 'Task totals unavailable'}
            </span>
            <span className={`${styles.metaItem} ${overdue ? styles.overdue : ''}`}>
              <CalendarDays size={13} />
              {overdue ? 'Overdue · ' : ''}{formatDate(project.target_end_date)}
            </span>
            <span className={styles.teamLabel}>{teamName || 'Cross-functional'}</span>
          </div>
        </div>
      </NavLink>

      <div className={styles.projectAside}>
        <MemberAvatars members={project.members} />
        <ProjectMenu project={project} canManage={canManage} onEdit={onEdit} onArchive={onArchive} linkState={linkState} />
      </div>
    </article>
  );
}

export default function Projects() {
  const location = useLocation();
  const projectLinkState = { backgroundLocation: location };
  const { projects, teams, teamsError, org, user, loading, error, reload, createProject, updateProject, deleteProject } = useProjects();
  const canCreateProjects = Boolean(org?.permissions?.can_manage_members);
  const canInviteMembers = Boolean(org?.permissions?.can_manage_members);
  const canInviteAdmins = Boolean(org?.permissions?.can_manage_organization);
  const [organizationMembers, setOrganizationMembers] = useState([]);
  const [memberLoadError, setMemberLoadError] = useState('');
  const [projectMembersLoading, setProjectMembersLoading] = useState(false);
  const [projectMemberError, setProjectMemberError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('updated');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [projectMemberships, setProjectMemberships] = useState([]);
  const [projectMemberIds, setProjectMemberIds] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', status: 'PLANNING', team: '', start_date: '', target_end_date: '' });

  useEffect(() => {
    if (!org?.id) {
      setOrganizationMembers([]);
      return undefined;
    }
    let active = true;
    organizationsApi.members(org.id).then(({ data }) => {
      if (!active) return;
      const memberships = data?.results ?? data;
      setOrganizationMembers(memberships.filter((membership) =>
        membership.status === 'ACTIVE' && membership.is_active !== false));
      setMemberLoadError('');
    }).catch((loadError) => {
      if (active) setMemberLoadError(loadError.response?.data?.detail ?? 'Organization members could not be loaded.');
    });
    return () => { active = false; };
  }, [org?.id]);

  const canManageProject = (project) => canCreateProjects || (project.members ?? []).some((membership) =>
    String(membership.user?.id) === String(user?.id) && membership.role === 'MANAGER');

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return projects
      .filter((project) => {
        const matchesQuery = !query || [project.name, project.description].some((value) => value?.toLocaleLowerCase().includes(query));
        const matchesStatus = statusFilter === 'ALL' || project.status === statusFilter;
        const matchesTeam = teamFilter === 'ALL' || String(teamId(project)) === teamFilter;
        return matchesQuery && matchesStatus && matchesTeam;
      })
      .sort((a, b) => {
        if (sortOrder === 'name') return a.name.localeCompare(b.name);
        if (sortOrder === 'deadline') return (a.target_end_date || '9999').localeCompare(b.target_end_date || '9999');
        return (b.updated_at || '').localeCompare(a.updated_at || '');
      });
  }, [projects, search, statusFilter, teamFilter, sortOrder]);

  const requestDelete = (id) => {
    setDeleteError('');
    setDeleteTarget(projects.find((project) => String(project.id) === String(id)) ?? null);
  };

  const openCreate = () => {
    setEditingProject(null);
    setForm({ name: '', description: '', status: 'PLANNING', team: '', start_date: '', target_end_date: '' });
    setCreateError('');
    setProjectMemberError('');
    setProjectMembersLoading(false);
    setProjectMemberships([]);
    setProjectMemberIds([]);
    setCreateOpen(true);
  };

  const openEdit = async (project) => {
    setEditingProject(project);
    setForm({
      name: project.name ?? '',
      description: project.description ?? '',
      status: project.status ?? 'PLANNING',
      team: teamId(project) ? String(teamId(project)) : '',
      start_date: project.start_date ?? '',
      target_end_date: project.target_end_date ?? '',
    });
    setCreateError('');
    setProjectMemberError('');
    const existingMemberships = project.members ?? [];
    const selectedIds = existingMemberships.map((membership) =>
      String(membership.user?.id ?? membership.user));
    setProjectMemberships(existingMemberships);
    setProjectMemberIds(selectedIds);
    setCreateOpen(true);
    if (project.members === null) {
      setProjectMembersLoading(true);
      try {
        const { data } = await projectsApi.members(project.id);
        const memberships = data?.results ?? data;
        const ids = memberships.map((membership) => String(membership.user?.id ?? membership.user));
        setProjectMemberships(memberships);
        setProjectMemberIds(ids);
      } catch (loadError) {
        setProjectMemberError(loadError.response?.data?.detail ?? 'Project members could not be loaded. Try closing and reopening the editor.');
      } finally {
        setProjectMembersLoading(false);
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteProject(deleteTarget.id);
      setDeleteTarget(null);
    } catch (deleteErrorResponse) {
      const detail = deleteErrorResponse.response?.data?.detail;
      setDeleteError(typeof detail === 'string' ? detail : 'Failed to delete this project. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (projectMemberError || projectMembersLoading) return;
    setCreating(true);
    setCreateError('');
    try {
      const payload = {
        ...form,
        team: form.team ? Number(form.team) : null,
        start_date: form.start_date || null,
        target_end_date: form.target_end_date || null,
      };
      const savedProject = editingProject
        ? await updateProject(editingProject.id, payload)
        : await createProject(payload);
      const existingByUser = new Map(projectMemberships.map((membership) => [
        String(membership.user?.id ?? membership.user),
        membership,
      ]));
      const selected = new Set(projectMemberIds.map(String));
      const toAdd = projectMemberIds.filter((id) => !existingByUser.has(String(id)));
      const toRemove = projectMemberships.filter((membership) =>
        !selected.has(String(membership.user?.id ?? membership.user)));
      const memberResults = await Promise.allSettled([
        ...toAdd.map((userId) => projectsApi.addMember(savedProject.id, { user_id: Number(userId) })),
        ...toRemove.map((membership) => projectsApi.removeMember(savedProject.id, membership.id)),
      ]);
      if (memberResults.some((result) => result.status === 'rejected')) {
        const refreshed = await projectsApi.members(savedProject.id);
        const memberships = refreshed.data?.results ?? refreshed.data;
        setProjectMemberships(memberships);
        throw new Error('The project was saved, but some member changes could not be applied. Review the selected members and save again.');
      }
      await reload();
      setForm({ name: '', description: '', status: 'PLANNING', team: '', start_date: '', target_end_date: '' });
      setEditingProject(null);
      setProjectMemberships([]);
      setProjectMemberIds([]);
      setProjectMemberError('');
      setCreateOpen(false);
    } catch (createErrorResponse) {
      const detail = createErrorResponse.response?.data?.detail;
      setCreateError(typeof detail === 'string' ? detail : (createErrorResponse.message || 'Could not save the project.'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell org={org} user={user}>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headerText}>
            <span className={styles.eyebrow}>Workspace</span>
            <h1 className={styles.pageTitle}>Your projects</h1>
            <p className={styles.pageSubtitle}>Your team’s active work, milestones and progress.</p>
          </div>
          {canCreateProjects && <button type="button" className={styles.createButton} onClick={openCreate}>
            <Plus size={15} /> New project
          </button>}
        </header>

        {createOpen && (
          <div className={styles.drawerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) setCreateOpen(false); }}>
            <section className={styles.projectDrawer} role="dialog" aria-modal="true" aria-labelledby="create-project-title">
              <header className={styles.drawerHeader}><div><span className={styles.eyebrow}>Workspace</span><h2 id="create-project-title">{editingProject ? 'Edit project' : 'Create project'}</h2><p>{editingProject ? 'Update project details and delivery dates.' : 'Set up a workspace for shared delivery.'}</p></div><button type="button" aria-label="Close" onClick={() => setCreateOpen(false)} disabled={creating}><X size={18} /></button></header>
              <form className={styles.drawerForm} onSubmit={handleCreate}>
                <label className={styles.formField}><span>Project name</span><input required maxLength={255} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus /></label>
                <label className={styles.formField}><span>Description</span><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
                <label className={styles.formField}><span>Team</span><DropdownSelect variant="field" ariaLabel="Project team" value={form.team} options={[{ value: '', label: 'Cross-functional' }, ...teams.map((team) => ({ value: String(team.id), label: team.name }))]} onChange={(team) => setForm((current) => ({ ...current, team }))} /></label>
                <div className={styles.drawerDateRow}>
                  <label className={styles.formField}><span>Start date</span><input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></label>
                  <label className={styles.formField}><span>End date</span><input type="date" min={form.start_date || undefined} value={form.target_end_date} onChange={(event) => setForm({ ...form, target_end_date: event.target.value })} /></label>
                </div>
                <label className={styles.formField}><span>Status</span><DropdownSelect variant="field" ariaLabel="Project status" value={form.status} options={Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))} onChange={(status) => setForm((current) => ({ ...current, status }))} /></label>
                <OrganizationMemberSelector
                  organizationId={org?.id}
                  members={organizationMembers}
                  selectedIds={projectMemberIds}
                  onChange={setProjectMemberIds}
                  label="Project members"
                  canInvite={canInviteMembers}
                  canInviteAdmins={canInviteAdmins}
                  disabled={creating || projectMembersLoading || Boolean(projectMemberError)}
                />
                {projectMemberError && <p className={styles.formError} role="alert">{projectMemberError}</p>}
                {memberLoadError && <p className={styles.formError} role="alert">{memberLoadError}</p>}
                {createError && <p className={styles.formError} role="alert">{createError}</p>}
                <div className={styles.drawerActions}><button type="button" className={styles.cancelButton} onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</button><button type="submit" className={styles.createSubmit} disabled={creating || projectMembersLoading || Boolean(projectMemberError) || !form.name.trim()}><Check size={14} />{creating ? (editingProject ? 'Saving…' : 'Creating…') : (editingProject ? 'Save changes' : 'Create project')}</button></div>
              </form>
            </section>
          </div>
        )}

        {error && <div className={styles.errorBanner} role="alert"><span>{error}</span><button type="button" onClick={reload}>Retry</button></div>}
        {teamsError && <p className={styles.dataNotice} role="status">{teamsError}</p>}

        <div className={styles.toolbar}>
          <label className={styles.searchWrap}>
            <Search size={15} />
            <input className={styles.searchInput} placeholder="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <DropdownSelect
            variant="compact"
            prefix="Team"
            value={teamFilter}
            ariaLabel="Filter projects by team"
            options={[
              { value: 'ALL', label: 'All teams' },
              ...teams.map((team) => ({ value: String(team.id), label: team.name })),
            ]}
            onChange={setTeamFilter}
          />
          <DropdownSelect
            variant="compact"
            prefix="Sort"
            value={sortOrder}
            icon={ArrowDownUp}
            ariaLabel="Sort projects"
            options={[
              { value: 'updated', label: 'Recently updated' },
              { value: 'deadline', label: 'Deadline' },
              { value: 'name', label: 'Name' },
            ]}
            onChange={setSortOrder}
          />
        </div>
        <nav className={styles.statusFilters} aria-label="Filter projects by status">
          {[
            ['ALL', 'All projects'],
            ...Object.entries(STATUS_META).map(([value, meta]) => [value, meta.label]),
          ].map(([value, label]) => {
            const count = value === 'ALL'
              ? projects.length
              : projects.filter((project) => project.status === value).length;
            return (
              <button
                type="button"
                key={value}
                className={statusFilter === value ? styles.statusFilterActive : ''}
                onClick={() => setStatusFilter(value)}
                aria-pressed={statusFilter === value}
              >
                {label}<span>{count}</span>
              </button>
            );
          })}
        </nav>

        <div className={styles.listHeading}>
          <span>{loading ? 'Loading projects…' : `${filteredProjects.length} ${filteredProjects.length === 1 ? 'project' : 'projects'}`}</span>
          <span>{org?.name}</span>
        </div>

        <section className={styles.projectList} aria-label="Projects">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => <div className={styles.skeletonRow} key={index} />)
          ) : filteredProjects.length ? (
            filteredProjects.map((project) => {
              const projectTeamId = teamId(project);
              const teamName = project.team?.name ?? teams.find((team) => String(team.id) === String(projectTeamId))?.name;
              return <ProjectRow key={project.id} project={project} teamName={teamName} canManage={canManageProject(project)} onEdit={openEdit} onArchive={requestDelete} linkState={projectLinkState} />;
            })
          ) : (
            <div className={styles.emptyState}>
              <FolderKanban size={22} />
              <strong>{projects.length ? 'No projects match these filters' : 'No projects yet'}</strong>
              <span>{projects.length ? 'Try changing your search or filters.' : 'Create a project to start organizing work.'}</span>
              {!projects.length && canCreateProjects && <button type="button" onClick={openCreate}>Create project</button>}
            </div>
          )}
        </section>
        {deleteTarget && (
          <div className={styles.confirmBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeleteTarget(null); }}>
            <section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="delete-project-title">
              <h2 id="delete-project-title">Archive project?</h2>
              <p>“{deleteTarget.name}” will be hidden from active work. Its tasks, members and activity history will be kept.</p>
              {deleteError && <p className={styles.formError} role="alert">{deleteError}</p>}
              <div className={styles.confirmActions}>
                <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
                <button type="button" className={styles.dangerButton} onClick={handleDelete} disabled={deleting}>{deleting ? 'Archiving…' : 'Archive project'}</button>
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
