import styles from './IdentityMark.module.css';

const PALETTES = [
  ['#e4ebe1', '#52634f'],
  ['#eee5dc', '#795f4b'],
  ['#e4e9ed', '#536572'],
  ['#eee5e8', '#795c68'],
  ['#e9e8dd', '#69654a'],
  ['#e2ebe7', '#50695d'],
];

function identityHash(value) {
  return [...String(value || 'Oorkivo')].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function getInitials(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`
    : parts[0].slice(0, 2)).toUpperCase();
}

export default function IdentityMark({ name, size = 38, kind = 'project', className = '' }) {
  const hash = identityHash(name);
  const [background, foreground] = PALETTES[hash % PALETTES.length];

  return (
    <span
      className={`${styles.mark} ${kind === 'team' ? styles.team : styles.project} ${className}`}
      style={{ width: size, height: size, backgroundColor: background, color: foreground }}
      data-shape={hash % 3}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}
