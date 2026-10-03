import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronUp, FolderKanban, Plus, Search, Users, X } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Avatar from '../components/Avatar';
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

function TeamMembers({ members, loading, error }) {
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
  const {
    user, org, projects, tasks, loading: workspaceLoading, taskDataError,
  } = useDashboard();
  const [teams, setTeams] = useState([]);
  const [membersByTeam, setMembersByTeam] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadTeams = useCallback(async () => {
    if (!org?.id) {
      if (!workspaceLoading) setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await organizationsApi.teams(org.id);
      const loadedTeams = getRows(response.data);
      setTeams(loadedTeams);

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

  const filteredTeams = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return teams;
    return teams.filter((team) => team.name.toLocaleLowerCase().includes(query));
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
      const response = await organizationsApi.createTeam(org.id, { name });
      setTeams((current) => [...current, response.data]);
      setMembersByTeam((current) => ({
        ...current,
        [response.data.id]: { loading: false, members: [], error: '' },
      }));
      setTeamName('');
      setCreateOpen(false);
    } catch (createErrorResponse) {
      setCreateError(getErrorMessage(createErrorResponse, 'Could not create the team.'));
    } finally {
      setCreating(false);
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
            onClick={() => { setCreateError(''); setCreateOpen(true); }}
            disabled={!org?.id}
          >
            <Plus size={15} /> New team
          </button>
        </header>

        {createOpen && (
          <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) setCreateOpen(false); }}>
            <section className={styles.createModal} role="dialog" aria-modal="true" aria-labelledby="create-team-title">
              <header className={styles.modalHeader}>
                <div><span className={styles.eyebrow}>People &amp; collaboration</span><h2 id="create-team-title">Create a team</h2><p>Give a group a shared home in your workspace.</p></div>
                <button type="button" aria-label="Close" onClick={() => setCreateOpen(false)} disabled={creating}><X size={18} /></button>
              </header>
              <form className={styles.createForm} onSubmit={handleCreateTeam}>
                <label className={styles.teamNameField} htmlFor="team-name">
                  <span>Team name</span>
                  <input id="team-name" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="e.g. Product design" maxLength={255} autoFocus required />
                </label>
                {createError && <p className={styles.formError} role="alert">{createError}</p>}
                <div className={styles.modalActions}>
                  <button type="button" className={styles.modalCancel} onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</button>
                  <button type="submit" className={styles.createSubmit} disabled={creating || !teamName.trim()}>{creating ? 'Creating…' : 'Create team'}</button>
                </div>
              </form>
            </section>
          </div>
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
                <article className={styles.teamCard} key={team.id}>
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
                      />
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
      </div>
    </AppShell>
  );
}
