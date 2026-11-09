import { useState, useRef, useEffect } from 'react';
import { Send, Pencil, Trash2, MoreHorizontal, Check, X, Paperclip, FileText, Download } from 'lucide-react';
import Avatar from '../Avatar';
import styles from './Timeline.module.css';

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

function formatFileSize(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
function CommentEntry({ comment, currentUserId, onDelete, onUpdate, onDownloadAttachment }) {
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
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
      <Avatar user={comment.author} size={28} className={styles['avatar-sm']} />
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
                    className={styles.menuItem}
                    onClick={() => {
                      setDraft(comment.content);
                      setEditing(true);
                      setShowMenu(false);
                    }}
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
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
        {editing ? (
          <form className={styles.editForm} onSubmit={(event) => {
            event.preventDefault();
            const content = draft.trim();
            if (!content || content === comment.content) {
              setEditing(false);
              return;
            }
            onUpdate(comment.id, content).then((saved) => {
              if (saved) setEditing(false);
            });
          }}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} aria-label="Edit comment" />
            <div>
              <button type="button" onClick={() => setEditing(false)}><X size={13} /> Cancel</button>
              <button type="submit" disabled={!draft.trim()}><Check size={13} /> Save</button>
            </div>
          </form>
        ) : (
          <>
            {comment.content && <div className={styles.commentContent}>{comment.content}</div>}
            {!!comment.attachments?.length && (
              <div className={styles.commentAttachments}>
                {comment.attachments.map((attachment) => (
                  <button
                    type="button"
                    key={attachment.id}
                    className={styles.commentAttachment}
                    onClick={() => onDownloadAttachment(attachment)}
                    aria-label={`Download ${attachment.filename}`}
                  >
                    <FileText size={16} />
                    <span><strong>{attachment.filename}</strong><small>{formatFileSize(attachment.file_size)}</small></span>
                    <Download size={14} />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Comment Input ─────────────────────────────────────────── */
function CommentInput({ onSubmit, currentUser }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if ((!trimmed && !files.length) || sending) return;
    setSending(true);
    setError('');
    const saved = await onSubmit(trimmed, files);
    setSending(false);
    if (saved === false) return;
    setValue('');
    setFiles([]);
    textareaRef.current?.blur();
  };

  const handleFiles = (event) => {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length + incoming.length > 10) {
      setError('Attach up to 10 files per comment.');
      return;
    }
    const tooLarge = incoming.find((file) => file.size > 20 * 1024 * 1024);
    if (tooLarge) {
      setError(`${tooLarge.name} is larger than 20 MB.`);
      return;
    }
    setFiles((current) => [...current, ...incoming]);
    setError('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e);
    }
  };

  return (
    <form className={styles.inputForm} onSubmit={handleSubmit}>
      <Avatar user={currentUser || { first_name: 'Me' }} size={28} className={styles['avatar-sm']} />
      <div className={`${styles.inputWrap} ${focused ? styles.inputFocused : ''}`}>
        {!!files.length && (
          <div className={styles.fileQueue} aria-label="Files to attach">
            {files.map((file, index) => (
              <span className={styles.fileChip} key={`${file.name}-${file.lastModified}-${index}`}>
                <FileText size={14} />
                <span>{file.name}</span>
                <button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`}><X size={13} /></button>
              </span>
            ))}
          </div>
        )}
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
        <div className={styles.inputFooter}>
          <div className={styles.inputTools}>
            <button type="button" className={styles.attachBtn} onClick={() => fileInputRef.current?.click()} aria-label="Attach files" title="Attach files">
              <Paperclip size={15} />
            </button>
            <input ref={fileInputRef} className={styles.fileInput} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip" onChange={handleFiles} />
            <span className={styles.inputHint}>Attach files · Ctrl/⌘ + Enter to send</span>
          </div>
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={(!value.trim() && !files.length) || sending}
          >
            <Send size={13} />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        {error && <span className={styles.inputError} role="alert">{error}</span>}
      </div>
    </form>
  );
}

/* ── Timeline (main export) ────────────────────────────────── */
export default function Timeline({ items, currentUserId, currentUser, onAddComment, onDeleteComment, onUpdateComment, onDownloadAttachment, embedded = false }) {
  return (
    <div className={`${styles.timeline} ${embedded ? styles.timelineEmbedded : ''}`}>
      {!embedded && (
        <div className={styles.header}>
          <h3 className={styles.title}>Discussion</h3>
        </div>
      )}

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
              onUpdate={onUpdateComment}
              onDownloadAttachment={onDownloadAttachment}
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
