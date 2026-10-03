import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, Users, ArrowLeft, Flag, Clock } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import Timeline from '../components/communication/Timeline';
import { useDashboard } from '../hooks/useDashboard';
import styles from './TaskDetail.module.css';

const STATUS_META = {
  'In Progress': { cls: 'active',   label: 'In Progress' },
  'TODO':        { cls: 'planning', label: 'To Do' },
  'IN_REVIEW':   { cls: 'hold',     label: 'In Review' },
  'COMPLETED':   { cls: 'done',     label: 'Completed' },
};

const PRIORITY_META = {
  'HIGH':   { cls: 'high',   label: 'High' },
  'URGENT': { cls: 'urgent', label: 'Urgent' },
  'MEDIUM': { cls: 'medium', label: 'Medium' },
  'LOW':    { cls: 'low',    label: 'Low' },
};

const MOCK_TIMELINE = [
  { id: 101, type: 'ACTIVITY', actor: { first_name: 'Rahul' }, actionText: 'assigned this task to Priya', created_at: '10:20 AM' },
  { id: 1, type: 'COMMENT', author: { id: 2, first_name: 'Priya' }, content: "I've completed the login endpoint.\nJWT refresh is still pending.", created_at: '10:32 AM' },
  { id: 102, type: 'ACTIVITY', actor: { first_name: 'Priya' }, actionText: 'changed status from TODO → IN_PROGRESS', created_at: '11:05 AM' },
  { id: 2, type: 'COMMENT', author: { id: 3, first_name: 'Rahul' }, content: 'Can you handle token expiration too?', created_at: '10:45 AM' },
];

function StatusPill({ label, variant }) {
  return <span className={`${styles.pill} ${styles[variant]}`}>{label}</span>;
}

export default function TaskDetail() {
  const { id } = useParams();
  const { user, org } = useDashboard();
  const [items, setItems] = useState(MOCK_TIMELINE);

  const handleAddComment = (content) => {
    setItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        type: 'COMMENT',
        author: { id: user?.id || 1, first_name: user?.first_name || 'Me' },
        content,
        created_at: 'Just now',
      },
    ]);
  };

  return (
    <AppShell org={org} user={user}>
      {/* Back breadcrumb */}
      <NavLink to="/tasks" className={styles.backLink}>
        <ArrowLeft size={14} />
        Tasks
      </NavLink>

      <div className={styles.container}>
        {/* ── Main column ─────────────────────────────────── */}
        <div className={styles.mainCol}>
          {/* Task header */}
          <div className={styles.taskHeader}>
            <h1 className={styles.taskTitle}>Implement authentication API</h1>
            <div className={styles.metaRow}>
              <StatusPill label="In Progress" variant="active" />
              <StatusPill label="High" variant="high" />
              <span className={styles.metaDivider} />
              <span className={styles.metaItem}>
                <Flag size={12} />
                Priority
              </span>
              <span className={styles.metaItem}>
                <Clock size={12} />
                Due Oct 5, 2026
              </span>
            </div>
          </div>

          {/* Description */}
          <div className={styles.section}>
            <h3 className={styles.sectionLabel}>Description</h3>
            <p className={styles.description}>
              Build login and token refresh endpoints using JWT authentication.
              Ensure proper error handling, rate limiting considerations, and security headers.
            </p>
          </div>

          {/* Timeline */}
          <Timeline
            items={items}
            currentUserId={user?.id || 1}
            currentUser={user}
            onAddComment={handleAddComment}
          />
        </div>

        {/* ── Side column ─────────────────────────────────── */}
        <div className={styles.sideCol}>
          <div className={styles.detailCard}>
            <h3 className={styles.cardTitle}>Task details</h3>

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Project</span>
              <span className={styles.detailValue}>Oorkivo Backend</span>
            </div>

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Assignee</span>
              <div className={styles.assigneeWrap}>
                <div className={styles.assigneeAvatar}>PS</div>
                <span className={styles.detailValue}>Priya Sharma</span>
              </div>
            </div>

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Created by</span>
              <span className={styles.detailValue}>Anamika Ghosh</span>
            </div>

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Status</span>
              <StatusPill label="In Progress" variant="active" />
            </div>

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Priority</span>
              <StatusPill label="High" variant="high" />
            </div>

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Due date</span>
              <span className={styles.detailValue}>Oct 5, 2026</span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
