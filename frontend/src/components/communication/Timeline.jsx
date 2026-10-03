import { useState, useRef, useEffect } from 'react';
import { Send, Pencil, Trash2, MoreHorizontal, Check, X } from 'lucide-react';
import styles from './Timeline.module.css';

/* ── Shared Avatar ─────────────────────────────────────────── */
const AVATAR_COLORS = [
  ['#D4E3D3', '#4A5B4C'], ['#D3DCE3', '#3D4F5E'],
  ['#E3D3D8', '#5E3D47'], ['#E0D9D3', '#5E4E3D'],
  ['#D3E3DC', '#3D5E52'],
];

function Avatar({ user, size = 'sm' }) {
  const name = user?.first_name || user?.username || '?';
  const initials = name.slice(0, 1).toUpperCase();
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  const [bg, fg] = AVATAR_COLORS[idx];
  return (
    <div
      className={`${styles.avatar} ${styles[`avatar-${size}`]}`}
      style={{ background: bg, color: fg }}
      title={name}
    >
      {initials}
    </div>
  );
}

function formatEntryTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* ── Activity Entry ────────────────────────────────────────── */
function ActivityEntry({ item }) {
  return (
    <div className={styles.activityEntry}>
      <div className={styles.activityLine}>
        <div className={styles.activityDot} />
      </div>
      <div className={styles.activityBody}>
        <span className={styles.activityActor}>{item.actor?.first_name || 'System'}</span>
        {' '}
        <span className={styles.activityText}>{item.actionText}</span>
        <time className={styles.entryTime}>{formatEntryTime(item.created_at)}</time>
      </div>
    </div>
  );
}

/* ── Comment Entry ─────────────────────────────────────────── */
function CommentEntry({ comment, currentUserId, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  const isAuthor = comment.author?.id === currentUserId;

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={styles.commentEntry}>
      <Avatar user={comment.author} />
      <div className={styles.commentBody}>
        <div className={styles.commentHeader}>
          <span className={styles.commentAuthor}>
            {comment.author?.first_name || comment.author?.username}
          </span>
          <time className={styles.entryTime}>{formatEntryTime(comment.created_at)}</time>

          {isAuthor && (
            <div className={styles.menuWrap} ref={menuRef}>
              <button
                className={styles.menuBtn}
                onClick={() => setShowMenu((v) => !v)}
                aria-label="Comment actions"
              >
                <MoreHorizontal size={14} />
              </button>
              {showMenu && (
                <div className={styles.menuDropdown}>
                  <button
                    className={`${styles.menuItem} ${styles.menuDanger}`}
                    onClick={() => {
                      onDelete(comment.id);
                      setShowMenu(false);
                    }}
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className={styles.commentContent}>{comment.content}</div>
      </div>
    </div>
  );
}

/* ── Comment Input ─────────────────────────────────────────── */
function CommentInput({ onSubmit, currentUser }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
    textareaRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e);
    }
  };

  return (
    <form className={styles.inputForm} onSubmit={handleSubmit}>
      <Avatar user={currentUser || { first_name: 'Me' }} />
      <div className={`${styles.inputWrap} ${focused ? styles.inputFocused : ''}`}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="Write a comment… (⌘↵ to send)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          rows={focused || value ? 3 : 1}
        />
        {(focused || value) && (
          <div className={styles.inputFooter}>
            <span className={styles.inputHint}>⌘↵ to send</span>
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={!value.trim()}
            >
              <Send size={13} />
              Send
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

/* ── Timeline (main export) ────────────────────────────────── */
export default function Timeline({ items, currentUserId, currentUser, onAddComment, onDeleteComment }) {
  return (
    <div className={styles.timeline}>
      <div className={styles.header}>
        <h3 className={styles.title}>Discussion</h3>
      </div>

      <div className={styles.feed}>
        {items.length === 0 && (
          <div className={styles.emptyFeed}>
            <p>No activity yet. Be the first to comment.</p>
          </div>
        )}
        {items.map((item) =>
          item.type === 'COMMENT' ? (
            <CommentEntry
              key={`c-${item.id}`}
              comment={item}
              currentUserId={currentUserId}
              onDelete={onDeleteComment}
            />
          ) : (
            <ActivityEntry key={`a-${item.id}`} activity={item} />
          )
        )}
      </div>

      <CommentInput onSubmit={onAddComment} currentUser={currentUser} />
    </div>
  );
}
