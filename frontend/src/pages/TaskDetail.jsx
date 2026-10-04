import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  CalendarDays,
  Circle,
  Flag,
  UserRound,
  Plus,
  GitBranch,
  Timer,
  MoreHorizontal,
  File as FileIcon,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  Download,
  Trash2,
  Paperclip,
  MessagesSquare,
} from "lucide-react";
import OverlayDetailShell from "../components/layout/OverlayDetailShell";
import OrganizationMemberSelector from "../components/OrganizationMemberSelector";
import Timeline from "../components/communication/Timeline";
import DropdownSelect from "../components/DropdownSelect";
import { useDashboard } from "../hooks/useDashboard";
import { communicationApi, organizationsApi, projectsApi, tasksApi, teamsApi } from "../services/api";
import styles from "./TaskDetail.module.css";

const STATUS_META = {
  BACKLOG: { cls: "backlog", label: "Backlog" },
  TODO: { cls: "todo", label: "To Do" },
  PLANNED: { cls: "planned", label: "Planned" },
  IN_PROGRESS: { cls: "active", label: "In Progress" },
  IN_REVIEW: { cls: "hold", label: "In Review" },
  COMPLETED: { cls: "done", label: "Completed" },
  BLOCKED: { cls: "urgent", label: "Blocked" },
};

const PRIORITY_META = {
  URGENT: { cls: "urgent", label: "Urgent" },
  HIGH: { cls: "high", label: "High" },
  MEDIUM: { cls: "medium", label: "Medium" },
  LOW: { cls: "low", label: "Low" },
};

function getErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  return fallback;
}
function getUserName(person) {
  if (!person) return "Unassigned";
  const name = [person.first_name, person.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || person.email || "Unknown user";
}

function formatDate(value) {
  if (!value) return "Not set";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDueLabel(value) {
  if (!value) return "No due date";
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  if (days < 0)
    return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due ${formatDate(value)}`;
}

function MetaField({ label, icon: Icon, children }) {
  return (
    <label className={styles.metaControl}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValueWrap}>
        {Icon && <Icon size={13} />}
        {children}
      </span>
    </label>
  );
}

function StatusPill({ label, variant }) {
  return <span className={`${styles.pill} ${styles[variant]}`}>{label}</span>;
}

function TaskActivity({ items, error }) {
  if (error)
    return (
      <div className={styles.inlineError} role="alert">
        {error}
      </div>
    );
  if (!items.length)
    return (
      <p className={styles.panelMessage}>Task changes will appear here.</p>
    );
  const eventLabel = (item) => {
    const details = item.details || {};
    if (item.action === "STATUS_CHANGED")
      return `Status changed: ${details.old} → ${details.new}`;
    if (item.action === "PRIORITY_CHANGED")
      return `Priority changed: ${details.old} → ${details.new}`;
    if (item.action === "ASSIGNED") return "Task assignment changed";
    if (item.action === "DUE_DATE_CHANGED")
      return `Due date changed: ${details.old || "Not set"} → ${details.new || "Not set"}`;
    if (item.action === "COMMENTED") return "Comment added";
    if (item.action === "COMPLETED") return "Task completed";
    if (item.action === "MILESTONE_COMPLETED")
      return `Milestone completed: ${details.milestone_title}`;
    if (details.parent_task_title)
      return `Subtask created under ${details.parent_task_title}`;
    return "Task created";
  };
  return (
    <ol className={styles.taskActivity}>
      {items.map((item) => (
        <li key={item.id}>
          <span className={styles.activityDot} />
          <div>
            <strong>{eventLabel(item)}</strong>
            <small>
              {getUserName(item.actor)} · {formatDateTime(item.created_at)}
            </small>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const hasBackground = Boolean(location.state?.backgroundLocation);
  const taskLinkState = location.state;
  const closeDetail = () => {
    if (hasBackground) navigate(-1);
    else navigate("/tasks", { replace: true });
  };
  const { user, org } = useDashboard();
  const [task, setTask] = useState(null);
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [members, setMembers] = useState([]);
  const [organizationMembers, setOrganizationMembers] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [organizationMembersError, setOrganizationMembersError] = useState("");
  const [projectTasks, setProjectTasks] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attachmentError, setAttachmentError] = useState("");
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [projectTasksError, setProjectTasksError] = useState("");
  const [sprintsError, setSprintsError] = useState("");
  const [subtaskError, setSubtaskError] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskSaving, setSubtaskSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [taskError, setTaskError] = useState("");
  const [commentsError, setCommentsError] = useState("");
  const [membersError, setMembersError] = useState("");
  const [actionError, setActionError] = useState("");
  const [savingField, setSavingField] = useState("");
  const [activeTab, setActiveTab] = useState("OVERVIEW");
  const previewUrls = useRef(new Set());

  useEffect(() => {
    let active = true;

    async function loadTask() {
      setLoading(true);
      setTaskError("");
      setCommentsError("");
      setMembersError("");
      setActivityError("");
      setProjectTasksError("");
      setSprintsError("");
      setSubtaskError("");
      setActionError("");
      setTask(null);
      setComments([]);
      setActivity([]);
      setMembers([]);
      setOrganizationMembers([]);
      setTeamMembers([]);
      setOrganizationMembersError("");
      setProjectTasks([]);
      setSprints([]);
      setAttachments([]);
      setAttachmentError("");
      setActiveTab("OVERVIEW");

      try {
        const response = await tasksApi.get(id);
        const loadedTask = response.data;
        if (!active) return;
        setTask(loadedTask);

        const results = await Promise.allSettled([
          tasksApi.comments(id),
          loadedTask.project?.id
            ? projectsApi.members(loadedTask.project.id)
            : Promise.resolve({ data: [] }),
          tasksApi.activity(id),
          loadedTask.project?.id
            ? projectsApi.tasks(loadedTask.project.id)
            : Promise.resolve({ data: [] }),
          tasksApi.attachments(id),
          loadedTask.project?.id
            ? projectsApi.sprints(loadedTask.project.id)
            : Promise.resolve({ data: [] }),
          org?.id ? organizationsApi.members(org.id) : Promise.resolve({ data: [] }),
          loadedTask.project?.id
            ? projectsApi.get(loadedTask.project.id)
            : Promise.resolve({ data: null }),
        ]);
        if (!active) return;

        const [
          commentsResult,
          membersResult,
          activityResult,
          projectTasksResult,
          attachmentsResult,
          sprintsResult,
          organizationMembersResult,
          projectResult,
        ] = results;
        if (organizationMembersResult.status === "fulfilled") {
          const data =
            organizationMembersResult.value.data?.results ??
            organizationMembersResult.value.data;
          setOrganizationMembers(
            (Array.isArray(data) ? data : []).filter(
              (membership) =>
                membership.status === "ACTIVE" &&
                membership.is_active !== false &&
                membership.user,
            ),
          );
        } else {
          setOrganizationMembersError(
            getErrorMessage(
              organizationMembersResult.reason,
              "Could not load organization members.",
            ),
          );
        }
        if (commentsResult.status === "fulfilled") {
          const data =
            commentsResult.value.data?.results ?? commentsResult.value.data;
          setComments(Array.isArray(data) ? data : []);
        } else {
          setCommentsError(
            getErrorMessage(
              commentsResult.reason,
              "Could not load task comments.",
            ),
          );
        }

        if (membersResult.status === "fulfilled") {
          const data =
            membersResult.value.data?.results ?? membersResult.value.data;
          setMembers(Array.isArray(data) ? data : []);
        } else {
          setMembersError(
            getErrorMessage(
              membersResult.reason,
              "Could not load project members.",
            ),
          );
        }
        if (projectResult.status === "fulfilled") {
          const project = projectResult.value.data;
          const teamId = project?.team?.id ?? project?.team;
          if (teamId) {
            try {
              const teamMembersResult = await teamsApi.members(teamId);
              const data = teamMembersResult.data?.results ?? teamMembersResult.data;
              setTeamMembers(Array.isArray(data) ? data : []);
            } catch (teamMembersError) {
              setOrganizationMembersError(
                getErrorMessage(teamMembersError, "Could not load eligible team members."),
              );
            }
          }
        }
        if (activityResult.status === "fulfilled") {
          const data =
            activityResult.value.data?.results ?? activityResult.value.data;
          setActivity(Array.isArray(data) ? data : []);
        } else {
          setActivityError(
            getErrorMessage(
              activityResult.reason,
              "Could not load task activity.",
            ),
          );
        }
        if (projectTasksResult.status === "fulfilled") {
          const data =
            projectTasksResult.value.data?.results ??
            projectTasksResult.value.data;
          setProjectTasks(Array.isArray(data) ? data : []);
        } else {
          setProjectTasksError(
            getErrorMessage(
              projectTasksResult.reason,
              "Could not load project tasks for dependencies.",
            ),
          );
        }
        if (attachmentsResult.status === "fulfilled") {
          const data =
            attachmentsResult.value.data?.results ??
            attachmentsResult.value.data;
          setAttachments(Array.isArray(data) ? data : []);
        } else {
          setAttachmentError(
            getErrorMessage(
              attachmentsResult.reason,
              "Could not load task attachments.",
            ),
          );
        }
        if (sprintsResult.status === "fulfilled") {
          const data =
            sprintsResult.value.data?.results ?? sprintsResult.value.data;
          setSprints(Array.isArray(data) ? data : []);
        } else {
          setSprintsError(
            getErrorMessage(
              sprintsResult.reason,
              "Could not load project sprints.",
            ),
          );
        }
      } catch (error) {
        if (active) {
          setTaskError(getErrorMessage(error, "Could not load this task."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadTask();
    return () => {
      active = false;
    };
  }, [id, org?.id]);

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current.clear();
    },
    [],
  );

  const handleUpdate = async (field, value) => {
    setSavingField(field);
    setActionError("");
    try {
      const response = await tasksApi.update(id, { [field]: value });
      setTask(response.data);
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not save the task update."));
    } finally {
      setSavingField("");
    }
  };

  const handleAddComment = async (content) => {
    setActionError("");
    try {
      const response = await tasksApi.addComment(id, { content });
      setComments((current) => [...current, response.data]);
      try {
        const history = await tasksApi.activity(id);
        setActivity(history.data?.results ?? history.data);
      } catch (error) {
        setActivityError(
          getErrorMessage(
            error,
            "Comment posted, but task activity could not be refreshed.",
          ),
        );
      }
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not post your comment."));
    }
  };

  const handleAddSubtask = async (event) => {
    event.preventDefault();
    if (!subtaskTitle.trim()) return;
    setSubtaskSaving(true);
    setSubtaskError("");
    try {
      const response = await tasksApi.addSubtask(id, {
        title: subtaskTitle.trim(),
      });
      setTask((current) => ({
        ...current,
        subtasks: [...(current.subtasks || []), response.data],
      }));
      setSubtaskTitle("");
      try {
        const history = await tasksApi.activity(id);
        setActivity(history.data?.results ?? history.data);
      } catch (error) {
        setActivityError(
          getErrorMessage(
            error,
            "Subtask was added, but task activity could not be refreshed.",
          ),
        );
      }
    } catch (error) {
      setSubtaskError(getErrorMessage(error, "Could not add this subtask."));
    } finally {
      setSubtaskSaving(false);
    }
  };

  const handleToggleSubtask = async (subtask) => {
    setSubtaskError("");
    const statusValue = subtask.status === "COMPLETED" ? "TODO" : "COMPLETED";
    try {
      const response = await tasksApi.update(subtask.id, {
        status: statusValue,
      });
      setTask((current) => ({
        ...current,
        subtasks: current.subtasks.map((item) =>
          item.id === subtask.id ? response.data : item,
        ),
      }));
      try {
        const history = await tasksApi.activity(id);
        setActivity(history.data?.results ?? history.data);
      } catch (error) {
        setActivityError(
          getErrorMessage(
            error,
            "Subtask was updated, but task activity could not be refreshed.",
          ),
        );
      }
    } catch (error) {
      setSubtaskError(getErrorMessage(error, "Could not update this subtask."));
    }
  };

  const handleDeleteComment = async (commentId) => {
    setActionError("");
    try {
      await communicationApi.deleteComment(commentId);
      setComments((current) =>
        current.filter((comment) => comment.id !== commentId),
      );
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not delete this comment."));
    }
  };

  const handleUpdateComment = async (commentId, content) => {
    setActionError("");
    try {
      const response = await communicationApi.updateComment(commentId, {
        content,
      });
      setComments((current) =>
        current.map((comment) =>
          comment.id === commentId ? response.data : comment,
        ),
      );
      return true;
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not update this comment."));
      return false;
    }
  };

  const handleUploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const allowed = /\.(pdf|png|jpe?g|gif|webp|txt|csv|docx?|xlsx?|zip)$/i.test(
      file.name,
    );
    if (!allowed) {
      setAttachmentError(
        "Choose a PDF, image, text, spreadsheet, document, or ZIP file.",
      );
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setAttachmentError("Attachments must be 20 MB or smaller.");
      return;
    }
    setAttachmentError("");
    setAttachmentLoading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await tasksApi.uploadAttachment(
        id,
        formData,
        (progress) => {
          if (progress.total)
            setUploadProgress(
              Math.round((progress.loaded / progress.total) * 100),
            );
        },
      );
      const attachment = response.data;
      if (attachment.content_type?.startsWith("image/")) {
        const preview = await tasksApi.downloadAttachment(id, attachment.id);
        attachment.previewUrl = URL.createObjectURL(preview.data);
        previewUrls.current.add(attachment.previewUrl);
      }
      setAttachments((current) => [attachment, ...current]);
    } catch (error) {
      setAttachmentError(
        getErrorMessage(
          error,
          "Upload failed. Check file type, size, and your task access.",
        ),
      );
    } finally {
      setAttachmentLoading(false);
      setUploadProgress(0);
    }
  };

  const handleDownloadAttachment = async (attachment) => {
    setAttachmentError("");
    try {
      const response = await tasksApi.downloadAttachment(id, attachment.id);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setAttachmentError(
        getErrorMessage(error, "Could not download this attachment."),
      );
    }
  };

  const handleDeleteAttachment = async (attachment) => {
    setAttachmentError("");
    try {
      await tasksApi.deleteAttachment(id, attachment.id);
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
        previewUrls.current.delete(attachment.previewUrl);
      }
      setAttachments((current) =>
        current.filter((item) => item.id !== attachment.id),
      );
    } catch (error) {
      setAttachmentError(
        getErrorMessage(error, "Could not delete this attachment."),
      );
    }
  };

  const getAttachmentIcon = (attachment) => {
    if (attachment.content_type?.startsWith("image/")) return FileImage;
    if (
      attachment.content_type?.includes("spreadsheet") ||
      attachment.content_type?.includes("excel") ||
      attachment.content_type === "text/csv"
    )
      return FileSpreadsheet;
    if (attachment.content_type?.includes("zip")) return FileArchive;
    if (
      attachment.content_type?.includes("pdf") ||
      attachment.content_type?.includes("word") ||
      attachment.content_type?.startsWith("text/")
    )
      return FileText;
    return FileIcon;
  };

  const status = STATUS_META[task?.status] ?? {
    cls: "planning",
    label: task?.status ?? "Unknown",
  };
  const priority = PRIORITY_META[task?.priority] ?? {
    cls: "medium",
    label: task?.priority ?? "Unknown",
  };
  const taskDueLabel = getDueLabel(task?.due_date);
  const assignedToId = task?.assigned_to?.id?.toString() ?? "";
  const focusDiscussion = () => {
    document.getElementById("task-discussion")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };
  const isProjectManager = members.some(
    (member) =>
      String(member.user?.id) === String(user?.id) && member.role === "MANAGER",
  );
  const canManageTask =
    isProjectManager || Boolean(org?.permissions?.can_manage_members);
  const canEditTask =
    canManageTask || String(task?.assigned_to?.id) === String(user?.id);
  const eligibleAssigneeIds = new Set([
    ...members
      .filter((membership) => membership.role !== "VIEWER")
      .map((membership) => String(membership.user?.id ?? membership.user)),
    ...teamMembers.map((membership) => String(membership.user?.id ?? membership.user)),
  ]);
  if (task?.assigned_to?.id != null) eligibleAssigneeIds.add(String(task.assigned_to.id));
  const taskAssigneeOptions = organizationMembers.filter((membership) =>
    eligibleAssigneeIds.has(String(membership.user?.id ?? membership.user)));

  return (
    <OverlayDetailShell
      centerTitle="Task details"
      ariaLabel="Task details"
      onClose={closeDetail}
      backLabel="Back to tasks"
    >
      <div className={styles.detailScroller}>
        <div className={styles.pageShell}>
          {loading && <p className={styles.stateMessage}>Loading task…</p>}
          {!loading && taskError && (
            <div className={styles.stateError} role="alert">
              {taskError}
            </div>
          )}

          {!loading && task && (
            <>
              {actionError && (
                <div className={styles.stateError} role="alert">
                  {actionError}
                </div>
              )}
              <div className={styles.container}>
                <main className={styles.mainCol}>
                  <header className={styles.taskHeader}>
                    <div className={styles.eyebrow}>
                      {task.project?.name ?? "Project task"}
                    </div>
                    <div className={styles.titleRow}>
                      <h1 className={styles.taskTitle}>{task.title}</h1>
                      <details className={styles.quickActions}>
                        <summary aria-label="Task quick actions">
                          <MoreHorizontal size={17} />
                        </summary>
                        <div>
                          {canEditTask && (
                            <button
                              type="button"
                              onClick={() => setActiveTab("SUBTASKS")}
                            >
                              Add subtask
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              focusDiscussion();
                            }}
                          >
                            Add comment
                          </button>
                          {canEditTask && task.status !== "COMPLETED" && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdate("status", "COMPLETED")
                              }
                            >
                              Mark complete
                            </button>
                          )}
                        </div>
                      </details>
                    </div>

                    <div className={styles.headerBadges}>
                      <StatusPill label={status.label} variant={status.cls} />
                      <StatusPill
                        label={priority.label}
                        variant={priority.cls}
                      />
                      <div className={styles.separator} />
                      <span className={styles.inlineMeta}>
                        Updated {formatDateTime(task.updated_at)}
                      </span>
                    </div>

                    <div className={styles.ownerRow}>
                      <div className={styles.assigneeBlock}>
                        <div className={styles.assigneeAvatar}>
                          {task.assigned_to ? (
                            getUserName(task.assigned_to)
                              .slice(0, 1)
                              .toUpperCase()
                          ) : (
                            <UserRound size={16} />
                          )}
                        </div>
                        <div className={styles.assigneeInfo}>
                          <span className={styles.detailLabel}>
                            Assigned to
                          </span>
                          <strong className={styles.assigneeName}>
                            {getUserName(task.assigned_to)}
                          </strong>
                        </div>
                      </div>

                      <div className={styles.dueBlock}>
                        <CalendarDays size={14} />
                        <span
                          className={
                            task.due_date && task.status !== "COMPLETED"
                              ? taskDueLabel.includes("overdue")
                                ? styles.dueUrgent
                                : ["Due today", "Due tomorrow"].includes(
                                      taskDueLabel,
                                    )
                                  ? styles.dueSoon
                                  : ""
                              : ""
                          }
                        >
                          {task.status === "COMPLETED" && task.due_date
                            ? `Due ${formatDate(task.due_date)}`
                            : taskDueLabel}
                        </span>
                      </div>
                    </div>
                  </header>

                  <nav
                    className={styles.detailTabs}
                    aria-label="Task details sections"
                    role="tablist"
                  >
                    {[
                      ["OVERVIEW", "Overview"],
                      [
                        "SUBTASKS",
                        `Subtasks${task.subtasks?.length ? ` (${task.subtasks.length})` : ""}`,
                      ],
                      ...(canManageTask ? [["ASSIGNEE", "Assignee"]] : []),
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === value}
                        aria-controls={`task-panel-${value.toLowerCase()}`}
                        id={`task-tab-${value.toLowerCase()}`}
                        className={
                          activeTab === value ? styles.detailTabActive : ""
                        }
                        key={value}
                        onClick={() => setActiveTab(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>

                  <section
                    className={styles.tabPanel}
                    id="task-panel-overview"
                    role="tabpanel"
                    aria-labelledby="task-tab-overview"
                    hidden={activeTab !== "OVERVIEW"}
                  >
                    <section className={styles.section}>
                      <div className={styles.sectionTitleRow}>
                        <span className={styles.sectionLabel}>Description</span>
                      </div>
                      <p className={styles.description}>
                        {task.description || "No description has been added."}
                      </p>
                    </section>
                  </section>

                  <section
                    className={`${styles.section} ${styles.tabPanel}`}
                    id="task-panel-subtasks"
                    role="tabpanel"
                    aria-labelledby="task-tab-subtasks"
                    hidden={activeTab !== "SUBTASKS"}
                  >
                    <div className={styles.sectionTitleRow}>
                      <span className={styles.sectionLabel}>Subtasks</span>
                      <span className={styles.subtaskCount}>
                        {task.subtasks?.filter(
                          (item) => item.status === "COMPLETED",
                        ).length || 0}{" "}
                        / {task.subtasks?.length || 0} complete
                      </span>
                    </div>
                    {!!task.subtasks?.length && (
                      <div className={styles.subtaskProgress}>
                        <span
                          style={{
                            width: `${Math.round((task.subtasks.filter((item) => item.status === "COMPLETED").length / task.subtasks.length) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                    <ul className={styles.subtaskList}>
                      {task.subtasks?.map((subtask) => (
                        <li key={subtask.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={subtask.status === "COMPLETED"}
                              disabled={
                                !canManageTask &&
                                String(subtask.assigned_to) !== String(user?.id)
                              }
                              onChange={() => handleToggleSubtask(subtask)}
                            />
                            <NavLink
                              to={`/tasks/${subtask.id}`}
                              state={taskLinkState}
                              className={
                                subtask.status === "COMPLETED"
                                  ? styles.subtaskDone
                                  : ""
                              }
                            >
                              {subtask.title}
                            </NavLink>
                          </label>
                          <span>
                            {STATUS_META[subtask.status]?.label ??
                              subtask.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {canEditTask && (
                      <form
                        className={styles.subtaskForm}
                        onSubmit={handleAddSubtask}
                      >
                        <input
                          value={subtaskTitle}
                          onChange={(event) =>
                            setSubtaskTitle(event.target.value)
                          }
                          placeholder="Add a subtask"
                          aria-label="New subtask title"
                          maxLength={255}
                        />
                        <button
                          type="submit"
                          disabled={subtaskSaving || !subtaskTitle.trim()}
                          aria-label="Add subtask"
                        >
                          <Plus size={15} />
                        </button>
                      </form>
                    )}
                    {subtaskError && (
                      <div className={styles.inlineError} role="alert">
                        {subtaskError}
                      </div>
                    )}
                  </section>

                  {canManageTask && (
                    <section
                      className={`${styles.section} ${styles.assigneePanel} ${styles.tabPanel}`}
                      id="task-panel-assignee"
                      role="tabpanel"
                      aria-labelledby="task-tab-assignee"
                      hidden={activeTab !== "ASSIGNEE"}
                    >
                      <div className={styles.sectionTitleRow}>
                        <span className={styles.sectionLabel}>Task assignee</span>
                        <span className={styles.subtaskCount}>
                          Only eligible project or team members are shown
                        </span>
                      </div>
                      {organizationMembersError && (
                        <div className={styles.inlineError} role="alert">
                          {organizationMembersError}
                        </div>
                      )}
                      <OrganizationMemberSelector
                        organizationId={org?.id}
                        members={taskAssigneeOptions}
                        selectedIds={assignedToId ? [assignedToId] : []}
                        onChange={(ids) => handleUpdate(
                          "assigned_to",
                          ids[0] ? Number(ids[0]) : null,
                        )}
                        multiple={false}
                        label="Choose a member"
                        placeholder="Search eligible project or team members"
                        canInvite={Boolean(org?.permissions?.can_manage_members)}
                        canInviteAdmins={Boolean(org?.permissions?.can_manage_organization)}
                        disabled={Boolean(savingField)}
                      />
                    </section>
                  )}

                </main>
                <aside className={styles.sideCol} aria-label="Task discussion and attachments">
                  <section className={styles.detailPanel}>
                    <h2 className={styles.panelHeader}>
                      <span className={styles.panelHeaderIcon}><MessagesSquare size={15} /></span>
                      Discussion
                    </h2>
                    {commentsError && (
                      <div className={styles.panelMessage} role="alert">
                        {commentsError}
                      </div>
                    )}
                    <div id="task-discussion" className={styles.sideDiscussion}>
                      <Timeline
                        items={comments.map((comment) => ({
                          ...comment,
                          type: "COMMENT",
                        }))}
                        currentUserId={user?.id}
                        currentUser={user}
                        onAddComment={handleAddComment}
                        onDeleteComment={handleDeleteComment}
                        onUpdateComment={handleUpdateComment}
                        embedded
                      />
                    </div>
                  </section>

                  <section className={styles.detailPanel}>
                    <h2 className={styles.panelHeader}>
                      <span className={styles.panelHeaderIcon}><Paperclip size={15} /></span>
                      Attachments
                      <span className={styles.panelHeaderCount}>{attachments.length}</span>
                    </h2>
                    <div className={styles.sideAttachmentSection}>
                      {attachmentError && (
                        <div className={styles.panelMessage} role="alert">
                          {attachmentError}
                        </div>
                      )}
                      {attachments.length > 0 && (
                        <ul className={styles.attachmentList}>
                          {attachments.map((attachment) => {
                            const Icon = getAttachmentIcon(attachment);
                            const canDelete =
                              canEditTask ||
                              String(attachment.uploaded_by?.id) ===
                                String(user?.id);
                            return (
                              <li key={attachment.id}>
                                {attachment.previewUrl ? (
                                  <img
                                    className={styles.attachmentPreview}
                                    src={attachment.previewUrl}
                                    alt=""
                                  />
                                ) : (
                                  <span className={styles.attachmentIcon}>
                                    <Icon size={17} />
                                  </span>
                                )}
                                <div className={styles.attachmentInfo}>
                                  <strong>{attachment.filename}</strong>
                                  <small>
                                    {attachment.file_size < 1024 * 1024
                                      ? `${Math.max(1, Math.round(attachment.file_size / 1024))} KB`
                                      : `${(attachment.file_size / (1024 * 1024)).toFixed(1)} MB`}
                                    {" · uploaded by "}
                                    {getUserName(attachment.uploaded_by)}
                                  </small>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDownloadAttachment(attachment)
                                  }
                                  aria-label={`Download ${attachment.filename}`}
                                >
                                  <Download size={15} />
                                </button>
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteAttachment(attachment)
                                    }
                                    aria-label={`Delete ${attachment.filename}`}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {!attachments.length && (
                        <div className={styles.attachmentEmpty}>
                          <span><FileIcon size={20} /></span>
                          <p>No attachments yet</p>
                          <small>Files added to this task will appear here.</small>
                        </div>
                      )}
                      {canEditTask && (
                        <label className={styles.attachmentUpload}>
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip"
                            onChange={handleUploadAttachment}
                            disabled={attachmentLoading}
                          />
                          <Paperclip size={14} />
                          {attachmentLoading
                            ? `Uploading… ${uploadProgress}%`
                            : "Add attachment"}
                        </label>
                      )}
                      {attachmentLoading && (
                        <div className={styles.uploadProgress}>
                          <span style={{ width: `${uploadProgress}%` }} />
                        </div>
                      )}
                    </div>
                  </section>
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
    </OverlayDetailShell>
  );
}
