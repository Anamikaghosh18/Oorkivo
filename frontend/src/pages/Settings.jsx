import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, Building2, Camera, Check, LockKeyhole, MoreHorizontal, Pencil, Settings as SettingsIcon, ShieldCheck, Trash2, UserRound, Users, X, ArrowUpRight } from 'lucide-react';
import Avatar from '../components/Avatar';
import { useAuth } from '../hooks/useAuth';
import { authApi, organizationsApi } from '../services/api';
import styles from './Settings.module.css';

const NAV_ITEMS = [
  { id: 'profile', label: 'Profile', group: 'Account', icon: UserRound },
  { id: 'preferences', label: 'Preferences', group: 'Account', icon: SettingsIcon },
  { id: 'notifications', label: 'Notifications', group: 'Account', icon: Bell },
  { id: 'sessions', label: 'Sessions', group: 'Security', icon: LockKeyhole },
];

const NOTIFICATION_CATEGORIES = [
  { title: 'Task activity', items: [
    ['task_assignments', 'Task assignments', 'When a task is assigned to you.'],
    ['task_status_changes', 'Task status changes', 'Updates to tasks assigned to you.'],
    ['task_comments', 'Task comments', 'New comments on your tasks.'],
    ['task_mentions', 'Task mentions', 'When someone mentions you in a task.'],
  ] },
  { title: 'Projects', items: [
    ['project_updates', 'Project updates', 'Meaningful updates to projects you can access.'],
    ['milestone_updates', 'Milestone updates', 'Milestones completed in your projects.'],
  ] },
  { title: 'Sprints', items: [
    ['sprint_started', 'Sprint started', 'When a sprint you can access starts.'],
    ['sprint_ending_soon', 'Sprint ending soon', 'A day before an active sprint ends.'],
  ] },
  { title: 'Reminders', items: [
    ['due_date_reminders', 'Due date reminders', 'A reminder the day before an assigned task is due.'],
    ['overdue_task_reminders', 'Overdue task reminders', 'A reminder for assigned tasks past their due date.'],
  ] },
];

function rows(data) {
  const result = data?.results ?? data;
  return Array.isArray(result) ? result : [];
}

function getError(error, fallback) {
  const data = error.response?.data;
  if (typeof data?.detail === 'string') return data.detail;
  if (data && typeof data === 'object') {
    const first = Object.values(data).flat()[0];
    if (typeof first === 'string') return first;
  }
  return fallback;
}

