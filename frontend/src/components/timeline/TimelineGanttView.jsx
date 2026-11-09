import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Search,
  Layers,
  Flag,
  ArrowRight,
  Maximize2,
  Users,
  List,
  BarChart3,
} from 'lucide-react';
import Avatar from '../Avatar';
import styles from './TimelineGanttView.module.css';

// ─── Helper Functions ───────────────────────────────────────────────
function parseDate(str) {
  if (!str) return null;
  const parts = str.split('T')[0].split('-');
  if (parts.length < 3) return null;
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatDate(date) {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function diffDays(start, end) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((end - start) / oneDay);
}

const STATUS_CONFIG = {
  COMPLETED: { label: 'Completed', color: '#10b981', barClass: styles.barCompleted, dotColor: '#10b981' },
  IN_PROGRESS: { label: 'In Progress', color: '#3b82f6', barClass: styles.barInProgress, dotColor: '#3b82f6' },
  IN_REVIEW: { label: 'In Review', color: '#8b5cf6', barClass: styles.barInReview, dotColor: '#8b5cf6' },
  BLOCKED: { label: 'Blocked', color: '#ef4444', barClass: styles.barBlocked, dotColor: '#ef4444' },
  TODO: { label: 'To Do', color: '#64748b', barClass: styles.barTodo, dotColor: '#64748b' },
  BACKLOG: { label: 'Backlog', color: '#94a3b8', barClass: styles.barBacklog, dotColor: '#94a3b8' },
};

export default function TimelineGanttView({
  tasks = [],
  milestones = [],
  sprints = [],
  project = null,
  onTaskClick,
}) {
  const [zoomMode, setZoomMode] = useState('DAYS'); // 'DAYS' | 'WEEKS' | 'MONTHS'
  const [groupBy, setGroupBy] = useState('SPRINTS'); // 'SPRINTS' | 'STATUS' | 'PRIORITY' | 'FLAT'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('chart'); // 'chart' | 'tasks'

  const canvasRef = useRef(null);
  const sidebarBodyRef = useRef(null);

  // Synchronize vertical scrolling between sidebar and canvas
  const handleCanvasScroll = (e) => {
    if (sidebarBodyRef.current) {
      sidebarBodyRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const handleSidebarScroll = (e) => {
    if (canvasRef.current) {
      canvasRef.current.scrollTop = e.target.scrollTop;
    }
  };

  // 1. Filter tasks by search query
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const query = searchQuery.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title?.toLowerCase().includes(query) ||
        t.status?.toLowerCase().includes(query) ||
        t.assigned_to_detail?.first_name?.toLowerCase().includes(query) ||
        t.assigned_to_detail?.email?.toLowerCase().includes(query)
    );
  }, [tasks, searchQuery]);

  // 2. Compute date boundaries
  const { timelineStart, timelineEnd, totalDays, todayDate } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dates = [today];

    if (project?.start_date) dates.push(parseDate(project.start_date));
    if (project?.target_end_date) dates.push(parseDate(project.target_end_date));

    sprints.forEach((s) => {
      if (s.start_date) dates.push(parseDate(s.start_date));
      if (s.end_date) dates.push(parseDate(s.end_date));
    });

    milestones.forEach((m) => {
      if (m.target_date) dates.push(parseDate(m.target_date));
    });

    tasks.forEach((t) => {
      if (t.due_date) dates.push(parseDate(t.due_date));
      if (t.created_at) dates.push(parseDate(t.created_at));
    });

    const validDates = dates.filter(Boolean);
    const minTimestamp = Math.min(...validDates.map((d) => d.getTime()));
    const maxTimestamp = Math.max(...validDates.map((d) => d.getTime()));

    // Add padding (7 days before, 14 days after)
    const start = addDays(new Date(minTimestamp), -7);
    const end = addDays(new Date(maxTimestamp), 14);

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    return {
      timelineStart: start,
      timelineEnd: end,
      totalDays: Math.max(14, diffDays(start, end)),
      todayDate: today,
    };
  }, [tasks, sprints, milestones, project]);

  // 3. Zoom column sizing
  const columnWidth = useMemo(() => {
    switch (zoomMode) {
      case 'DAYS':
        return 46;
      case 'WEEKS':
        return 120;
      case 'MONTHS':
        return 160;
      default:
        return 46;
    }
  }, [zoomMode]);

  const totalCanvasWidth = useMemo(() => {
    if (zoomMode === 'DAYS') return totalDays * columnWidth;
    if (zoomMode === 'WEEKS') return Math.ceil(totalDays / 7) * columnWidth;
    return Math.ceil(totalDays / 30) * columnWidth;
  }, [totalDays, columnWidth, zoomMode]);

  // 4. Grouping logic
  const { groupedItems, unscheduledTasks } = useMemo(() => {
    const scheduled = [];
    const unscheduled = [];

    filteredTasks.forEach((task) => {
      // Task has a scheduled presence if it has due_date or belongs to a sprint with dates
      if (task.due_date || (task.sprint && typeof task.sprint === 'object' && task.sprint.start_date)) {
        scheduled.push(task);
      } else {
        unscheduled.push(task);
      }
    });

    if (groupBy === 'FLAT') {
      return {
        groupedItems: [{ id: 'all', title: 'All Tasks', items: scheduled }],
        unscheduledTasks: unscheduled,
      };
    }

    if (groupBy === 'STATUS') {
      const groups = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETED', 'BACKLOG'].map((status) => ({
        id: status,
        title: STATUS_CONFIG[status]?.label || status,
        status,
        items: scheduled.filter((t) => t.status === status),
      })).filter((g) => g.items.length > 0);

      return { groupedItems: groups, unscheduledTasks: unscheduled };
    }

    if (groupBy === 'PRIORITY') {
      const groups = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => ({
        id: p,
        title: `${p.charAt(0) + p.slice(1).toLowerCase()} Priority`,
        priority: p,
        items: scheduled.filter((t) => t.priority === p),
      })).filter((g) => g.items.length > 0);

      return { groupedItems: groups, unscheduledTasks: unscheduled };
    }

    // Default: Group by Sprints
    const sprintMap = new Map();
    sprints.forEach((sp) => {
      sprintMap.set(String(sp.id), {
        id: `sprint-${sp.id}`,
        title: sp.name,
        sprint: sp,
        items: [],
      });
    });

    const noSprintTasks = [];
    scheduled.forEach((t) => {
      const sprintId = t.sprint ? String(typeof t.sprint === 'object' ? t.sprint.id : t.sprint) : null;
      if (sprintId && sprintMap.has(sprintId)) {
        sprintMap.get(sprintId).items.push(t);
      } else {
        noSprintTasks.push(t);
      }
    });

    const result = Array.from(sprintMap.values()).filter((g) => g.items.length > 0 || g.sprint.status === 'ACTIVE');
    if (noSprintTasks.length > 0) {
      result.push({
        id: 'no-sprint',
        title: 'Other Scheduled Work',
        items: noSprintTasks,
      });
    }

    return { groupedItems: result, unscheduledTasks: unscheduled };
  }, [filteredTasks, groupBy, sprints]);

  // 5. Calculate bar geometry per task
  const { taskBars, conflictsCount } = useMemo(() => {
    const bars = new Map();
    let conflicts = 0;

    // Helper: calculate task start and end
    const getTaskSpan = (task) => {
      let end = parseDate(task.due_date);
      let start = null;

      if (task.sprint && typeof task.sprint === 'object' && task.sprint.start_date) {
        start = parseDate(task.sprint.start_date);
        if (!end && task.sprint.end_date) {
          end = parseDate(task.sprint.end_date);
        }
      }

      if (end && !start) {
        const estDays = task.estimated_hours ? Math.max(1, Math.ceil(task.estimated_hours / 8)) : 3;
        start = addDays(end, -estDays);
      }

      if (!end && start) {
        end = addDays(start, 5);
      }

      if (!start || !end) {
        start = todayDate;
        end = addDays(todayDate, 2);
      }

      return { start, end };
    };

    groupedItems.forEach((group) => {
      if (collapsedGroups[group.id]) return;

      group.items.forEach((task) => {
        const { start, end } = getTaskSpan(task);

        const daysFromStart = diffDays(timelineStart, start);
        const duration = Math.max(1, diffDays(start, end));

        let left = 0;
        let width = 0;

        if (zoomMode === 'DAYS') {
          left = daysFromStart * columnWidth;
          width = Math.max(34, duration * columnWidth);
        } else if (zoomMode === 'WEEKS') {
          left = (daysFromStart / 7) * columnWidth;
          width = Math.max(34, (duration / 7) * columnWidth);
        } else {
          left = (daysFromStart / 30) * columnWidth;
          width = Math.max(34, (duration / 30) * columnWidth);
        }

        const isOverdue = end < todayDate && task.status !== 'COMPLETED';

        bars.set(String(task.id), {
          task,
          start,
          end,
          left,
          width,
          isOverdue,
        });
      });
    });

    // Check dependency conflicts:
    // If Task B depends on Task A, but Task B starts before Task A ends
    tasks.forEach((task) => {
      const dependentBar = bars.get(String(task.id));
      if (!dependentBar) return;

      const deps = task.dependencies || [];
      deps.forEach((dep) => {
        const prereqBar = bars.get(String(dep.id));
        if (prereqBar && dependentBar.start < prereqBar.end) {
          conflicts += 1;
        }
      });
    });

    return { taskBars: bars, conflictsCount: conflicts };
  }, [groupedItems, collapsedGroups, timelineStart, columnWidth, zoomMode, todayDate, tasks]);

  // 6. Flat visible rows for layout and SVG connector lines
  const visibleRows = useMemo(() => {
    const rows = [];
    groupedItems.forEach((group) => {
      rows.push({ type: 'GROUP', data: group });
      if (!collapsedGroups[group.id]) {
        group.items.forEach((task) => {
          rows.push({ type: 'TASK', data: task });
        });
      }
    });
    return rows;
  }, [groupedItems, collapsedGroups]);

  // 7. Calculate SVG Dependency Connector Paths
  const dependencyLines = useMemo(() => {
    const lines = [];
    const rowHeight = 42;
    const groupHeight = 38;

    // Map task id to its vertical center Y position on canvas
    const taskYMap = new Map();
    let currentY = 0;

    visibleRows.forEach((row) => {
      if (row.type === 'GROUP') {
        currentY += groupHeight;
      } else {
        taskYMap.set(String(row.data.id), currentY + rowHeight / 2);
        currentY += rowHeight;
      }
    });

    tasks.forEach((task) => {
      const targetId = String(task.id);
      const targetY = taskYMap.get(targetId);
      const targetBar = taskBars.get(targetId);

      if (targetY === undefined || !targetBar) return;

      const deps = task.dependencies || [];
      deps.forEach((dep) => {
        const sourceId = String(dep.id);
        const sourceY = taskYMap.get(sourceId);
        const sourceBar = taskBars.get(sourceId);

        if (sourceY === undefined || !sourceBar) return;

        const x1 = sourceBar.left + sourceBar.width;
        const y1 = sourceY;
        const x2 = targetBar.left;
        const y2 = targetY;

        const hasConflict = targetBar.start < sourceBar.end;

        // Cubic bezier control points
        const dx = Math.max(30, Math.abs(x2 - x1) / 2);
        const cp1x = x1 + dx;
        const cp1y = y1;
        const cp2x = x2 - dx;
        const cp2y = y2;

        const pathD = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;

        lines.push({
          id: `${sourceId}->${targetId}`,
          pathD,
          hasConflict,
          sourceTitle: dep.title,
          targetTitle: task.title,
        });
      });
    });

    return lines;
  }, [visibleRows, tasks, taskBars]);

  // 8. Today indicator position
  const todayPosition = useMemo(() => {
    const daysFromStart = diffDays(timelineStart, todayDate);
    if (zoomMode === 'DAYS') return daysFromStart * columnWidth;
    if (zoomMode === 'WEEKS') return (daysFromStart / 7) * columnWidth;
    return (daysFromStart / 30) * columnWidth;
  }, [timelineStart, todayDate, columnWidth, zoomMode]);

  // Jump to today
  const scrollToToday = () => {
    if (canvasRef.current && todayPosition !== null) {
      canvasRef.current.scrollLeft = Math.max(0, todayPosition - 200);
    }
  };

  useEffect(() => {
    // Initial scroll near Today
    scrollToToday();
  }, [todayPosition]);

  // Toggle group collapse
  const toggleGroup = (groupId) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Generate Date Headers
  const timeHeaders = useMemo(() => {
    const days = [];
    const months = [];

    let currentMonth = null;
    let currentMonthSpan = 0;
    let currentMonthStartLeft = 0;

    for (let i = 0; i < totalDays; i++) {
      const d = addDays(timelineStart, i);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const isToday = diffDays(d, todayDate) === 0;

      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      if (currentMonth !== monthKey) {
        if (currentMonth !== null) {
          months.push({
            label: months[months.length - 1]?.label || '',
            width: currentMonthSpan * (zoomMode === 'DAYS' ? columnWidth : columnWidth / 7),
          });
        }
        currentMonth = monthKey;
        currentMonthSpan = 1;
        months.push({ label: monthLabel, width: 0 });
      } else {
        currentMonthSpan += 1;
      }

      if (zoomMode === 'DAYS') {
        days.push({
          date: d,
          dayNum: d.getDate(),
          dayName: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
          isWeekend,
          isToday,
          left: i * columnWidth,
        });
      }
    }

    if (months.length > 0) {
      months[months.length - 1].width = currentMonthSpan * (zoomMode === 'DAYS' ? columnWidth : columnWidth / 7);
    }

    return { days, months };
  }, [timelineStart, totalDays, todayDate, zoomMode, columnWidth]);

  return (
    <div className={styles.timelineContainer}>
      {/* ─── Control Toolbar ─────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.searchBox}>
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search timeline tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.controlGroup}>
            {['SPRINTS', 'STATUS', 'PRIORITY', 'FLAT'].map((mode) => (
              <button
                key={mode}
                type="button"
                className={`${styles.controlBtn} ${groupBy === mode ? styles.controlBtnActive : ''}`}
                onClick={() => setGroupBy(mode)}
              >
                {mode === 'SPRINTS' && <Layers size={13} />}
                {mode === 'STATUS' && <CheckCircle2 size={13} />}
                {mode === 'PRIORITY' && <AlertTriangle size={13} />}
                {mode.charAt(0) + mode.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.toolbarRight}>
          <div className={styles.mobileViewToggle}>
            <button
              type="button"
              className={`${styles.mobileViewBtn} ${mobilePanel === 'chart' ? styles.mobileViewBtnActive : ''}`}
              onClick={() => setMobilePanel('chart')}
              title="Show Gantt Chart"
            >
              <BarChart3 size={13} /> Chart
            </button>
            <button
              type="button"
              className={`${styles.mobileViewBtn} ${mobilePanel === 'tasks' ? styles.mobileViewBtnActive : ''}`}
              onClick={() => setMobilePanel('tasks')}
              title="Show Task Table"
            >
              <List size={13} /> Tasks
            </button>
          </div>

          {conflictsCount > 0 && (
            <span className={styles.conflictBadge} title="Tasks scheduled before dependencies finish">
              <AlertTriangle size={13} />
              {conflictsCount} Schedule Conflict{conflictsCount > 1 ? 's' : ''}
            </span>
          )}

          <button type="button" className={styles.todayBtn} onClick={scrollToToday}>
            <Clock size={13} /> Today
          </button>

          <div className={styles.controlGroup}>
            {['DAYS', 'WEEKS', 'MONTHS'].map((zoom) => (
              <button
                key={zoom}
                type="button"
                className={`${styles.controlBtn} ${zoomMode === zoom ? styles.controlBtnActive : ''}`}
                onClick={() => setZoomMode(zoom)}
              >
                {zoom.charAt(0) + zoom.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Summary / Metrics Bar ───────────────────────────────── */}
      <div className={styles.metricsBar}>
        <div className={styles.metricItem}>
          <span>Scheduled Tasks:</span>
          <span className={styles.metricValue}>{taskBars.size}</span>
        </div>
        <div className={styles.metricItem}>
          <span>Dependencies:</span>
          <span className={styles.metricValue}>{dependencyLines.length}</span>
        </div>
        {milestones.length > 0 && (
          <div className={styles.metricItem}>
            <Flag size={13} color="#f59e0b" />
            <span>Milestones:</span>
            <span className={styles.metricValue}>{milestones.length}</span>
          </div>
        )}
        {unscheduledTasks.length > 0 && (
          <div className={styles.metricItem}>
            <span>Unscheduled:</span>
            <button
              type="button"
              className={styles.unscheduledCount}
              onClick={() => setShowUnscheduled(!showUnscheduled)}
            >
              {unscheduledTasks.length} tasks
            </button>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {Object.entries(STATUS_CONFIG).slice(0, 4).map(([status, conf]) => (
            <div key={status} className={styles.legendPill}>
              <span className={styles.legendDot} style={{ background: conf.color }} />
              <span>{conf.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Main View Split: Sidebar + Gantt Canvas ─────────────── */}
      <div className={styles.mainSplit} data-mobile-panel={mobilePanel}>
        {/* Left Sidebar Table */}
        <aside className={styles.sidebarPane}>
          <div className={styles.sidebarHeader}>
            <span>Task Breakdown</span>
            <span>Due</span>
          </div>

          <div
            className={styles.sidebarBody}
            ref={sidebarBodyRef}
            onScroll={handleSidebarScroll}
          >
            {groupedItems.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No matching tasks found.</p>
              </div>
            ) : (
              groupedItems.map((group) => {
                const isCollapsed = collapsedGroups[group.id];
                return (
                  <React.Fragment key={group.id}>
                    <div
                      className={styles.groupHeaderRow}
                      onClick={() => toggleGroup(group.id)}
                    >
                      <div className={styles.groupTitle}>
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        <span>{group.title}</span>
                      </div>
                      <span className={styles.groupBadge}>{group.items.length}</span>
                    </div>

                    {!isCollapsed &&
                      group.items.map((task) => {
                        const statusConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO;
                        const isSelected = selectedTaskId === task.id;
                        return (
                          <div
                            key={task.id}
                            className={`${styles.itemRow} ${isSelected ? styles.itemRowSelected : ''}`}
                            onClick={() => {
                              setSelectedTaskId(task.id);
                              if (onTaskClick) onTaskClick(task);
                            }}
                            title={task.title}
                          >
                            <span
                              className={styles.itemStatusDot}
                              style={{ background: statusConf.dotColor }}
                            />
                            <span className={styles.itemTitle}>{task.title}</span>

                            <div className={styles.itemMeta}>
                              {task.assigned_to_detail ? (
                                <Avatar user={task.assigned_to_detail} size={18} />
                              ) : (
                                <Users size={12} color="#94a3b8" />
                              )}
                              <span>{task.due_date ? formatDate(parseDate(task.due_date)) : '—'}</span>
                            </div>
                          </div>
                        );
                      })}
                  </React.Fragment>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Gantt Canvas */}
        <div
          className={styles.canvasPane}
          ref={canvasRef}
          onScroll={handleCanvasScroll}
        >
          <div className={styles.canvasInner} style={{ width: totalCanvasWidth }}>
            {/* Header: Months & Days */}
            <div className={styles.timeHeader}>
              <div className={styles.monthRow}>
                {timeHeaders.months.map((m, idx) => (
                  <div
                    key={idx}
                    className={styles.monthCell}
                    style={{ width: m.width || 'auto' }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>

              {zoomMode === 'DAYS' && (
                <div className={styles.daysRow}>
                  {timeHeaders.days.map((day, idx) => (
                    <div
                      key={idx}
                      className={`${styles.dayCell} ${day.isWeekend ? styles.dayCellWeekend : ''} ${day.isToday ? styles.dayCellToday : ''}`}
                      style={{ width: columnWidth }}
                    >
                      <span style={{ fontSize: 9 }}>{day.dayName}</span>
                      <strong>{day.dayNum}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Grid background lines */}
            <div className={styles.gridOverlay}>
              {zoomMode === 'DAYS' &&
                timeHeaders.days.map((day, idx) => (
                  <div
                    key={idx}
                    className={`${styles.gridCol} ${day.isWeekend ? styles.gridColWeekend : ''}`}
                    style={{ width: columnWidth }}
                  />
                ))}
            </div>

            {/* Today Line Indicator */}
            {todayPosition !== null && todayPosition >= 0 && (
              <div className={styles.todayMarker} style={{ left: todayPosition }}>
                <span className={styles.todayBadge}>Today</span>
              </div>
            )}

            {/* Milestone Diamond Markers */}
            {milestones.map((milestone) => {
              const mDate = parseDate(milestone.target_date);
              if (!mDate) return null;
              const daysDiff = diffDays(timelineStart, mDate);
              const mLeft = zoomMode === 'DAYS' ? daysDiff * columnWidth : (daysDiff / 7) * columnWidth;
              if (mLeft < 0 || mLeft > totalCanvasWidth) return null;

              return (
                <div key={milestone.id} className={styles.milestonePin} style={{ left: mLeft }}>
                  <div
                    className={styles.milestoneDiamond}
                    title={`Milestone: ${milestone.title} (${formatDate(mDate)})`}
                  />
                  <div className={styles.milestoneLabel}>{milestone.title}</div>
                </div>
              );
            })}

            {/* Canvas Rows */}
            <div className={styles.rowsContainer}>
              {/* SVG Connector Arrows for Dependencies */}
              <svg className={styles.dependenciesSvg}>
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" className={styles.dependencyArrow} />
                  </marker>
                  <marker
                    id="arrowhead-conflict"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" className={styles.dependencyArrowConflict} />
                  </marker>
                </defs>

                {dependencyLines.map((line) => (
                  <path
                    key={line.id}
                    d={line.pathD}
                    className={`${styles.dependencyPath} ${line.hasConflict ? styles.dependencyPathConflict : ''}`}
                    markerEnd={line.hasConflict ? 'url(#arrowhead-conflict)' : 'url(#arrowhead)'}
                  >
                    <title>
                      {line.hasConflict
                        ? `Warning: ${line.targetTitle} is scheduled before prerequisite ${line.sourceTitle} finishes!`
                        : `${line.sourceTitle} → ${line.targetTitle}`}
                    </title>
                  </path>
                ))}
              </svg>

              {/* Render Gantt Bars per Row */}
              {visibleRows.map((row, idx) => {
                if (row.type === 'GROUP') {
                  const sprint = row.data.sprint;
                  return (
                    <div key={`group-${row.data.id}`} className={styles.canvasGroupRow}>
                      {sprint && sprint.start_date && sprint.end_date && (
                        (() => {
                          const sStart = parseDate(sprint.start_date);
                          const sEnd = parseDate(sprint.end_date);
                          const sLeft = diffDays(timelineStart, sStart) * (zoomMode === 'DAYS' ? columnWidth : columnWidth / 7);
                          const sWidth = Math.max(40, diffDays(sStart, sEnd) * (zoomMode === 'DAYS' ? columnWidth : columnWidth / 7));
                          return (
                            <div
                              className={styles.sprintBand}
                              style={{ left: sLeft, width: sWidth }}
                              title={`Sprint duration: ${formatDate(sStart)} – ${formatDate(sEnd)}`}
                            >
                              Iteration: {sprint.name}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  );
                }

                const task = row.data;
                const bar = taskBars.get(String(task.id));
                const statusConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.TODO;

                return (
                  <div key={`row-${task.id}`} className={styles.canvasRow}>
                    {bar && (
                      <div
                        className={`${styles.taskBar} ${statusConf.barClass} ${bar.isOverdue ? styles.barOverdue : ''}`}
                        style={{
                          left: bar.left,
                          width: bar.width,
                        }}
                        onClick={() => {
                          setSelectedTaskId(task.id);
                          if (onTaskClick) onTaskClick(task);
                        }}
                        title={`${task.title}\nStatus: ${statusConf.label}\nSchedule: ${formatDate(bar.start)} – ${formatDate(bar.end)}${task.dependencies?.length ? `\nDependencies: ${task.dependencies.length}` : ''}`}
                      >
                        <span className={styles.barLabel}>{task.title}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Unscheduled Tasks Bottom Drawer ─────────────────────── */}
      {unscheduledTasks.length > 0 && (
        <div className={styles.unscheduledDrawer}>
          <div className={styles.unscheduledInfo}>
            <AlertTriangle size={14} color="#f59e0b" />
            <span>
              <strong>{unscheduledTasks.length} Unscheduled Tasks</strong> without set deadlines or sprint windows:
            </span>
          </div>

          <div className={styles.unscheduledTags}>
            {unscheduledTasks.slice(0, 5).map((t) => (
              <span
                key={t.id}
                className={styles.unscheduledPill}
                onClick={() => onTaskClick && onTaskClick(t)}
                title="Click to open and set due date"
              >
                {t.title}
                <ArrowRight size={11} color="#64748b" />
              </span>
            ))}
            {unscheduledTasks.length > 5 && (
              <span style={{ fontSize: 11, color: '#64748b' }}>
                +{unscheduledTasks.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
