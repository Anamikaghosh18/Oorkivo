import { useMemo, useState } from 'react';
import { Check, Plus, Search, UserPlus, X } from 'lucide-react';
import Avatar from './Avatar';
import { organizationsApi } from '../services/api';
import styles from './OrganizationMemberSelector.module.css';

function rows(data) {
  const value = data?.results ?? data;
  return Array.isArray(value) ? value : [];
}

function userOf(membership) {
  return membership?.user && typeof membership.user === 'object' ? membership.user : membership;
}

function nameOf(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
    || user?.email
    || 'Organization member';
}

function roleName(value) {
  return String(value || 'Member')
    .replaceAll('_', ' ')
    .toLocaleLowerCase()
    .replace(/\b\w/g, (character) => character.toLocaleUpperCase());
}

function errorMessage(error) {
  const data = error?.response?.data;
  if (typeof data?.detail === 'string') return data.detail;
  if (typeof data?.email === 'string') return data.email;
  return 'Could not send the invitation. Please try again.';
}

export default function OrganizationMemberSelector({
  organizationId,
  members = [],
  selectedIds = [],
  onChange,
  multiple = true,
  canInvite = false,
  canInviteAdmins = false,
  compact = false,
  className = '',
  label = 'Members',
  placeholder = 'Search organization members',
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const selected = useMemo(
    () => new Set(selectedIds.map(String)),
    [selectedIds],
  );
  const normalizedMembers = useMemo(() => members
    .map((membership) => ({ membership, user: userOf(membership) }))
    .filter(({ user }) => user?.id != null),
  [members]);
  const visibleMembers = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return normalizedMembers.filter(({ membership, user }) => {
      if (!search) return true;
      return [
        nameOf(user),
        user.email,
        membership.access_level,
        membership.role,
      ].some((value) => value?.toLocaleLowerCase().includes(search));
    });
  }, [normalizedMembers, query]);
  const selectedMembers = normalizedMembers.filter(({ user }) => selected.has(String(user.id)));

  const toggle = (memberId) => {
    if (disabled) return;
    const id = String(memberId);
    if (!multiple) {
      onChange(selected.has(id) ? [] : [id]);
      return;
    }
    onChange(selected.has(id)
      ? selectedIds.filter((selectedId) => String(selectedId) !== id)
      : [...selectedIds, id]);
  };

  const sendInvitation = async (event) => {
    event.preventDefault();
    if (!organizationId || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      await organizationsApi.invite(organizationId, {
        email: inviteEmail.trim(),
        access_level: inviteRole,
      });
      setInviteSuccess(`Invitation sent to ${inviteEmail.trim()}.`);
      setInviteEmail('');
    } catch (error) {
      setInviteError(errorMessage(error));
    } finally {
      setInviting(false);
    }
  };

  return (
    <section className={`${styles.selector} ${compact ? styles.compact : ''} ${className}`} aria-label={label}>
      <div className={styles.heading}>
        <strong>{label}</strong>
        {multiple && <span>{selectedMembers.length} selected</span>}
      </div>
      {multiple && selectedMembers.length > 0 && (
        <ul className={styles.selectedList} aria-label={`Selected ${label.toLocaleLowerCase()}`}>
          {selectedMembers.map(({ user, membership }) => (
            <li className={styles.selectedItem} key={user.id}>
              <Avatar user={user} size={28} className={styles.avatar} />
              <span className={styles.identity}>
                <strong>{nameOf(user)}</strong>
                <small>{user.email}</small>
              </span>
              <span className={styles.role}>{roleName(membership.access_level ?? membership.role)}</span>
              <button
                type="button"
                className={styles.remove}
                onClick={() => toggle(user.id)}
                disabled={disabled}
                aria-label={`Remove ${nameOf(user)} from ${label.toLocaleLowerCase()}`}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!multiple && selectedMembers.length > 0 && (
        <div className={styles.singleSelected}>
          <Avatar user={selectedMembers[0].user} size={28} className={styles.avatar} />
          <span className={styles.identity}>
            <strong>{nameOf(selectedMembers[0].user)}</strong>
            <small>{selectedMembers[0].user.email}</small>
          </span>
          <button type="button" className={styles.remove} disabled={disabled} onClick={() => onChange([])} aria-label="Clear assignee">
            <X size={15} />
          </button>
        </div>
      )}
      <label className={styles.search}>
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={disabled}
        />
      </label>
      <ul className={styles.results} aria-label="Organization members">
        {visibleMembers.length ? visibleMembers.map(({ membership, user }) => {
          const isSelected = selected.has(String(user.id));
          return (
            <li key={user.id}>
              <button
                type="button"
                className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
                onClick={() => toggle(user.id)}
                disabled={disabled}
                aria-pressed={isSelected}
              >
                <Avatar user={user} size={30} className={styles.avatar} />
                <span className={styles.identity}>
                  <strong>{nameOf(user)}</strong>
                  <small>{user.email}</small>
                </span>
                <span className={styles.role}>{roleName(membership.access_level ?? membership.role)}</span>
                {isSelected ? <Check size={16} aria-hidden="true" /> : multiple ? <Plus size={16} aria-hidden="true" /> : null}
              </button>
            </li>
          );
        }) : <li className={styles.noResults}>No organization members match your search.</li>}
      </ul>
      {canInvite && (
        <div className={styles.inviteArea}>
          {!inviteOpen ? (
            <button type="button" className={styles.inviteToggle} onClick={() => { setInviteOpen(true); setInviteError(''); setInviteSuccess(''); }}>
              <UserPlus size={15} /> Invite someone who is not a member
            </button>
          ) : (
            <form className={styles.inviteForm} onSubmit={sendInvitation}>
              <label>
                <span>Email</span>
                <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="person@company.com" required />
              </label>
              <label>
                <span>Organization role</span>
                <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                  <option value="MEMBER">Member</option>
                  {canInviteAdmins && <option value="ADMIN">Admin</option>}
                </select>
              </label>
              {inviteError && <p className={styles.inviteError} role="alert">{inviteError}</p>}
              {inviteSuccess && <p className={styles.inviteSuccess} role="status">{inviteSuccess}</p>}
              <div className={styles.inviteActions}>
                <button type="button" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</button>
                <button type="submit" disabled={inviting || !inviteEmail.trim()}>{inviting ? 'Sending…' : 'Send invitation'}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
