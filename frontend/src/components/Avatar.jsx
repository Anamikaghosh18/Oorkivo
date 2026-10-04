import styles from './Avatar.module.css';

function getInitials(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
    || user?.username
    || user?.email
    || '?';
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function getTone(user) {
  const identity = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
    || user?.username
    || user?.email
    || 'User';
  const hash = [...(identity || 'User')].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
  return `tone${hash % 6}`;
}

export default function Avatar({ user, size = 28, className = '', title }) {
  const accessibleName = title || [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
    || user?.email
    || 'User';
  return (
    <span
      className={`${styles.avatar} ${styles[getTone(user)]} ${className}`}
      style={{ width: size, height: size }}
      title={accessibleName}
      aria-label={accessibleName}
    >
      {user?.avatar_url
        ? <img src={user.avatar_url} alt="" />
        : getInitials(user)}
    </span>
  );
}
