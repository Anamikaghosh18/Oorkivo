import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  CheckSquare,
  UserRound,
  Activity,
  Settings,
  ChevronLeft,
  Building2,
} from 'lucide-react';
import styles from './Sidebar.module.css';

const NAV_PRIMARY = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/teams',     icon: Users,           label: 'Teams' },
  { to: '/projects',  icon: FolderKanban,    label: 'Projects' },
  { to: '/tasks',     icon: CheckSquare,     label: 'Tasks' },
];

const NAV_SECONDARY = [
  { to: '/activity', icon: Activity,  label: 'Activity' },
];

function NavItem({ to, icon: Icon, label, collapsed }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
      }
      title={collapsed ? label : undefined}
    >
      <Icon size={15} strokeWidth={1.8} className={styles.navIcon} />
      {!collapsed && <span className={styles.navLabel}>{label}</span>}
    </NavLink>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>

      {/* ── Brand ─────────────────────────── */}
      <div className={styles.brand}>
        <div className={styles.logoMark}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect width="7" height="7" rx="1.5" fill="white" fillOpacity="0.9"/>
            <rect x="9" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.55"/>
            <rect y="9" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.55"/>
            <rect x="9" y="9" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.3"/>
          </svg>
        </div>
        {!collapsed && (
          <div className={styles.brandText}>
            <span className={styles.logoWord}>Oorkivo</span>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────── */}
      <nav className={styles.nav} aria-label="Main navigation">
        {!collapsed && <span className={styles.navGroupLabel}>Workspace</span>}
        <ul className={styles.navList}>
          {NAV_PRIMARY.map((item) => (
            <li key={item.to}>
              <NavItem {...item} collapsed={collapsed} />
            </li>
          ))}
        </ul>

        <div className={styles.divider} />

        {!collapsed && <span className={styles.navGroupLabel}>Organization</span>}
        <ul className={styles.navList}>
          {NAV_SECONDARY.map((item) => (
            <li key={item.to}>
              <NavItem {...item} collapsed={collapsed} />
            </li>
          ))}
        </ul>
      </nav>

      {/* ── Bottom ────────────────────────── */}
      <div className={styles.bottom}>
        <NavItem to="/settings" icon={Settings} label="Settings" collapsed={collapsed} />
      </div>

      {/* ── Collapse toggle ───────────────── */}
      <button
        className={styles.toggleBtn}
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <ChevronLeft
          size={13}
          className={`${styles.toggleIcon} ${collapsed ? styles.toggleIconFlipped : ''}`}
        />
      </button>
    </aside>
  );
}
