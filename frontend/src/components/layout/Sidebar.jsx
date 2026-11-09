import { NavLink } from 'react-router-dom';
import {
  MessagesSquare,
  Settings,
  ChevronLeft,
  X,
} from 'lucide-react';
import FeatureIcon from '../visual/FeatureIcon';
import BrandMark from '../visual/BrandMark';
import styles from './Sidebar.module.css';

const NAV_PRIMARY = [
  { to: '/dashboard', feature: 'dashboard', label: 'Dashboard' },
  { to: '/teams',     feature: 'teams',     label: 'Teams' },
  { to: '/projects',  feature: 'projects',  label: 'Projects' },
  { to: '/tasks',     feature: 'tasks',     label: 'Tasks' },
  { to: '/chat',      icon: MessagesSquare, label: 'Chat' },
];

const NAV_SECONDARY = [
  { to: '/progress', feature: 'progress', label: 'Progress' },
  { to: '/activity', feature: 'activity', label: 'Activity' },
];

function NavItem({ to, icon: Icon, feature, label, collapsed, onSelect }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
      }
      title={collapsed ? label : undefined}
      onClick={onSelect}
    >
      {feature
        ? <FeatureIcon name={feature} size={16} className={styles.navIcon} />
        : <Icon size={15} strokeWidth={1.8} className={styles.navIcon} />}
      {!collapsed && <span className={styles.navLabel}>{label}</span>}
    </NavLink>
  );
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }) {
  return (
    <>
      {mobileOpen && (
        <div
          className={styles.backdrop}
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${
          mobileOpen ? styles.mobileOpen : ''
        }`}
      >
        {/* ── Brand ─────────────────────────── */}
        <div className={styles.brand}>
          <div className={styles.logoMark}>
            <BrandMark size={16} />
          </div>
          {(!collapsed || mobileOpen) && (
            <div className={styles.brandText}>
              <span className={styles.logoWord}>Oorkivo</span>
            </div>
          )}
          {mobileOpen && (
            <button
              type="button"
              className={styles.mobileCloseBtn}
              onClick={onCloseMobile}
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* ── Navigation ────────────────────── */}
        <nav className={styles.nav} aria-label="Main navigation">
          {(!collapsed || mobileOpen) && (
            <span className={styles.navGroupLabel}>Workspace</span>
          )}
          <ul className={styles.navList}>
            {NAV_PRIMARY.map((item) => (
              <li key={item.to}>
                <NavItem
                  {...item}
                  collapsed={collapsed && !mobileOpen}
                  onSelect={onCloseMobile}
                />
              </li>
            ))}
          </ul>

          <div className={styles.divider} />

          {(!collapsed || mobileOpen) && (
            <span className={styles.navGroupLabel}>Organization</span>
          )}
          <ul className={styles.navList}>
            {NAV_SECONDARY.map((item) => (
              <li key={item.to}>
                <NavItem
                  {...item}
                  collapsed={collapsed && !mobileOpen}
                  onSelect={onCloseMobile}
                />
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Bottom ────────────────────────── */}
        <div className={styles.bottom}>
          <NavItem
            to="/settings"
            icon={Settings}
            label="Settings"
            collapsed={collapsed && !mobileOpen}
            onSelect={onCloseMobile}
          />
        </div>

        {/* ── Collapse toggle (Desktop only) ───────────────── */}
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
    </>
  );
}
