import styles from './FeatureIcon.module.css';

const SHAPES = {
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></>,
  teams: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.3-5 5.5-5s5.5 2 5.5 5" /><path d="M16 5.5a3 3 0 0 1 0 5.8M17 14c2.2.4 3.5 2 3.5 4" /></>,
  projects: <><path d="M3 7.5h7l2 2H21v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 7V5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2" /></>,
  tasks: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="m8 12 2.2 2.2L16 8.5M8 17h8" /></>,
  sprints: <><path d="M12 3v3M12 18v3M3 12h3m12 0h3" /><circle cx="12" cy="12" r="8" /><path d="m10 8 5 4-5 4z" /></>,
  progress: <><path d="M5 19V9m7 10V5m7 14v-7" /><circle cx="5" cy="6" r="2" /><circle cx="12" cy="3" r="2" /><circle cx="19" cy="9" r="2" /></>,
  analytics: <><path d="M4 19V5m0 14h16" /><path d="m7 15 4-4 3 2 5-6" /><circle cx="19" cy="7" r="1.5" /></>,
  activity: <><path d="M3 12h4l2.2-6 4.1 12 2.2-6H21" /></>,
  organization: <><path d="M4 21V7l8-4 8 4v14" /><path d="M8 21v-5h8v5M8 9h.01M12 9h.01M16 9h.01M8 12h.01M12 12h.01M16 12h.01" /></>,
  members: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c0-3.1 2.3-5 5.5-5s5.5 1.9 5.5 5" /><path d="M17 8h4m-2-2v4" /></>,
  notifications: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
};

const TONES = {
  dashboard: 'sage',
  teams: 'plum',
  projects: 'clay',
  tasks: 'moss',
  sprints: 'amber',
  progress: 'sage',
  analytics: 'slate',
  activity: 'clay',
  organization: 'slate',
  members: 'sage',
  notifications: 'amber',
};

export default function FeatureIcon({ name, size = 18, className = '', label }) {
  const shape = SHAPES[name];
  if (!shape) return null;

  return (
    <span
      className={`${styles.icon} ${styles[TONES[name]]} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {shape}
        </g>
      </svg>
    </span>
  );
}
