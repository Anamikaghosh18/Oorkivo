import { useState } from 'react';
import { Search, Bell, ChevronDown, Plus } from 'lucide-react';
import styles from './Topbar.module.css';

function UserAvatar({ name }) {
  const initials = name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  // Derive a subtle color from name for visual variety
  const colors = [
    ['#D4E3D3', '#4A5B4C'],
    ['#D3DCE3', '#3D4F5E'],
    ['#E3D3D8', '#5E3D47'],
    ['#E0D9D3', '#5E4E3D'],
    ['#D3E3DC', '#3D5E52'],
  ];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  const [bg, fg] = colors[idx];

  return (
    <div className={styles.userAvatar} style={{ background: bg, color: fg }}>
      {initials}
    </div>
  );
}

export default function Topbar({ org, user }) {
  const [searchFocused, setSearchFocused] = useState(false);

  const fullName = user ? `${user.first_name} ${user.last_name || ''}`.trim() : '';

  return (
    <header className={styles.topbar}>
      {/* Left: org switcher */}
      <button className={styles.orgSwitcher}>
        <div className={styles.orgIcon}>
          <span>{org?.name?.[0] ?? 'O'}</span>
        </div>
        <div className={styles.orgInfo}>
          <span className={styles.orgName}>{org?.name ?? 'Select Organization'}</span>
        </div>
        <ChevronDown size={13} className={styles.orgChevron} />
      </button>

      {/* Right controls */}
      <div className={styles.right}>
        {/* Search */}
        <div className={`${styles.searchWrap} ${searchFocused ? styles.searchFocused : ''}`}>
          <Search size={13} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Search projects, tasks…"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            aria-label="Search"
          />
          {!searchFocused && (
            <kbd className={styles.searchKbd}>⌘K</kbd>
          )}
        </div>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Notifications */}
        <div className={styles.notifWrap}>
          <button className={styles.iconBtn} aria-label="Notifications">
            <Bell size={15} strokeWidth={1.75} />
          </button>
          <div className={styles.notifBadge} />
        </div>

        {/* User */}
        <button className={styles.userBtn} aria-label="User menu">
          <UserAvatar name={fullName} />
          {user && (
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user.first_name}</span>
            </div>
          )}
          <ChevronDown size={12} className={styles.userChevron} />
        </button>
      </div>
    </header>
  );
}
