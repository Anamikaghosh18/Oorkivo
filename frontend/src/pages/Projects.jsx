import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowDownUp, CalendarDays, Check, FolderKanban, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import DropdownSelect from '../components/DropdownSelect';
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

function ProjectMenu({ project, onDelete }) {
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
          <NavLink to={`/projects/${project.id}`} onClick={() => setOpen(false)}>Open project</NavLink>
          <button type="button" className={styles.deleteAction} onClick={() => { setOpen(false); onDelete(project.id); }}>Delete project</button>
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project, teamName, onDelete }) {
  const status = STATUS_META[project.status] ?? { label: project.status, className: 'planning' };
  const tasks = project.tasks;
  const completed = tasks?.filter((task) => task.status === 'COMPLETED').length ?? 0;
  const total = tasks?.length ?? 0;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const overdue = isOverdue(project.target_end_date, project.status);

  return (
    <article className={styles.projectRow}>
      <NavLink className={styles.projectLink} to={`/projects/${project.id}`}>
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
        <ProjectMenu project={project} onDelete={onDelete} />
      </div>
    </article>
  );
}

export default function Projects() {
  const { projects, teams, teamsError, org, user, loading, error, reload, createProject, deleteProject } = useProjects();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('updated');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState({ name: '', description: '', status: 'PLANNING', team: '', target_end_date: '' });

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

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this project? This cannot be undone.')) return;
    try {
      await deleteProject(id);
    } catch {
      window.alert('Failed to delete project. Please try again.');
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      await createProject({
        ...form,
        team: form.team ? Number(form.team) : null,
        target_end_date: form.target_end_date || null,
      });
      setForm({ name: '', description: '', status: 'PLANNING', team: '', target_end_date: '' });
      setCreateOpen(false);
    } catch (createErrorResponse) {
      const detail = createErrorResponse.response?.data?.detail;
      setCreateError(typeof detail === 'string' ? detail : 'Could not create the project.');
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
          <button type="button" className={styles.createButton} onClick={() => { setCreateError(''); setCreateOpen((open) => !open); }}>
            {createOpen ? <X size={15} /> : <Plus size={15} />}
            {createOpen ? 'Cancel' : 'New project'}
          </button>
        </header>

        {createOpen && (
          <form className={styles.createForm} onSubmit={handleCreate}>
            <div className={styles.formHeading}>
              <strong>Create a project</strong>
              <span>Set up a workspace for shared delivery.</span>
            </div>
            <label className={styles.formField}>
              <span>Project name</span>
              <input required maxLength={255} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus />
            </label>
            <label className={styles.formField}>
              <span>Description</span>
              <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
            <div className={styles.formControls}>
              <div className={styles.formField}>
                <span>Status</span>
                <DropdownSelect
                  variant="field"
                  ariaLabel="Project status"
                  value={form.status}
                  options={Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
                  onChange={(status) => setForm((current) => ({ ...current, status }))}
                />
              </div>
              <div className={styles.formField}>
                <span>Team</span>
                <DropdownSelect
                  variant="field"
                  ariaLabel="Project team"
                  value={form.team}
                  options={[
                    { value: '', label: 'Cross-functional' },
                    ...teams.map((team) => ({ value: String(team.id), label: team.name })),
                  ]}
                  onChange={(team) => setForm((current) => ({ ...current, team }))}
                />
              </div>
              <label className={styles.formField}>
                <span>Target date</span>
                <input type="date" value={form.target_end_date} onChange={(event) => setForm({ ...form, target_end_date: event.target.value })} />
              </label>
              <button type="submit" className={styles.createSubmit} disabled={creating || !form.name.trim()}>
                <Check size={14} /> {creating ? 'Creating…' : 'Create project'}
              </button>
            </div>
            {createError && <p className={styles.formError} role="alert">{createError}</p>}
          </form>
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
            prefix="Status"
            value={statusFilter}
            ariaLabel="Filter projects by status"
            options={[
              { value: 'ALL', label: 'All statuses' },
              ...Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
            ]}
            onChange={setStatusFilter}
          />
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
              return <ProjectRow key={project.id} project={project} teamName={teamName} onDelete={handleDelete} />;
            })
          ) : (
            <div className={styles.emptyState}>
              <FolderKanban size={22} />
              <strong>{projects.length ? 'No projects match these filters' : 'No projects yet'}</strong>
              <span>{projects.length ? 'Try changing your search or filters.' : 'Create a project to start organizing work.'}</span>
              {!projects.length && <button type="button" onClick={() => setCreateOpen(true)}>Create project</button>}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
