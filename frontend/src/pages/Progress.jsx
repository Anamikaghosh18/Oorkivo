import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, BadgeCheck, BriefcaseBusiness, CalendarDays, Check, ChevronRight,
  Flame, Flag, Medal, MessageSquareText, Send, Sparkles,
  Target, TrendingUp, Users, Zap,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Avatar from '../components/Avatar';
import { useAuth } from '../hooks/useAuth';
import { progressApi } from '../services/api';
import './Progress.css';

const achievementIcons = {
  FIRST_FINISHER: Check,
  EARLY_BIRD: Zap,
  SPRINT_FINISHER: Flag,
  CONSISTENT: Flame,
  PROBLEM_SOLVER: Target,
  TEAM_PLAYER: Users,
  MILESTONE_MAKER: Medal,
  MOMENTUM: TrendingUp,
  TEN_COMPLETE: BadgeCheck,
  ON_TIME_TEN: CalendarDays,
  PROJECT_RANGE: BriefcaseBusiness,
  COLLABORATOR: MessageSquareText,
};

function displayDate(value, options = { month: 'short', day: 'numeric' }) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, options).format(new Date(value));
}

function ProgressBar({ value, className = '' }) {
  return (
    <div className={`progress-bar ${className}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} />
    </div>
  );
}

function SectionHeading({ eyebrow, title, trailing }) {
  return (
    <div className="progress-section-heading">
      <div>
        {eyebrow && <span className="progress-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {trailing}
    </div>
  );
}

export default function Progress() {
  const { user, org, loading: authLoading } = useAuth();
  const [summary, setSummary] = useState(null);
  const [overview, setOverview] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overviewError, setOverviewError] = useState('');
  const [teamCelebration, setTeamCelebration] = useState(null);
  const [recognitionForm, setRecognitionForm] = useState({ recipient: '', category: 'TEAMWORK', message: '' });
  const [sending, setSending] = useState(false);
  const [recognitionMessage, setRecognitionMessage] = useState('');
  const [membersError, setMembersError] = useState('');
  const [xpMoment, setXpMoment] = useState(null);

  const loadSummary = useCallback(async () => {
    if (!org?.id) return;
    setLoading(true);
    setError('');
    try {
      const response = await progressApi.mine();
      const nextSummary = response.data;
      const storageKey = `oorkivo-progress:${org.id}:${nextSummary.profile.id}`;
      const previousXp = localStorage.getItem(`${storageKey}:xp`);
      const previousLevel = localStorage.getItem(`${storageKey}:level`);
      if (previousXp !== null) {
        const xpGained = nextSummary.xp.total - Number(previousXp);
        if (nextSummary.xp.level > Number(previousLevel)) {
          setXpMoment({
            type: 'level',
            from: Number(previousLevel),
            to: nextSummary.xp.level,
          });
        } else if (xpGained > 0) {
          setXpMoment({ type: 'xp', amount: xpGained });
        }
      }
      localStorage.setItem(`${storageKey}:xp`, String(nextSummary.xp.total));
      localStorage.setItem(`${storageKey}:level`, String(nextSummary.xp.level));
      setSummary(nextSummary);
    } catch (err) {
      setError(err.response?.data?.detail || 'Progress could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [org?.id]);

  useEffect(() => {
    if (!xpMoment) return undefined;
    const timeout = window.setTimeout(() => setXpMoment(null), 1900);
    return () => window.clearTimeout(timeout);
  }, [xpMoment]);

  useEffect(() => {
    if (authLoading) return;
    if (!org?.id) {
      setLoading(false);
      return;
    }
    loadSummary();
  }, [authLoading, org?.id, loadSummary]);

  useEffect(() => {
    if (!org?.id || summary === null) return undefined;
    if (!summary.can_view_team_progress) {
      setOverview(null);
      setOverviewError('');
      return undefined;
    }
    let active = true;
    progressApi.overview()
      .then(({ data }) => {
        if (active) setOverview(data);
      })
      .catch((err) => {
        if (active) {
          setOverviewError(err.response?.data?.detail || 'The team overview could not be loaded.');
        }
      });
    return () => { active = false; };
  }, [org?.id, summary?.can_view_team_progress]);

  useEffect(() => {
    if (!org?.id) return undefined;
    let active = true;
    const storageKey = `oorkivo-team-celebration:${org.id}`;
    progressApi.celebrations()
      .then(({ data }) => {
        if (!active || !data.length) return;
        const latestId = Math.max(...data.map((item) => Number(item.id)));
        const lastSeenId = Number(localStorage.getItem(storageKey) || 0);
        const newest = data.find((item) => Number(item.id) > lastSeenId);
        localStorage.setItem(storageKey, String(Math.max(latestId, lastSeenId)));
        if (newest && Date.now() - new Date(newest.created_at).getTime() < 24 * 60 * 60 * 1000) {
          setTeamCelebration(newest);
        }
      })
      .catch((err) => {
        if (active && err.response?.status !== 404) {
          console.error('Unable to load shared project celebrations.', err);
        }
      });
    return () => { active = false; };
  }, [org?.id]);

  useEffect(() => {
    if (!teamCelebration) return undefined;
    const timeout = window.setTimeout(() => setTeamCelebration(null), 4800);
    return () => window.clearTimeout(timeout);
  }, [teamCelebration]);

  useEffect(() => {
    if (!org?.id) return undefined;
    let active = true;
    progressApi.members()
      .then(({ data }) => {
        if (!active) return;
        const rows = Array.isArray(data) ? data : data.results || [];
        setMembers(rows.map((membership) => {
          const member = membership.user || membership;
          return { ...member, id: member.id, name: `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email };
        }));
      })
      .catch((err) => {
        if (active) setMembersError(err.response?.data?.detail || 'Organization members could not be loaded.');
      });
    return () => { active = false; };
  }, [org?.id]);

  const projectContribution = useMemo(() => summary?.contribution || [], [summary]);
  const achievements = summary?.achievements || [];
  const currentSprint = summary?.current_sprint;
  const profile = summary?.profile;
  const level = summary?.xp;

  const sendRecognition = async (event) => {
    event.preventDefault();
    if (!recognitionForm.recipient || !recognitionForm.message.trim()) return;
    setSending(true);
    setRecognitionMessage('');
    try {
      await progressApi.recognize({
        recipient: Number(recognitionForm.recipient),
        category: recognitionForm.category,
        message: recognitionForm.message.trim(),
      });
      setRecognitionForm((current) => ({ ...current, message: '' }));
      setRecognitionMessage('Recognition sent.');
      await loadSummary();
    } catch (err) {
      setRecognitionMessage(err.response?.data?.detail || 'Recognition could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const pageContent = (
    <div className="progress-page">
      <header className="progress-page-header">
        <div>
          <span className="progress-eyebrow">YOUR WORK, RECOGNIZED</span>
          <h1>Progress</h1>
          <p>A clear view of your contribution, momentum, and growth.</p>
        </div>
        <div className="progress-header-context">
          <BriefcaseBusiness size={16} />
          <span>{org?.name || 'Your organization'}</span>
        </div>
      </header>

      {!org?.id && !authLoading && (
        <div className="progress-empty-state">Join an organization to see your progress.</div>
      )}
      {error && <div className="progress-error" role="alert">{error}</div>}
      {loading && <div className="progress-loading">Loading your progress…</div>}
      {xpMoment && (
        <div className={`progress-moment ${xpMoment.type === 'level' ? 'is-level-up' : ''}`} role="status" aria-live="polite">
          <span className="progress-moment-icon">{xpMoment.type === 'level' ? <Sparkles size={17} /> : <Zap size={16} />}</span>
          <span>
            {xpMoment.type === 'level'
              ? <><strong>Level up</strong> Level {xpMoment.from} → Level {xpMoment.to}</>
              : <><strong>Progress updated</strong> +{xpMoment.amount} XP earned</>}
          </span>
        </div>
      )}
      {teamCelebration && (
        <div className="progress-celebration-toast" role="status" aria-live="polite">
          <span className="progress-celebration-icon">
            {teamCelebration.kind === 'sprint' ? <Flag size={17} />
              : teamCelebration.kind === 'milestone' ? <Medal size={17} />
                : <TrendingUp size={17} />}
          </span>
          <span><strong>{teamCelebration.headline}</strong>{teamCelebration.message}</span>
          <button type="button" aria-label="Dismiss celebration" onClick={() => setTeamCelebration(null)}>×</button>
        </div>
      )}

      {summary && profile && (
        <>
          <section className="progress-profile-card">
            <div className="progress-profile-identity">
              <Avatar user={{ ...profile, avatar_url: profile.avatar_url || user?.avatar_url }} size={72} />
              <div>
                <h2>{profile.name}</h2>
                <div className="progress-profile-meta">
                  {(profile.job_title || profile.organization_role) && <span>{profile.job_title || profile.organization_role}</span>}
                  {profile.teams?.length > 0 && <><i /> <span>{profile.teams.join(', ')}</span></>}
                </div>
                <span className="progress-active-status"><i /> Active contributor</span>
              </div>
            </div>
            <div className="progress-level">
              <div className="progress-level-line">
                <span className="progress-level-label"><Sparkles size={15} /> LEVEL {level.level}</span>
                <strong>{level.total.toLocaleString()} XP</strong>
              </div>
              <ProgressBar value={level.progress_percent} className="progress-level-bar" />
              <div className="progress-level-caption">
                <span>{level.xp_in_level} XP in this level</span>
                <span>{level.xp_to_next_level} XP to level {level.level + 1}</span>
              </div>
              {summary.xp.recent?.length > 0 && (
                <span className="progress-last-earned">Latest: +{summary.xp.recent[0].amount} XP</span>
              )}
            </div>
            <div className="progress-streak-card">
              <div className="progress-streak-title"><Flame size={17} /> <strong>{summary.streak.current} day streak</strong></div>
              <p>Meaningful work, day by day.</p>
              <div className="progress-week" aria-label="Activity in the last seven days">
                {summary.streak.week.map((day) => (
                  <div key={day.date} className={day.active ? 'is-active' : ''}>
                    <span>{new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(new Date(`${day.date}T12:00:00`))}</span>
                    <i>{day.active ? <Check size={12} /> : ''}</i>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="progress-stat-grid">
            <article className="progress-stat-card">
              <span className="progress-stat-icon"><Check size={17} /></span>
              <span>Tasks completed</span>
              <strong>{summary.stats.completed_tasks}</strong>
              <small>Across your projects</small>
            </article>
            <article className="progress-stat-card">
              <span className="progress-stat-icon"><CalendarDays size={17} /></span>
              <span>On-time completion</span>
              <strong>{summary.stats.on_time_percent}%</strong>
              <small>{summary.stats.on_time_completions} completed on time</small>
            </article>
            <article className="progress-stat-card">
              <span className="progress-stat-icon"><Award size={17} /></span>
              <span>Achievements</span>
              <strong>{summary.stats.achievements_unlocked}<small> / {achievements.length}</small></strong>
              <small>Milestones earned</small>
            </article>
            <article className="progress-stat-card">
              <span className="progress-stat-icon"><MessageSquareText size={17} /></span>
              <span>Recognition</span>
              <strong>{summary.stats.recognitions_received}</strong>
              <small>From your teammates</small>
            </article>
          </div>

          <div className="progress-content-grid">
            <div className="progress-main-column">
              <section className="progress-panel">
                <SectionHeading eyebrow="SPRINT MOMENTUM" title="Current sprint" />
                {currentSprint ? (
                  <div className="progress-sprint">
                    <div className="progress-sprint-heading">
                      <div className="progress-sprint-icon"><Flag size={18} /></div>
                      <div><strong>{currentSprint.name}</strong><span>{currentSprint.project}</span></div>
                      <span className="progress-sprint-percent">{currentSprint.completion_percent}%</span>
                    </div>
                    <ProgressBar value={currentSprint.completion_percent} />
                    <div className="progress-sprint-foot">
                      <span>{currentSprint.completed_tasks} / {currentSprint.total_tasks} assigned tasks complete</span>
                      <span>On-time {currentSprint.on_time_percent}%</span>
                      <span>{currentSprint.contribution}</span>
                    </div>
                  </div>
                ) : (
                  <div className="progress-inline-empty">No active sprint with assigned work right now.</div>
                )}
              </section>

              <section className="progress-panel">
                <SectionHeading eyebrow="YOUR PORTFOLIO" title="Project contribution" />
                {projectContribution.length ? (
                  <div className="progress-project-list">
                    {projectContribution.map((project) => (
                      <div className="progress-project-row" key={project.id}>
                        <div className="progress-project-heading">
                          <strong>{project.name}</strong>
                          <span>{project.completed_tasks} / {project.total_tasks} tasks</span>
                        </div>
                        <ProgressBar value={project.completion_percent} />
                      </div>
                    ))}
                  </div>
                ) : <div className="progress-inline-empty">Your project contributions will appear here.</div>}
              </section>

              <section className="progress-panel">
                <SectionHeading eyebrow="MILESTONES" title="Achievements" trailing={<span className="progress-subtle-count">{summary.stats.achievements_unlocked} earned</span>} />
                <div className="progress-achievements">
                  {achievements.map((achievement, index) => {
                    const Icon = achievementIcons[achievement.key] || Award;
                    const earned = achievement.unlocked;
                    return (
                      <article className={`progress-achievement ${earned ? 'is-earned' : ''}`} key={achievement.key}>
                        <span className={`progress-achievement-icon ${earned ? `progress-tone-${['sage', 'clay', 'amber', 'slate'][index % 4]}` : ''}`}><Icon size={20} /></span>
                        <strong>{achievement.name}</strong>
                        <p>{achievement.description}</p>
                        <div className="progress-achievement-foot">
                          {earned ? <span className="progress-earned"><Check size={12} /> Earned</span> : <span>{achievement.progress} / {achievement.target}</span>}
                          <span>+{achievement.xp_reward} XP</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>

            <aside className="progress-side-column">
              <section className="progress-panel">
                <SectionHeading eyebrow="TEAM APPRECIATION" title="Give recognition" />
                <form className="progress-recognition-form" onSubmit={sendRecognition}>
                  <label>
                    Teammate
                    <select value={recognitionForm.recipient} onChange={(event) => setRecognitionForm((current) => ({ ...current, recipient: event.target.value }))} required>
                      <option value="">Select a teammate</option>
                          {members.filter((member) => member.id !== user?.id).map((member) => (
                            <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Recognition
                    <select value={recognitionForm.category} onChange={(event) => setRecognitionForm((current) => ({ ...current, category: event.target.value }))}>
                      <option value="TEAMWORK">Great teamwork</option>
                      <option value="MENTORSHIP">Mentorship</option>
                      <option value="DELIVERY">Reliable delivery</option>
                      <option value="PROBLEM_SOLVING">Problem solving</option>
                    </select>
                  </label>
                  <label>
                    A note for them
                    <textarea value={recognitionForm.message} onChange={(event) => setRecognitionForm((current) => ({ ...current, message: event.target.value }))} maxLength={240} rows={3} placeholder="Call out the contribution you appreciated…" required />
                  </label>
                  {membersError && <span className="progress-form-error" role="status">{membersError}</span>}
                  {recognitionMessage && <span className={recognitionMessage === 'Recognition sent.' ? 'progress-form-success' : 'progress-form-error'} role="status">{recognitionMessage}</span>}
                  <button className="progress-send-button" type="submit" disabled={sending || !members.length}>
                    <Send size={15} /> {sending ? 'Sending…' : 'Send recognition'}
                  </button>
                </form>
              </section>

              <section className="progress-panel">
                <SectionHeading eyebrow="TEAM APPRECIATION" title="Recognition received" />
                {summary.recognitions.length ? (
                  <div className="progress-recognition-list">
                    {summary.recognitions.map((recognition) => (
                      <article key={recognition.id}>
                        <Avatar user={{ email: recognition.giver }} size={32} />
                        <div><strong>{recognition.giver}</strong><span>{recognition.category.replaceAll('_', ' ')}</span><p>{recognition.message}</p></div>
                      </article>
                    ))}
                  </div>
                ) : <div className="progress-inline-empty">Recognition from teammates will show up here.</div>}
              </section>

              <section className="progress-panel">
                <SectionHeading eyebrow="YOUR TIMELINE" title="Recent activity" />
                {summary.recent_activity.length ? (
                  <div className="progress-activity-list">
                    {summary.recent_activity.map((activity) => (
                      <article key={activity.id}>
                        <span className="progress-activity-dot" />
                        <div><strong>{activity.action}</strong><span>{activity.task || activity.project}</span><small>{displayDate(activity.created_at)}</small></div>
                        <ChevronRight size={15} />
                      </article>
                    ))}
                  </div>
                ) : <div className="progress-inline-empty">Meaningful work activity will appear here.</div>}
              </section>
            </aside>
          </div>

          {overview && (
            <section className="progress-panel progress-overview-panel">
              <SectionHeading
                eyebrow="MANAGER VIEW"
                title="Collective progress"
                trailing={<span className="progress-subtle-count"><Users size={14} /> {overview.projects.length} projects</span>}
              />
              {overview.projects.length > 0 && (
                <div className="progress-manager-projects">
                  {overview.projects.map((project) => (
                    <article className="progress-manager-project" key={project.id}>
                      <div className="progress-project-heading">
                        <strong>{project.name}</strong>
                        <span>{project.completion_percent}%</span>
                      </div>
                      <ProgressBar value={project.completion_percent} />
                      <div className="progress-manager-project-meta">
                        <span>{project.team || project.status.toLowerCase().replaceAll('_', ' ')}</span>
                        <span>{project.completed_tasks} / {project.total_tasks} tasks</span>
                      </div>
                      {project.active_sprint && (
                        <div className="progress-manager-sprint">
                          <Flag size={13} />
                          <span>{project.active_sprint.name}</span>
                          <strong>{project.active_sprint.completion_percent}%</strong>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
              {overview.teams.length > 0 && (
                <div className="progress-manager-teams">
                  {overview.teams.map((team) => (
                    <article className="progress-manager-team" key={team.id}>
                      <div className="progress-project-heading">
                        <strong>{team.name}</strong>
                        <span>{team.project_count} projects</span>
                      </div>
                      <span className="progress-manager-team-tasks">
                        {team.completion_percent}% project completion · {team.completed_tasks} / {team.total_tasks} tasks
                      </span>
                      <ProgressBar value={team.completion_percent} />
                    </article>
                  ))}
                </div>
              )}
              {!overview.projects.length && !overview.teams.length && (
                <div className="progress-inline-empty">No shared project or team progress to display yet.</div>
              )}
            </section>
          )}
          {overviewError && <div className="progress-error progress-overview-error" role="status">{overviewError}</div>}
        </>
      )}
    </div>
  );

  return <AppShell org={org} user={user}>{pageContent}</AppShell>;
}