function organizationRoleLabel(role) {
  return ({ OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' })[role] ?? 'Member';
}

function displayNameForMembership(membership) {
  return [membership.user?.first_name, membership.user?.last_name].filter(Boolean).join(' ')
    || membership.user?.email
    || 'Member';
}

function SaveFeedback({ error, saved }) {
  if (error) return <p className={styles.formError} role="alert">{error}</p>;
  if (saved) return <p className={styles.savedMessage} role="status"><Check size={14} /> Changes saved</p>;
  return null;
}

function MemberActionsMenu({ email, canChangeRole, onChangeRole, onRemove }) {
  const [position, setPosition] = useState(null);
  const itemCount = Number(canChangeRole) + 1;
  const menuHeight = itemCount * 36 + 10;
  useEffect(() => {
    if (!position) return undefined;
    const closeOnScroll = () => setPosition(null);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => window.removeEventListener('scroll', closeOnScroll, true);
  }, [position]);

  const toggleMenu = (event) => {
    if (position) {
      setPosition(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const top = bounds.top >= menuHeight + 8
      ? bounds.top - menuHeight - 4
      : Math.min(bounds.bottom + 4, window.innerHeight - menuHeight - 8);
    setPosition({
      top: Math.max(8, top),
      left: Math.min(bounds.right - 190, window.innerWidth - 198),
    });
  };

  return <>
    <button type="button" className={styles.memberActionsTrigger}
      aria-label={`Actions for ${email ?? 'member'}`} aria-expanded={Boolean(position)}
      onClick={toggleMenu}>
      <MoreHorizontal size={17} />
    </button>
    {position && createPortal(
      <div className={styles.memberActionsLayer} role="presentation" onMouseDown={() => setPosition(null)}>
        <ul className={styles.memberActionsMenu} style={position} onMouseDown={(event) => event.stopPropagation()}>
          {canChangeRole && <li><button type="button" onClick={() => { setPosition(null); onChangeRole(); }}><Pencil size={13} /> Change role</button></li>}
          <li><button type="button" className={styles.removeMemberAction} onClick={() => { setPosition(null); onRemove(); }}><Trash2 size={13} /> Remove from organization</button></li>
        </ul>
      </div>,
      document.body,
    )}
  </>;
}

function ProfileSettings({ user, onUserUpdated }) {
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setFirstName(user?.first_name ?? '');
    setLastName(user?.last_name ?? '');
    setTimezone(user?.timezone ?? 'UTC');
  }, [user?.id, user?.first_name, user?.last_name, user?.timezone]);

  const currentName = `${user?.first_name ?? ''}|${user?.last_name ?? ''}|${user?.timezone ?? 'UTC'}`;
  const draftName = `${firstName}|${lastName}|${timezone}`;
  const changed = currentName !== draftName;
  const work = user?.organization_memberships?.find((item) => String(item.organization_id) === String(localStorage.getItem('current_organization_id')))
    ?? user?.organization_memberships?.[0];

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const response = await authApi.updateProfile({ first_name: firstName.trim(), last_name: lastName.trim(), timezone: timezone.trim() });
      onUserUpdated(response.data);
      setSaved(true);
    } catch (saveError) {
      setError(getError(saveError, 'Could not save your profile.'));
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const data = new FormData();
    data.append('avatar', file);
    setError('');
    setSaved(false);
    try {
      const response = await authApi.uploadAvatar(data);
      onUserUpdated(response.data);
      setSaved(true);
    } catch (uploadError) {
      setError(getError(uploadError, 'Could not upload this image.'));
    }
  };

  const removeAvatar = async () => {
    setError('');
    setSaved(false);
    try {
      await authApi.removeAvatar();
      onUserUpdated({ ...user, avatar_url: null });
      setSaved(true);
    } catch (removeError) {
      setError(getError(removeError, 'Could not remove your profile photo.'));
    }
  };

  return (
    <form className={styles.settingsForm} onSubmit={save}>
      <section className={styles.profileHeader}>
        <Avatar user={user} size={76} />
        <div className={styles.profileSummary}>
          <h2>{[user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Your profile'}</h2>
          <p>{work ? organizationRoleLabel(work.access_level) : 'Oorkivo member'}</p>
          <div className={styles.avatarActions}>
            <label className={styles.secondaryButton}><Camera size={14} /> Change photo
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={uploadAvatar} />
            </label>
            {user?.avatar_url && <button type="button" className={styles.textButton} onClick={removeAvatar}><Trash2 size={14} /> Remove</button>}
          </div>
        </div>
      </section>

      <section className={styles.settingsSection}>
        <div className={styles.sectionHeading}><h3>Personal information</h3><p>Update how your profile appears to your workspace.</p></div>
        <div className={styles.formGrid}>
          <label className={styles.field}><span>First name</span><input value={firstName} onChange={(event) => { setFirstName(event.target.value); setSaved(false); }} maxLength={150} required /></label>
          <label className={styles.field}><span>Last name</span><input value={lastName} onChange={(event) => { setLastName(event.target.value); setSaved(false); }} maxLength={150} /></label>
          <label className={styles.field}><span>Email</span><input value={user?.email ?? ''} readOnly disabled /><small>Email changes aren't enabled for this sign-in method.</small></label>
          <label className={styles.field}><span>Timezone</span><input value={timezone} onChange={(event) => { setTimezone(event.target.value); setSaved(false); }} placeholder="Europe/London" required /><small>Use an IANA timezone such as America/Los_Angeles.</small></label>
        </div>
      </section>

      <section className={styles.settingsSection}>
        <div className={styles.sectionHeading}><h3>Work information</h3><p>Organization roles are managed by workspace administrators.</p></div>
        {work ? <dl className={styles.readOnlyGrid}>
          <div><dt>Organization</dt><dd>{work.organization}</dd></div>
          <div><dt>Team</dt><dd>{work.teams?.join(', ') || 'No team assigned'}</dd></div>
          <div><dt>Organization role</dt><dd>{organizationRoleLabel(work.access_level)}</dd></div>
        </dl> : <p className={styles.emptyState}>You are not a member of an organization yet.</p>}
      </section>

      <SaveFeedback error={error} saved={saved} />
      {changed && <div className={styles.saveBar}><span>You have unsaved changes</span><button type="button" className={styles.textButton} onClick={() => { setFirstName(user?.first_name ?? ''); setLastName(user?.last_name ?? ''); setTimezone(user?.timezone ?? 'UTC'); setError(''); setSaved(false); }}>Discard</button><button className={styles.primaryButton} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>}
    </form>
  );
}

function PreferenceSettings() {
  const [values, setValues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [initial, setInitial] = useState('');

  useEffect(() => {
    let current = true;
    authApi.preferences().then(({ data }) => {
      if (!current) return;
      setValues(data);
      setInitial(JSON.stringify(data));
    }).catch((loadError) => {
      if (current) setError(getError(loadError, 'Could not load your preferences.'));
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  const changed = values && JSON.stringify(values) !== initial;
  const update = (key, value) => { setValues((current) => ({ ...current, [key]: value })); setSaved(false); };
  useEffect(() => {
    if (!values) return undefined;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const dark = values.theme === 'DARK' || (values.theme === 'SYSTEM' && mediaQuery.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    applyTheme();
    if (values.theme !== 'SYSTEM') return undefined;
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [values?.theme]);
  const save = async (event) => {
    event.preventDefault();
    setSaving(true); setSaved(false); setError('');
    try {
      const response = await authApi.updatePreferences(values);
      setValues(response.data);
      setInitial(JSON.stringify(response.data));
      setSaved(true);
    } catch (saveError) {
      setError(getError(saveError, 'Could not save your preferences.'));
    } finally { setSaving(false); }
  };

  if (loading) return <div className={styles.loading}>Loading preferences…</div>;
  if (!values) return <SaveFeedback error={error} />;
  return (
    <form className={styles.settingsForm} onSubmit={save}>
      <section className={styles.settingsSection}>
        <div className={styles.sectionHeading}><h3>Appearance</h3><p>Choose how Oorkivo looks on this device.</p></div>
        <label className={styles.field}><span>Theme</span><select value={values.theme} onChange={(event) => update('theme', event.target.value)}><option value="SYSTEM">System</option><option value="LIGHT">Light</option><option value="DARK">Dark</option></select></label>
        <p className={styles.helperText}>Your selection is previewed immediately and used throughout Oorkivo.</p>
      </section>
      <section className={styles.settingsSection}>
        <div className={styles.sectionHeading}><h3>Task preferences</h3><p>Choose your starting points for everyday work.</p></div>
        <div className={styles.formGrid}>
          <label className={styles.field}><span>Default task view</span><select value={values.default_task_view} onChange={(event) => update('default_task_view', event.target.value)}><option value="MY_WORK">My Work</option><option value="LIST">List</option><option value="BOARD">Board</option></select></label>
          <label className={styles.field}><span>Default project view</span><select value={values.default_project_view} onChange={(event) => update('default_project_view', event.target.value)}><option value="OVERVIEW">Overview</option><option value="TASKS">Tasks</option><option value="ACTIVITY">Activity</option></select></label>
        </div>
      </section>
      <section className={styles.settingsSection}>
        <div className={styles.sectionHeading}><h3>Behavior</h3><p>Choose where a task opens when you select it.</p></div>
        <fieldset className={styles.radioGroup}><legend>Open tasks in</legend>
          {[['SAME_PAGE', 'Same page'], ['DETAIL_VIEW', 'Detail view']].map(([value, label]) => <label key={value}><input type="radio" name="task-open-behavior" value={value} checked={values.task_open_behavior === value} onChange={() => update('task_open_behavior', value)} />{label}</label>)}
        </fieldset>
      </section>
      <SaveFeedback error={error} saved={saved} />
      {changed && <div className={styles.saveBar}><span>You have unsaved changes</span><button type="button" className={styles.textButton} onClick={() => { setValues(JSON.parse(initial)); setSaved(false); setError(''); }}>Discard</button><button className={styles.primaryButton} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>}
    </form>
  );
}

function NotificationSettings() {
  const [values, setValues] = useState(null);
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    authApi.preferences().then(({ data }) => {
      if (!current) return;
      setValues(data); setInitial(JSON.stringify(data));
    }).catch((loadError) => { if (current) setError(getError(loadError, 'Could not load notification settings.')); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  const changed = values && JSON.stringify(values) !== initial;
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setSaved(false); setError('');
    try {
      const response = await authApi.updatePreferences(values);
      setValues(response.data); setInitial(JSON.stringify(response.data)); setSaved(true);
    } catch (saveError) { setError(getError(saveError, 'Could not save notification settings.')); }
    finally { setSaving(false); }
  };
  if (loading) return <div className={styles.loading}>Loading notification settings…</div>;
  if (!values) return <SaveFeedback error={error} />;
  return (
    <form className={styles.settingsForm} onSubmit={save}>
      {NOTIFICATION_CATEGORIES.map((category) => <section className={styles.settingsSection} key={category.title}>
        <div className={styles.sectionHeading}><h3>{category.title}</h3></div>
        <div className={styles.toggleList}>
          {category.items.map(([key, label, description]) => <label className={styles.toggleRow} key={key}>
            <span><strong>{label}</strong><small>{description}</small></span>
            <input type="checkbox" checked={Boolean(values[key])} onChange={(event) => { setValues((current) => ({ ...current, [key]: event.target.checked })); setSaved(false); }} />
          </label>)}
        </div>
      </section>)}
      <p className={styles.helperText}>Due and sprint reminders are generated when you open notifications; this workspace does not run a background delivery service.</p>
      <SaveFeedback error={error} saved={saved} />
      {changed && <div className={styles.saveBar}><span>You have unsaved changes</span><button type="button" className={styles.textButton} onClick={() => { setValues(JSON.parse(initial)); setSaved(false); setError(''); }}>Discard</button><button className={styles.primaryButton} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>}
    </form>
  );
}

function SessionSettings({ onSignOut }) {
  const [browser] = useState(() => {
    const agent = navigator.userAgent;
    const name = /Firefox/i.test(agent) ? 'Firefox' : /Edg/i.test(agent) ? 'Microsoft Edge' : /Chrome/i.test(agent) ? 'Chrome' : /Safari/i.test(agent) ? 'Safari' : 'Browser';
    const os = /Windows/i.test(agent) ? 'Windows' : /Mac OS/i.test(agent) ? 'macOS' : /Android/i.test(agent) ? 'Android' : /iPhone|iPad/i.test(agent) ? 'iOS' : /Linux/i.test(agent) ? 'Linux' : 'this device';
    return `${name} · ${os}`;
  });
  return <section className={styles.settingsSection}>
    <div className={styles.sectionHeading}><h3>Current session</h3><p>JWT authentication keeps this session in the current browser.</p></div>
    <div className={styles.sessionRow}><LockKeyhole size={18} /><span><strong>{browser}</strong><small>Active in this browser</small></span><span className={styles.currentTag}>Current</span></div>
    <p className={styles.helperText}>This sign-in system does not expose a server-side session list or remote session revocation.</p>
    <button type="button" className={styles.secondaryButton} onClick={onSignOut}>Sign out</button>
  </section>;
}

function OrganizationSettings({ org, onUpdated }) {
  const [name, setName] = useState(org?.name ?? '');
  const [description, setDescription] = useState(org?.description ?? '');
  const [logo, setLogo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setName(org?.name ?? ''); setDescription(org?.description ?? ''); }, [org?.id, org?.name, org?.description]);
  const changed = name !== (org?.name ?? '') || description !== (org?.description ?? '') || Boolean(logo);
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setSaved(false); setError('');
    try {
      const payload = logo ? new FormData() : { name: name.trim(), description };
      if (logo) { payload.append('name', name.trim()); payload.append('description', description); payload.append('logo', logo); }
      const response = await organizationsApi.update(org.id, payload);
      onUpdated(response.data); setLogo(null); setSaved(true);
    } catch (saveError) { setError(getError(saveError, 'Could not save organization settings.')); }
    finally { setSaving(false); }
  };
  return <form className={styles.settingsForm} onSubmit={save}>
    <section className={styles.settingsSection}>
      <div className={styles.sectionHeading}><h3>Organization</h3><p>Workspace identity and shared details.</p></div>
    <dl className={styles.readOnlyGrid}><div><dt>Plan</dt><dd>{org?.plan ?? 'FREE'}</dd></div></dl>
      <label className={styles.field}><span>Organization name</span><input value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} maxLength={255} required /></label>
      <label className={styles.field}><span>Description</span><textarea rows={3} value={description} onChange={(event) => { setDescription(event.target.value); setSaved(false); }} /></label>
      <label className={styles.field}><span>Logo</span><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => setLogo(event.target.files?.[0] ?? null)} /><small>{logo?.name || (org?.logo_url ? 'A logo is currently set.' : 'PNG, JPEG, GIF, or WebP; 5 MB maximum.')}</small></label>
    </section>
    <SaveFeedback error={error} saved={saved} />
    {changed && <div className={styles.saveBar}><span>You have unsaved changes</span><button type="button" className={styles.textButton} onClick={() => { setName(org?.name ?? ''); setDescription(org?.description ?? ''); setLogo(null); }}>Discard</button><button className={styles.primaryButton} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>}
  </form>;
}

function MembersSettings({ org }) {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState(null);
  const [roleDraft, setRoleDraft] = useState('MEMBER');
  const [savingRole, setSavingRole] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [memberActionError, setMemberActionError] = useState('');
  const canManageMembers = Boolean(org.permissions?.can_manage_members)
    || ['OWNER', 'ADMIN'].includes(org.access_level);
  const isOwner = org.access_level === 'OWNER';
  const isOrganizationOwner = (membership) => membership.user?.id === org.owner?.id
    || membership.access_level === 'OWNER';
  useEffect(() => {
    let current = true;
    Promise.all([organizationsApi.members(org.id), organizationsApi.invitations(org.id)]).then(([memberResponse, invitationResponse]) => {
      if (current) {
        setMembers(rows(memberResponse.data));
        setInvitations(rows(invitationResponse.data));
      }
    }).catch((loadError) => { if (current) setError(getError(loadError, 'Could not load organization members.')); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [org.id]);
  const invite = async (event) => {
    event.preventDefault();
    setInviting(true);
    setInviteLink('');
    setInviteCode('');
    setError('');
    try {
      const { data } = await organizationsApi.invite(org.id, {
        email: inviteEmail.trim(),
        access_level: inviteRole,
      });
      setInvitations((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      setInviteLink(`${window.location.origin}${data.accept_url}`);
      setInviteCode(data.invitation_code);
      setInviteEmail('');
    } catch (inviteError) {
      setError(getError(inviteError, 'Could not create this invitation.'));
    } finally {
      setInviting(false);
    }
  };
  const copyValue = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setError('Could not copy to clipboard. Please select and copy the value.');
    }
  };
  const saveMemberRole = async (event) => {
    event.preventDefault();
    if (!roleTarget) return;
    setSavingRole(true);
    setMemberActionError('');
    try {
      const { data } = await organizationsApi.updateMember(org.id, roleTarget.id, { access_level: roleDraft });
      setMembers((current) => current.map((membership) => membership.id === roleTarget.id ? data : membership));
      setRoleTarget(null);
    } catch (roleError) {
      setMemberActionError(getError(roleError, 'Could not update this member’s role.'));
    } finally {
      setSavingRole(false);
    }
  };
  const removeOrganizationMember = async () => {
    if (!removeTarget) return;
    setRemovingMember(true);
    setMemberActionError('');
    try {
      await organizationsApi.removeMember(org.id, removeTarget.id);
      setMembers((current) => current.map((membership) => membership.id === removeTarget.id
        ? { ...membership, status: 'REMOVED', is_active: false }
        : membership));
      setRemoveTarget(null);
    } catch (removeError) {
      setMemberActionError(getError(removeError, 'Could not remove this organization member.'));
    } finally {
      setRemovingMember(false);
    }
  };
  return <section className={styles.settingsSection}>
    <div className={styles.sectionHeading}><h3>Members</h3><p>People with access to {org.name}.</p><button type="button" className={styles.secondaryButton} onClick={() => { setError(''); setInviteOpen(true); }}>Invite members</button></div>
    <p className={styles.helperText}>Invitation codes are single-use and expire after seven days.</p>
    {inviteOpen && <div className={styles.inviteBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !inviting) setInviteOpen(false); }}>
      <section className={styles.inviteDialog} role="dialog" aria-modal="true" aria-labelledby="invite-members-title">
        <header className={styles.inviteDialogHeader}><div><span className={styles.eyebrow}>Workspace access</span><h3 id="invite-members-title">Invite members</h3><p>Create a shareable code and invitation link.</p></div><button type="button" aria-label="Close" onClick={() => setInviteOpen(false)} disabled={inviting}>×</button></header>
        <form className={styles.inviteForm} onSubmit={invite}>
          <label className={styles.field}><span>Email (optional)</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Restrict invitation to an email address" /></label>
          <label className={styles.field}><span>Organization role</span><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}><option value="MEMBER">Member</option><option value="ADMIN">Admin</option></select></label>
          <button type="submit" className={styles.primaryButton} disabled={inviting}>{inviting ? 'Creating invitation…' : 'Send invitation'}</button>
        </form>
        {error && <p className={styles.formError} role="alert">{error}</p>}
        {inviteCode && <div className={styles.inviteLink} role="status">
          <strong>Invitation code</strong><span>{inviteCode}</span>
          <button type="button" className={styles.secondaryButton} onClick={() => copyValue(inviteCode, 'code')}>{copied === 'code' ? 'Code copied' : 'Copy code'}</button>
          <strong>Invite link</strong><a href={inviteLink}>{inviteLink}</a>
          <button type="button" className={styles.secondaryButton} onClick={() => copyValue(inviteLink, 'link')}>{copied === 'link' ? 'Link copied' : 'Copy link'}</button>
        </div>}
      </section>
    </div>}
    {invitations.length > 0 && <div className={styles.pendingInvitations}><h4>Pending invitations</h4><ul>{invitations.map((item) => <li key={item.id}><span>{item.email || `Code: ${item.invitation_code}`}</span><small>{item.access_level} · expires {new Date(item.expires_at).toLocaleDateString()}</small></li>)}</ul></div>}
    {memberActionError && <p className={styles.formError} role="alert">{memberActionError}</p>}
    {error ? <p className={styles.formError} role="alert">{error}</p> : loading ? <p className={styles.loading}>Loading members…</p> : members.length ? <div className={styles.tableWrap}><table className={styles.memberTable}><thead><tr><th>Name</th><th>Email</th><th>Team</th><th>Role</th><th>Status</th>{canManageMembers && <th>Actions</th>}</tr></thead><tbody>{members.map((membership) => {
      const protectedOwner = isOrganizationOwner(membership);
      const activeMember = membership.is_active && membership.status === 'ACTIVE';
      const canChangeRole = canManageMembers && activeMember && !protectedOwner
        && (isOwner || membership.access_level !== 'ADMIN');
      const canRemove = canManageMembers && activeMember && !protectedOwner;
      return <tr key={membership.id}>
        <td><span className={styles.memberName}><Avatar user={membership.user} size={28} />{[membership.user?.first_name, membership.user?.last_name].filter(Boolean).join(' ') || membership.user?.email}</span></td>
        <td>{membership.user?.email}</td><td>{membership.teams?.join(', ') || '—'}</td>
        <td>{organizationRoleLabel(membership.access_level)}</td>
        <td>{membership.status === 'REMOVED' ? 'Removed' : activeMember ? 'Active' : membership.status}</td>
        {canManageMembers && <td>{protectedOwner ? <span className={styles.ownerProtected}>Owner</span> : canRemove ? <MemberActionsMenu
          email={membership.user?.email}
          canChangeRole={canChangeRole}
          onChangeRole={() => { setMemberActionError(''); setRoleTarget(membership); setRoleDraft(membership.access_level); }}
          onRemove={() => { setMemberActionError(''); setRemoveTarget(membership); }}
        /> : <span>—</span>}</td>}
      </tr>;
    })}</tbody></table></div> : <p className={styles.emptyState}>No organization members found.</p>}
    {roleTarget && <div className={styles.inviteBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingRole) setRoleTarget(null); }}>
      <section className={styles.inviteDialog} role="dialog" aria-modal="true" aria-labelledby="member-role-title">
        <header className={styles.inviteDialogHeader}><div><span className={styles.eyebrow}>Workspace access</span><h3 id="member-role-title">Change member role</h3><p>{displayNameForMembership(roleTarget)} · {roleTarget.user?.email}</p></div><button type="button" aria-label="Close" onClick={() => setRoleTarget(null)} disabled={savingRole}><X size={18} /></button></header>
        <form className={styles.inviteForm} onSubmit={saveMemberRole}>
          <label className={styles.field}><span>Organization role</span><select value={roleDraft} onChange={(event) => setRoleDraft(event.target.value)}><option value="MEMBER">Member</option>{isOwner && <option value="ADMIN">Admin</option>}</select></label>
          {memberActionError && <p className={styles.formError} role="alert">{memberActionError}</p>}
          <div className={styles.memberDialogActions}><button type="button" className={styles.secondaryButton} onClick={() => setRoleTarget(null)} disabled={savingRole}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={savingRole || roleDraft === roleTarget.access_level}>{savingRole ? 'Saving…' : 'Save role'}</button></div>
        </form>
      </section>
    </div>}
    {removeTarget && <div className={styles.inviteBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !removingMember) setRemoveTarget(null); }}>
      <section className={styles.inviteDialog} role="alertdialog" aria-modal="true" aria-labelledby="remove-member-title">
        <header className={styles.inviteDialogHeader}><div><span className={styles.eyebrow}>Workspace access</span><h3 id="remove-member-title">Remove {displayNameForMembership(removeTarget)} from {org.name}?</h3><p>They will lose access to this organization. Their account will not be deleted.</p></div></header>
        {memberActionError && <p className={styles.formError} role="alert">{memberActionError}</p>}
        <div className={styles.memberDialogActions}><button type="button" className={styles.secondaryButton} onClick={() => setRemoveTarget(null)} disabled={removingMember}>Cancel</button><button type="button" className={styles.removeMemberButton} onClick={removeOrganizationMember} disabled={removingMember}>{removingMember ? 'Removing…' : 'Remove from organization'}</button></div>
      </section>
    </div>}
  </section>;
}

function TeamsSettings({ org }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    organizationsApi.teams(org.id).then(({ data }) => { if (current) setTeams(rows(data)); })
      .catch((loadError) => { if (current) setError(getError(loadError, 'Could not load teams.')); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [org.id]);
  return <section className={styles.settingsSection}>
    <div className={styles.sectionHeading}><h3>Teams</h3><p>Teams organize members around shared work.</p></div>
    {error ? <p className={styles.formError} role="alert">{error}</p> : loading ? <p className={styles.loading}>Loading teams…</p> : teams.length ? <ul className={`${styles.simpleList} ${styles.teamSettingsList}`}>{teams.map((team) => <li key={team.id}>
      <Users size={16} />
      <span><strong>{team.name}</strong>{team.description && <small>{team.description}</small>}</span>
      <Link className={styles.teamSettingsAction} to={`/teams?manage=${encodeURIComponent(team.id)}`}><span>Manage</span><ArrowUpRight size={14} /></Link>
    </li>)}</ul> : <p className={styles.emptyState}>No teams have been created.</p>}
    <Link className={styles.secondaryButton} to="/teams">Open Teams</Link>
  </section>;
}

function RolesSettings() {
  return <section className={styles.settingsSection}>
    <div className={styles.sectionHeading}><h3>Roles &amp; permissions</h3><p>These are the role levels already enforced by Oorkivo.</p></div>
    <ul className={styles.simpleList}>
      <li><ShieldCheck size={16} /><span><strong>Owner</strong><small>Manages organization settings and members.</small></span></li>
      <li><ShieldCheck size={16} /><span><strong>Admin</strong><small>Manages members and teams; organization changes remain owner-controlled.</small></span></li>
      <li><UserRound size={16} /><span><strong>Member</strong><small>Access is further controlled by project and team membership.</small></span></li>
      <li><Users size={16} /><span><strong>Team lead</strong><small>Manages the team they lead, subject to organization membership.</small></span></li>
    </ul>
    <p className={styles.helperText}>Role editing is not exposed because the current backend has no role-management API.</p>
  </section>;
}

export default function Settings() {
  const { section = 'profile' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const hasBackground = Boolean(location.state?.backgroundLocation);
  const { user, org, loading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [orgOverride, setOrgOverride] = useState(null);
  const effectiveOrg = orgOverride ?? org;
  const permissions = effectiveOrg?.permissions ?? {};
  const allowedItems = useMemo(() => {
    const items = [...NAV_ITEMS];
    if (permissions.can_manage_organization) items.push({ id: 'organization', label: 'Organization', group: 'Workspace', icon: Building2 });
    if (permissions.can_manage_members) items.push({ id: 'members', label: 'Members', group: 'Workspace', icon: Users });
    if (permissions.can_manage_teams) items.push({ id: 'teams', label: 'Teams', group: 'Workspace', icon: Users });
    if (permissions.can_manage_members) items.push({ id: 'roles', label: 'Roles & permissions', group: 'Workspace', icon: ShieldCheck });
    return items;
  }, [permissions.can_manage_organization, permissions.can_manage_members, permissions.can_manage_teams]);
  const selected = allowedItems.find((item) => item.id === section);
  useEffect(() => {
    let current = true;
    authApi.me().then(({ data }) => { if (current) setProfile(data); })
      .catch((error) => { if (current) setProfileError(getError(error, 'Could not load your profile.')); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (!loading && !selected) navigate('/settings/profile', { replace: true });
  }, [loading, selected, navigate]);

  const signOut = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_organization_id');
    navigate('/login', { replace: true });
  };
  const closeSettings = () => {
    if (hasBackground) navigate(-1);
    else navigate('/dashboard', { replace: true });
  };
  const updateProfile = (data) => setProfile(data);
  const updateOrganization = (data) => setOrgOverride(data);

  return <div className={styles.settingsOverlay} onMouseDown={(event) => {
    if (event.target === event.currentTarget) closeSettings();
  }}>
    <section className={styles.settingsSurface} role="dialog" aria-modal="true" aria-label="Settings">
      <header className={styles.settingsTopbar}>
        <Link to={hasBackground ? location.state.backgroundLocation.pathname : '/dashboard'} className={styles.settingsBrand}>
          <span className={styles.settingsLogo} aria-hidden="true">O</span>
          <span>Oorkivo</span>
        </Link>
        <span className={styles.settingsTopbarTitle}>App settings</span>
        <button type="button" className={styles.closeSettings} onClick={closeSettings} aria-label="Back to workspace">
          <ArrowLeft size={16} /><span>Back to workspace</span>
        </button>
      </header>
      <div className={styles.settingsLayout}>
        <nav className={styles.settingsNav} aria-label="Settings navigation">
          {allowedItems.map((item) => {
            const Icon = item.icon;
            return <NavLink key={item.id} to={`/settings/${item.id}`} state={location.state} replace className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}><Icon size={15} />{item.label}</NavLink>;
          })}
        </nav>
        <main className={styles.contentScroller}>
          <div className={styles.content}>
          {loading || (section === 'profile' && !profile && !profileError) ? <div className={styles.loading}>Loading settings…</div>
            : !selected ? null
              : <><div className={styles.contentHeading}><h2>{selected.label}</h2></div>
                {section === 'profile' && (profileError ? <p className={styles.formError} role="alert">{profileError}</p> : <ProfileSettings user={profile} onUserUpdated={updateProfile} />)}
                {section === 'preferences' && <PreferenceSettings />}
                {section === 'notifications' && <NotificationSettings />}
                {section === 'sessions' && <SessionSettings onSignOut={signOut} />}
                {section === 'organization' && <OrganizationSettings org={effectiveOrg} onUpdated={updateOrganization} />}
                {section === 'members' && <MembersSettings org={effectiveOrg} />}
                {section === 'teams' && <TeamsSettings org={effectiveOrg} />}
                {section === 'roles' && <RolesSettings />}
              </>}
          </div>
        </main>
      </div>
    </section>
  </div>;
}
