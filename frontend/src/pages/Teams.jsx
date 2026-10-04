import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Archive, Building2, ChevronDown, ChevronUp, FolderKanban, MoreHorizontal, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Avatar from '../components/Avatar';
import OrganizationMemberSelector from '../components/OrganizationMemberSelector';
import { useDashboard } from '../hooks/useDashboard';
import { organizationsApi, teamsApi } from '../services/api';
import styles from './Teams.module.css';

function getRows(data) {
  const rows = data?.results ?? data;
  return Array.isArray(rows) ? rows : [];
}

function getErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

function displayName(user) {
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return fullName || user?.email || 'Unknown member';
}

function TeamAvatar({ membership }) {
  return <Avatar user={membership.user} size={27} className={styles.avatar} />;
}

function TeamModal({ children, onBackdropClick, fullScreen = false }) {
  return createPortal(
    <div
      className={`${styles.modalBackdrop} ${fullScreen ? styles.teamEditorBackdrop : ''}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onBackdropClick();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function TeamMembers({ members, loading, error, canManage, onRemove }) {
  if (loading) return <p className={styles.memberMessage}>Loading team members…</p>;
  if (error) return <p className={styles.memberError} role="alert">{error}</p>;
  if (!members.length) return <p className={styles.memberMessage}>No members have been added to this team yet.</p>;

  return (
    <ul className={styles.memberList}>
      {members.map((membership) => (
        <li className={styles.member} key={membership.id}>
          <Avatar user={membership.user} size={27} className={styles.avatar} />
          <span className={styles.memberIdentity}>
            <strong>{displayName(membership.user)}</strong>
            {membership.user?.email && <small>{membership.user.email}</small>}
          </span>
          <span className={`${styles.role} ${membership.role === 'LEAD' ? styles.leadRole : ''}`}>
            {membership.role === 'LEAD' ? 'Team lead' : 'Member'}
          </span>
          {canManage && <button type="button" className={styles.memberRemove} onClick={() => onRemove(membership)} aria-label={`Remove ${displayName(membership.user)} from team`}><Trash2 size={14} /></button>}
        </li>
      ))}
    </ul>
  );
}

function countForTeam(team, projects, tasks, members) {
  const teamProjects = projects.filter((project) => String(project.team?.id ?? project.team ?? '') === String(team.id));
  const projectIds = new Set(teamProjects.map((project) => String(project.id)));
  const teamTasks = tasks.filter((task) => projectIds.has(String(task.project?.id ?? task.project)));
  const membersByUser = new Map(members.map((membership) => [String(membership.user?.id ?? membership.user), membership]));
  const workload = new Map();
  let unassigned = 0;

  teamTasks.forEach((task) => {
    const assignedId = task.assigned_to?.id ?? task.assigned_to;
    if (assignedId == null) {
      unassigned += 1;
      return;
    }
    const member = membersByUser.get(String(assignedId));
    if (member) {
      const key = String(assignedId);
      const current = workload.get(key);
      workload.set(key, { membership: member, count: (current?.count ?? 0) + 1 });
    }
  });

  return {
    projects: teamProjects,
    tasks: teamTasks,
    workload: [...workload.values()].sort((a, b) => b.count - a.count),
    unassigned,
  };
}

export default function Teams() {
  const [searchParams] = useSearchParams();
  const {
    user, org, projects, tasks, loading: workspaceLoading, taskDataError,
  } = useDashboard();
  const canCreateTeams = Boolean(org?.permissions?.can_manage_members);
  const canInviteMembers = Boolean(org?.permissions?.can_manage_members);
  const canInviteAdmins = Boolean(org?.permissions?.can_manage_organization);
  const [teams, setTeams] = useState([]);
  const [organizationMembers, setOrganizationMembers] = useState([]);
  const [membersByTeam, setMembersByTeam] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamMemberIds, setTeamMemberIds] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveError, setArchiveError] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberRemoval, setMemberRemoval] = useState(null);

  const canManageTeam = (team) => Boolean(org?.permissions?.can_manage_members)
    || (membersByTeam[team.id]?.members ?? []).some((membership) =>
      String(membership.user?.id ?? membership.user) === String(user?.id)
      && membership.role === 'LEAD');

  const loadTeams = useCallback(async () => {
    if (!org?.id) {
      if (!workspaceLoading) setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [response, organizationMemberResponse] = await Promise.all([
        organizationsApi.teams(org.id),
        organizationsApi.members(org.id),
      ]);
      const loadedTeams = getRows(response.data);
      setTeams(loadedTeams);
      setOrganizationMembers(getRows(organizationMemberResponse.data).filter((membership) =>
        membership.status === 'ACTIVE' && membership.is_active !== false));

      const memberships = await Promise.all(loadedTeams.map(async (team) => {
        try {
          const memberResponse = await teamsApi.members(team.id);
          return [team.id, { loading: false, members: getRows(memberResponse.data), error: '' }];
        } catch (memberError) {
          return [team.id, {
            loading: false,
            members: [],
            error: getErrorMessage(memberError, 'Could not load this team’s members.'),
          }];
        }
      }));
      setMembersByTeam(Object.fromEntries(memberships));
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Could not load teams. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [org?.id, workspaceLoading]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    const requestedTeamId = searchParams.get('manage');
    if (!requestedTeamId || loading) return;
    const team = teams.find((item) => String(item.id) === requestedTeamId);
    if (!team) return;
    setExpandedTeam(team.id);
    requestAnimationFrame(() => {
      document.getElementById(`team-${team.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [searchParams, loading, teams]);

  const filteredTeams = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return teams;
    return teams.filter((team) => `${team.name} ${team.description ?? ''}`.toLocaleLowerCase().includes(query));
  }, [teams, search]);

  const toggleMembers = (teamId) => {
    setExpandedTeam((current) => current === teamId ? null : teamId);
  };

  const handleCreateTeam = async (event) => {
    event.preventDefault();
    const name = teamName.trim();
    if (!name || !org?.id) return;
    setCreating(true);
    setCreateError('');
    try {
      const payload = { name, description: teamDescription.trim() };
      let savedTeam;
      if (editingTeam) {
        const response = await teamsApi.update(editingTeam.id, payload);
        savedTeam = response.data;
        setTeams((current) => current.map((team) => String(team.id) === String(editingTeam.id) ? savedTeam : team));
      } else {
        const response = await organizationsApi.createTeam(org.id, payload);
        savedTeam = response.data;
        setTeams((current) => [...current, savedTeam]);
        setMembersByTeam((current) => ({
          ...current,
          [savedTeam.id]: { loading: false, members: [], error: '' },
        }));
      }
      const currentMembers = membersByTeam[savedTeam.id]?.members ?? [];
      const currentByUser = new Set(currentMembers.map((membership) =>
        String(membership.user?.id ?? membership.user)));
      const selected = new Set(teamMemberIds.map(String));
      const toAdd = teamMemberIds.filter((id) => !currentByUser.has(String(id)));
      const toRemove = currentMembers.filter((membership) =>
        !selected.has(String(membership.user?.id ?? membership.user)));
      const results = await Promise.allSettled([
        ...toAdd.map((userId) => teamsApi.addMember(savedTeam.id, { user_id: Number(userId) })),
        ...toRemove.map((membership) => teamsApi.removeMember(savedTeam.id, membership.id)),
      ]);
      if (results.some((result) => result.status === 'rejected')) {
        const refreshed = await teamsApi.members(savedTeam.id);
        setMembersByTeam((current) => ({
          ...current,
          [savedTeam.id]: { loading: false, members: getRows(refreshed.data), error: '' },
        }));
        throw new Error('The team was saved, but some membership changes could not be applied. Review the selected members and save again.');
      }
      const addedMemberships = results.slice(0, toAdd.length).map((result) => result.value.data);
      setMembersByTeam((current) => ({
        ...current,
        [savedTeam.id]: {
          loading: false,
          error: '',
          members: [
            ...currentMembers.filter((membership) => selected.has(String(membership.user?.id ?? membership.user))),
            ...addedMemberships,
          ],
        },
      }));
      setTeamName('');
      setTeamDescription('');
      setTeamMemberIds([]);
      setEditingTeam(null);
      setCreateOpen(false);
    } catch (createErrorResponse) {
      setCreateError(createErrorResponse.message || getErrorMessage(createErrorResponse, 'Could not save the team.'));
    } finally {
      setCreating(false);
    }
  };

  const openCreateTeam = () => {
    setEditingTeam(null);
    setTeamName('');
    setTeamDescription('');
    setTeamMemberIds([]);
    setCreateError('');
    setCreateOpen(true);
  };

  const openEditTeam = async (team) => {
    let teamMembers = membersByTeam[team.id]?.members;
    if (membersByTeam[team.id]?.error || !teamMembers) {
      try {
        const response = await teamsApi.members(team.id);
        teamMembers = getRows(response.data);
        setMembersByTeam((current) => ({
          ...current,
          [team.id]: { loading: false, members: teamMembers, error: '' },
        }));
      } catch (loadError) {
        setCreateError(getErrorMessage(loadError, 'Could not load team members.'));
        return;
      }
    }
    setEditingTeam(team);
    setTeamName(team.name);
    setTeamDescription(team.description ?? '');
    setTeamMemberIds((teamMembers ?? [])
      .map((membership) => membership.user?.id ?? membership.user)
      .filter((id) => id != null)
      .map(String));
    setCreateError('');
    setCreateOpen(true);
  };

  const archiveTeam = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveError('');
    try {
      await teamsApi.archive(archiveTarget.id);
      setTeams((current) => current.filter((team) => team.id !== archiveTarget.id));
      setArchiveTarget(null);
    } catch (archiveRequestError) {
      setArchiveError(getErrorMessage(archiveRequestError, 'Could not archive this team.'));
    } finally {
      setArchiving(false);
    }
  };

  const removeTeamMember = async () => {
    if (!memberRemoval) return;
    const { team, membership } = memberRemoval;
    setMemberSaving(true);
    setMemberError('');
    try {
      await teamsApi.removeMember(team.id, membership.id);
      setMembersByTeam((current) => ({
        ...current,
        [team.id]: {
          ...current[team.id],
          members: current[team.id].members.filter((item) => item.id !== membership.id),
        },
      }));
      setMemberRemoval(null);
    } catch (removeError) {
      setMemberError(getErrorMessage(removeError, 'Could not remove this team member.'));
    } finally {
      setMemberSaving(false);
    }
  };

  const loadedMembers = Object.values(membersByTeam).filter((entry) => !entry.error);
  const totalMembers = new Set(loadedMembers.flatMap((entry) => entry.members.map((member) => String(member.user?.id ?? member.user)))).size;
  return (
    <AppShell org={org} user={user}>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headerCopy}>
            <span className={styles.eyebrow}>People &amp; collaboration</span>
            <h1 className={styles.title}>Teams</h1>
            <p className={styles.subtitle}>The people and shared work behind your projects.</p>
          </div>
          <button
            type="button"
            className={styles.createButton}
            onClick={openCreateTeam}
            disabled={!org?.id || !canCreateTeams}
          >
            <Plus size={15} /> New team
          </button>
        </header>

        {createOpen && (
          <TeamModal
            onBackdropClick={() => { if (!creating) setCreateOpen(false); }}
          >
            <section
              className={styles.createModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-team-title"
            >
              <header className={styles.modalHeader}>
                <div><span className={styles.eyebrow}>People &amp; collaboration</span><h2 id="create-team-title">{editingTeam ? 'Edit team' : 'Create a team'}</h2><p>{editingTeam ? 'Update team details and members.' : 'Give a group a shared home in your workspace.'}</p></div>
                <button type="button" aria-label="Close" onClick={() => setCreateOpen(false)} disabled={creating}><X size={18} /></button>
              </header>
              <form className={styles.createForm} onSubmit={handleCreateTeam}>
                <div className={styles.teamDetailsFields}>
                  <label className={styles.teamNameField} htmlFor="team-name">
                    <span>Team name</span>
                    <input id="team-name" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="e.g. Product design" maxLength={255} autoFocus required />
                  </label>
                  <label className={styles.teamNameField}>
                    <span>Description</span>
                    <textarea rows={3} value={teamDescription} onChange={(event) => setTeamDescription(event.target.value)} placeholder="What does this team work on?" />
                  </label>
                </div>
                <div className={styles.teamMemberPanel}>
                  <OrganizationMemberSelector
                    organizationId={org?.id}
                    members={organizationMembers}
                    selectedIds={teamMemberIds}
                    onChange={setTeamMemberIds}
                    label="Team members"
                    canInvite={canInviteMembers}
                    canInviteAdmins={canInviteAdmins}
                    disabled={creating}
                  />
                </div>
                {createError && <p className={styles.formError} role="alert">{createError}</p>}
                <div className={styles.modalActions}>
                  <button type="button" className={styles.modalCancel} onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</button>
                  <button type="submit" className={styles.createSubmit} disabled={creating || !teamName.trim()}>{creating ? (editingTeam ? 'Saving…' : 'Creating…') : (editingTeam ? 'Save changes' : 'Create team')}</button>
                </div>
              </form>
            </section>
          </TeamModal>
        )}

        {error && (
          <div className={styles.error} role="alert">
            <span>{error}</span>
            <button type="button" onClick={loadTeams}>Retry</button>
          </div>
        )}

        <section className={styles.summary} aria-label="Team summary">
          <div className={styles.summaryItem}>
            <span className={styles.summaryIcon}><Building2 size={16} /></span>
            <span><small>Teams</small><strong>{loading ? '—' : teams.length}</strong></span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryIcon}><Users size={16} /></span>
            <span><small>People across teams</small><strong>{loading ? '—' : totalMembers}</strong></span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryIcon}><FolderKanban size={16} /></span>
            <span><small>Projects with a team</small><strong>{workspaceLoading ? '—' : projects.filter((project) => project.team).length}</strong></span>
          </div>
        </section>

        <div className={styles.toolbar}>
          <label className={styles.searchBox}>
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search teams"
              aria-label="Search teams"
            />
          </label>
          {!loading && <span className={styles.resultCount}>{filteredTeams.length} {filteredTeams.length === 1 ? 'team' : 'teams'}</span>}
        </div>

        {taskDataError && <p className={styles.dataNotice} role="status">{taskDataError} Team task totals may be incomplete.</p>}

        <section className={styles.teamList} aria-label="Organization teams">
          {loading || workspaceLoading ? (
            <div className={styles.state}>Loading teams and shared work…</div>
          ) : filteredTeams.length === 0 ? (
            <div className={styles.empty}>
              <Users size={24} />
              <strong>{teams.length ? 'No teams match your search' : 'No teams yet'}</strong>
              <span>{teams.length ? 'Try a different search.' : 'Create a team to bring people together around shared work.'}</span>
            </div>
          ) : (
            filteredTeams.map((team, index) => {
              const memberData = membersByTeam[team.id] ?? { members: [], loading: false, error: '' };
              const expanded = expandedTeam === team.id;
              const summary = countForTeam(team, projects, tasks, memberData.members);
              const tones = [styles.markSand, styles.markSage, styles.markClay, styles.markStone];
              return (
                <article className={styles.teamCard} id={`team-${team.id}`} key={team.id}>
                  <button
                    type="button"
                    className={styles.teamHeader}
                    onClick={() => toggleMembers(team.id)}
                    aria-expanded={expanded}
                  >
                    <span className={`${styles.teamMark} ${tones[index % tones.length]}`}><Users size={17} /></span>
                    <span className={styles.teamInfo}>
                      <strong>{team.name}</strong>
                      <small>{summary.projects.length} {summary.projects.length === 1 ? 'project' : 'projects'} · {summary.tasks.length} tasks</small>
                    </span>
                    <span className={styles.cardMemberPreview}>
                      {memberData.error ? (
                        <small className={styles.loadIssue}>Members unavailable</small>
                      ) : memberData.loading ? (
                        <small>Loading people…</small>
                      ) : memberData.members.slice(0, 4).map((membership, avatarIndex) => (
                        <TeamAvatar membership={membership} key={membership.id ?? avatarIndex} />
                      ))}
                      {!memberData.loading && !memberData.error && (
                        <small className={styles.peopleCount}>{memberData.members.length} {memberData.members.length === 1 ? 'person' : 'people'}</small>
                      )}
                    </span>
                    <span className={styles.expandIcon}>{expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</span>
                  </button>
                  {canManageTeam(team) && <div className={styles.teamActions}>
                    <details>
                      <summary aria-label={`Actions for ${team.name}`}><MoreHorizontal size={17} /></summary>
                      <div>
                        <button type="button" onClick={() => openEditTeam(team)}><Pencil size={13} /> Edit team</button>
                        <button type="button" className={styles.archiveAction} onClick={() => { setArchiveError(''); setArchiveTarget(team); }}><Archive size={13} /> Archive team</button>
                      </div>
                    </details>
                  </div>}

                  <div className={styles.teamStats}>
                    <div><span>Tasks</span><strong>{summary.tasks.length}</strong></div>
                    <div><span>Completed</span><strong>{summary.tasks.filter((task) => task.status === 'COMPLETED').length}</strong></div>
                    <div><span>Unassigned</span><strong>{summary.unassigned}</strong></div>
                    <div className={styles.teamProjectNames}>
                      <span>Working on</span>
                      <strong>{summary.projects.length ? summary.projects.slice(0, 2).map((project) => project.name).join(' · ') : 'No linked projects'}</strong>
                    </div>
                  </div>

                  {expanded && (
                    <div className={styles.membersPanel}>
                      <div className={styles.panelHeading}>
                        <strong>Team people</strong>
                        <span>Assigned tasks from this team’s projects</span>
                      </div>
                      <TeamMembers
                        members={memberData.members}
                        loading={memberData.loading}
                        error={memberData.error}
                        canManage={canManageTeam(team)}
                        onRemove={(membership) => { setMemberError(''); setMemberRemoval({ team, membership }); }}
                      />
                      {canManageTeam(team) && <button type="button" className={styles.addMemberButton} onClick={() => openEditTeam(team)}><Plus size={14} /> Manage members</button>}
                      {!memberData.loading && !memberData.error && summary.workload.length > 0 && (
                        <div className={styles.workload}>
                          <span className={styles.workloadHeading}>Current assignments</span>
                          {summary.workload.slice(0, 4).map(({ membership, count }) => (
                            <div className={styles.workloadRow} key={membership.id}>
                              <span>{displayName(membership.user)}</span>
                              <strong>{count} {count === 1 ? 'task' : 'tasks'}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
        {memberRemoval && <TeamModal onBackdropClick={() => { if (!memberSaving) setMemberRemoval(null); }}>
          <section className={styles.createModal} role="alertdialog" aria-modal="true" aria-labelledby="remove-team-member-title">
            <header className={styles.modalHeader}><div><span className={styles.eyebrow}>{memberRemoval.team.name}</span><h2 id="remove-team-member-title">Remove team member?</h2><p>{displayName(memberRemoval.membership.user)} will no longer be part of this team. Their organization access is unchanged.</p></div></header>
            {memberError && <p className={styles.formError} role="alert">{memberError}</p>}
            <div className={styles.modalActions}><button type="button" className={styles.modalCancel} onClick={() => setMemberRemoval(null)} disabled={memberSaving}>Cancel</button><button type="button" className={styles.dangerButton} onClick={removeTeamMember} disabled={memberSaving}>{memberSaving ? 'Removing…' : 'Remove member'}</button></div>
          </section>
        </TeamModal>}
        {archiveTarget && <TeamModal onBackdropClick={() => { if (!archiving) setArchiveTarget(null); }}>
          <section className={styles.createModal} role="alertdialog" aria-modal="true" aria-labelledby="archive-team-title">
            <header className={styles.modalHeader}><div><span className={styles.eyebrow}>People &amp; collaboration</span><h2 id="archive-team-title">Archive {archiveTarget.name}?</h2><p>Team membership and history will be preserved. Reassign active projects before archiving this team.</p></div></header>
            {archiveError && <p className={styles.formError} role="alert">{archiveError}</p>}
            <div className={styles.modalActions}><button type="button" className={styles.modalCancel} onClick={() => setArchiveTarget(null)} disabled={archiving}>Cancel</button><button type="button" className={styles.dangerButton} onClick={archiveTeam} disabled={archiving}>{archiving ? 'Archiving…' : 'Archive team'}</button></div>
          </section>
        </TeamModal>}
      </div>
    </AppShell>
  );
}
