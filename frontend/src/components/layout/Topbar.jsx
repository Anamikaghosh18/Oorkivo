import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, ChevronDown, CheckCheck, LogOut, Menu } from 'lucide-react';
import Avatar from '../Avatar';
import { communicationApi } from '../../services/api';
import { activateOrganization } from '../../utils/organizationContext';
import styles from './Topbar.module.css';

function getRows(data) {
  const rows = data?.results ?? data;
  return Array.isArray(rows) ? rows : [];
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function Topbar({ org, user, collapsed = false, onToggleMobileMenu }) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState('');
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [organizationMenuOpen, setOrganizationMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const loadNotifications = async () => {
    setNotificationsLoading(true);
    setNotificationError('');
    try {
      const response = await communicationApi.notifications();
      setNotifications(getRows(response.data));
    } catch {
      setNotificationError('Could not load notifications. Try again.');
    } finally {
      setNotificationsLoading(false);
    }
  };
  const toggleNotifications = () => {
    const open = !notificationsOpen;
    setNotificationsOpen(open);
    setUserMenuOpen(false);
    setOrganizationMenuOpen(false);
    if (open) loadNotifications();
  };
  const markRead = async (notification) => {
    if (notification.is_read) return;
    await communicationApi.readNotification(notification.id);
    setNotifications((current) => current.map((item) => (
      item.id === notification.id ? { ...item, is_read: true } : item
    )));
  };
  const markAllRead = async () => {
    try {
      await communicationApi.readAllNotifications();
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    } catch {
      setNotificationError('Could not mark notifications as read.');
    }
  };
  const openNotification = async (notification) => {
    try {
      await markRead(notification);
    } catch {
      setNotificationError('Could not mark this notification as read.');
    }
    setNotificationsOpen(false);
    if (notification.target_url) navigate(notification.target_url);
  };
  const signOut = async () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_organization_id');
    navigate('/login', { replace: true });
  };

  return (
    <header className={styles.topbar} data-collapsed={collapsed ? 'true' : 'false'}>
      {/* Mobile Hamburger Menu Toggle */}
      <div className={styles.leftSection}>
        {onToggleMobileMenu && (
          <button
            type="button"
            className={styles.mobileMenuBtn}
            onClick={onToggleMobileMenu}
            aria-label="Toggle navigation menu"
          >
            <Menu size={18} />
          </button>
        )}

        {/* Current organization */}
        <div className={styles.orgMenuWrap}>
          <button
            type="button"
            className={styles.orgSwitcher}
            aria-label="Current organization"
            aria-expanded={organizationMenuOpen}
            onClick={() => {
              setOrganizationMenuOpen((open) => !open);
              setNotificationsOpen(false);
              setUserMenuOpen(false);
            }}
          >
            <div className={styles.orgIcon}><span>{org?.name?.[0] ?? 'O'}</span></div>
            <div className={styles.orgInfo}><span className={styles.orgName}>{org?.name ?? 'Select Organization'}</span></div>
            <ChevronDown size={13} className={styles.orgChevron} />
          </button>
          {organizationMenuOpen && (
            <div className={styles.organizationMenu} role="menu" aria-label="Switch organization">
              {(user?.organization_memberships ?? []).filter((item) => item.status === 'ACTIVE').map((membership) => (
                <button
                  type="button"
                  role="menuitem"
                  key={membership.organization_id}
                  disabled={String(membership.organization_id) === String(org?.id)}
                  onClick={() => activateOrganization(membership.organization_id)}
                >
                  <span>{membership.organization}</span>
                  <small>{membership.access_level} · {membership.organization_plan}</small>
                </button>
              ))}
              {!user?.organization_memberships?.length && <span className={styles.noOrganizations}>No workspace membership</span>}
            </div>
          )}
        </div>
      </div>

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
          <button type="button" className={styles.iconBtn} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={notificationsOpen} onClick={toggleNotifications}>
            <Bell size={15} strokeWidth={1.75} />
          </button>
          {unreadCount > 0 && <span className={styles.notifBadge} />}
          {notificationsOpen && (
            <section className={styles.notificationPanel} aria-label="Notifications">
              <div className={styles.panelHeading}>
                <strong>Notifications</strong>
                <button type="button" onClick={markAllRead} disabled={!unreadCount}><CheckCheck size={14} /> Mark all</button>
              </div>
              {notificationError && <p className={styles.notificationError} role="alert">{notificationError}</p>}
              {notificationsLoading ? <p className={styles.notificationState}>Loading notifications…</p>
                : notifications.length === 0 ? <p className={styles.notificationState}>No notifications yet.</p>
                  : <ul className={styles.notificationList}>
                    {notifications.map((notification) => (
                      <li key={notification.id}>
                        <button type="button" className={`${styles.notificationItem} ${!notification.is_read ? styles.notificationUnread : ''}`} onClick={() => openNotification(notification)}>
                          <span className={styles.notificationCopy}>
                            <strong>{notification.title || 'Notification'}</strong>
                            <span>{notification.message}</span>
                            <time dateTime={notification.created_at}>{formatTime(notification.created_at)}</time>
                          </span>
                          {!notification.is_read && <i aria-label="Unread" />}
                        </button>
                      </li>
                    ))}
                  </ul>}
            </section>
          )}
        </div>

        {/* User */}
        <button type="button" className={styles.userBtn} aria-label="User menu" aria-expanded={userMenuOpen} onClick={() => { setUserMenuOpen((value) => !value); setNotificationsOpen(false); setOrganizationMenuOpen(false); }}>
          <Avatar user={user} size={26} className={styles.userAvatar} />
          {user && (
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user.first_name}</span>
            </div>
          )}
          <ChevronDown size={12} className={styles.userChevron} />
        </button>
        {userMenuOpen && (
          <div className={styles.userMenu}>
            <Link to="/settings/profile" state={{ backgroundLocation: location }} onClick={() => setUserMenuOpen(false)}>Profile</Link>
            <Link to="/settings/preferences" state={{ backgroundLocation: location }} onClick={() => setUserMenuOpen(false)}>Settings</Link>
            <button type="button" onClick={signOut}><LogOut size={14} /> Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
