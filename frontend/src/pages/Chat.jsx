import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  FileText,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Avatar from '../components/Avatar';
import { useAuth } from '../hooks/useAuth';
import { communicationApi, organizationsApi, projectsApi, teamsApi } from '../services/api';
import { connectChatWebSocket } from '../services/websocket';
import styles from './Chat.module.css';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_FILES = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip';
const CONVERSATION_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'PROJECT', label: 'Projects' },
  { id: 'TEAM', label: 'Teams' },
];

function getRows(data) {
  const rows = data?.results ?? data;
  return Array.isArray(rows) ? rows : [];
}

function displayName(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return name || user?.email || 'Unknown member';
}

function formatMessageTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatListTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? formatMessageTime(value)
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function formatFileSize(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function conversationName(conversation, userId) {
  if (conversation.is_group && conversation.title) return conversation.title;
  const otherParticipants = (conversation.participants ?? []).filter(
    (person) => String(person.id) !== String(userId),
  );
  if (conversation.is_group) return otherParticipants.map(displayName).join(', ') || 'Group chat';
  return displayName(otherParticipants[0]);
}

function conversationSubline(conversation, userId) {
  if (conversation.is_group) return `${conversation.participants?.length ?? 0} people`;
  const other = (conversation.participants ?? []).find(
    (person) => String(person.id) !== String(userId),
  );
  return other?.email ?? 'Direct conversation';
}

function ChatAvatar({ conversation, userId, size = 42 }) {
  if (conversation.is_group) {
    return (
      <span className={styles.groupAvatar} style={{ width: size, height: size }} aria-hidden="true">
        <Users size={size * 0.43} />
      </span>
    );
  }
  const person = (conversation.participants ?? []).find(
    (member) => String(member.id) !== String(userId),
  );
  return <Avatar user={person} size={size} />;
}

function getErrorMessage(error, fallback) {
  const data = error.response?.data;
  if (typeof data?.detail === 'string') return data.detail;
  const firstError = Object.values(data ?? {}).flat().find((value) => typeof value === 'string');
  return firstError || fallback;
}

function mergeMessages(current, incoming) {
  const messagesById = new Map(
    [...current, ...incoming].map((message) => [String(message.id), message]),
  );
  return [...messagesById.values()].sort((left, right) => (
    new Date(left.created_at) - new Date(right.created_at)
    || Number(left.id) - Number(right.id)
  ));
}

export default function Chat() {
  const { user, org, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [teams, setTeams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('conversation') ?? '');
  const [conversationQuery, setConversationQuery] = useState('');
  const [conversationCategory, setConversationCategory] = useState('ALL');
  const [memberQuery, setMemberQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('ALL');
  const [newProjectId, setNewProjectId] = useState('');
  const [newTeamId, setNewTeamId] = useState('');
  const [contextMemberIds, setContextMemberIds] = useState(null);
  const [contextMembersLoading, setContextMembersLoading] = useState(false);
  const [contextMembersError, setContextMembersError] = useState('');
  const [newMemberIds, setNewMemberIds] = useState([]);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [conversationError, setConversationError] = useState('');
  const [composerError, setComposerError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const selectedIdRef = useRef(selectedId);

  const selectedConversation = conversations.find(
    (conversation) => String(conversation.id) === String(selectedId),
  );
  const activeMembers = members.filter((membership) => (
    membership.is_active
    && membership.status === 'ACTIVE'
    && String(membership.user?.id) !== String(user?.id)
  ));
  const filteredConversations = conversations.filter((conversation) => {
    const matchesCategory = conversationCategory === 'ALL'
      || (conversationCategory === 'PROJECT' && Boolean(conversation.project))
      || (conversationCategory === 'TEAM' && Boolean(conversation.team));
    const matchesSearch = conversationName(conversation, user?.id).toLowerCase().includes(conversationQuery.toLowerCase())
      || conversation.last_message?.content?.toLowerCase().includes(conversationQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });
  const filteredMembers = activeMembers.filter((membership) => (
    (contextMemberIds === null || contextMemberIds.has(membership.user?.id))
    && (
      displayName(membership.user).toLowerCase().includes(memberQuery.toLowerCase())
      || membership.user?.email?.toLowerCase().includes(memberQuery.toLowerCase())
    )
  ));
  const mentionMatches = mentionQuery === null ? [] : activeMembers
    .filter((membership) => {
      const query = mentionQuery.toLowerCase();
      return displayName(membership.user).toLowerCase().includes(query)
        || membership.user?.email?.toLowerCase().includes(query);
    })
    .slice(0, 6);

  useEffect(() => {
    if (!org?.id) return undefined;
    let active = true;
    const loadWorkspaceData = async () => {
      try {
        const [conversationResult, memberResult, projectResult, teamResult] = await Promise.allSettled([
          communicationApi.conversations(),
          organizationsApi.members(org.id),
          organizationsApi.projects(org.id),
          organizationsApi.teams(org.id),
        ]);
        if (conversationResult.status === 'rejected') throw conversationResult.reason;
        if (!active) return;
        setConversations(getRows(conversationResult.value.data));
        setMembers(memberResult.status === 'fulfilled' ? getRows(memberResult.value.data) : []);
        setProjects(projectResult.status === 'fulfilled' ? getRows(projectResult.value.data) : []);
        setTeams(teamResult.status === 'fulfilled' ? getRows(teamResult.value.data) : []);
        setError('');
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError, 'Could not load workspace messages.'));
      } finally {
        if (active) setLoadingConversations(false);
      }
    };
    loadWorkspaceData();
    return () => {
      active = false;
    };
  }, [org?.id]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!org?.id) return undefined;
    return connectWebSocket('/ws/chat/', (event) => {
      if (event.type !== 'message' || !event.message) return;
      const incoming = event.message;
      setConversations((current) => current.map((conversation) => (
        String(conversation.id) === String(incoming.conversation)
          ? {
            ...conversation,
            last_message: {
              ...incoming,
              attachment_count: incoming.attachments?.length ?? 0,
            },
            updated_at: incoming.created_at,
          }
          : conversation
      )).sort((left, right) => new Date(right.updated_at) - new Date(left.updated_at)));
      if (String(incoming.conversation) === String(selectedIdRef.current)) {
        setMessages((current) => mergeMessages(current, [incoming]));
      }
    }, {
      onOpen: () => {
        communicationApi.conversations().then(({ data }) => {
          const refreshed = getRows(data);
          setConversations((current) => {
            const currentById = new Map(current.map((conversation) => [
              String(conversation.id),
              conversation,
            ]));
            return refreshed.map((conversation) => {
              const latest = currentById.get(String(conversation.id));
              return latest && new Date(latest.updated_at) > new Date(conversation.updated_at)
                ? latest
                : conversation;
            }).sort((left, right) => new Date(right.updated_at) - new Date(left.updated_at));
          });
        }).catch((loadError) => {
          setError(getErrorMessage(loadError, 'Could not refresh workspace messages.'));
        });
        const conversationId = selectedIdRef.current;
        if (!conversationId) return;
        communicationApi.messages(conversationId).then(({ data }) => {
          if (String(conversationId) === String(selectedIdRef.current)) {
            setMessages((current) => mergeMessages(current, getRows(data)));
          }
        }).catch((loadError) => {
          setConversationError(getErrorMessage(loadError, 'Could not refresh this conversation.'));
        });
      },
    });
  }, [org?.id]);

  useEffect(() => {
    if (!newChatOpen) return undefined;
    if (newCategory === 'ALL') {
      setContextMemberIds(null);
      setContextMembersError('');
      setContextMembersLoading(false);
      return undefined;
    }
    const contextId = newCategory === 'PROJECT' ? newProjectId : newTeamId;
    if (!contextId) {
      setContextMemberIds(new Set());
      setContextMembersError('');
      setContextMembersLoading(false);
      return undefined;
    }
    let active = true;
    const loadContextMembers = async () => {
      setContextMembersLoading(true);
      setContextMembersError('');
      try {
        const responses = newCategory === 'PROJECT'
          ? await Promise.all([
            projectsApi.members(contextId),
            ...(projects.find((project) => String(project.id) === String(contextId))?.team
              ? [teamsApi.members(projects.find((project) => String(project.id) === String(contextId)).team)]
              : []),
          ])
          : [await teamsApi.members(contextId)];
        if (!active) return;
        const eligibleIds = responses.flatMap((response) => getRows(response.data))
          .map((membership) => membership.user?.id)
          .filter(Boolean);
        const adminIds = members.filter((membership) => (
          ['OWNER', 'ADMIN'].includes(membership.access_level)
        )).map((membership) => membership.user?.id).filter(Boolean);
        setContextMemberIds(new Set([...eligibleIds, ...adminIds, user?.id].filter(Boolean)));
      } catch {
        if (active) {
          setContextMemberIds(new Set());
          setContextMembersError('Could not load members for this conversation context.');
        }
      } finally {
        if (active) setContextMembersLoading(false);
      }
    };
    loadContextMembers();
    return () => { active = false; };
  }, [newChatOpen, newCategory, newProjectId, newTeamId, projects, members, user?.id]);

  useEffect(() => {
    stickToBottomRef.current = true;
    const routeConversationId = searchParams.get('conversation') ?? '';
    if (routeConversationId !== String(selectedId)) setSelectedId(routeConversationId);
  }, [searchParams, selectedId]);

  useEffect(() => {
    if (loadingConversations || !conversations.length) return;
    const selectedExists = conversations.some(
      (conversation) => String(conversation.id) === String(selectedId),
    );
    if (!selectedExists) {
      const firstConversation = conversations[0];
      setSelectedId(String(firstConversation.id));
      setSearchParams({ conversation: String(firstConversation.id) }, { replace: true });
    }
  }, [conversations, loadingConversations, selectedId, setSearchParams]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setLoadingMessages(false);
      setConversationError('');
      return undefined;
    }
    let active = true;
    setMessages([]);
    setConversationError('');
    const loadMessages = async () => {
      try {
        const response = await communicationApi.messages(selectedId);
        if (active) {
          setMessages((current) => mergeMessages(current, getRows(response.data)));
          setDownloadError('');
          setConversationError('');
        }
      } catch (loadError) {
        if (active) setConversationError(getErrorMessage(loadError, 'Could not load this conversation.'));
      } finally {
        if (active) setLoadingMessages(false);
      }
    };
    setLoadingMessages(true);
    loadMessages();

    const disconnect = connectChatWebSocket(selectedId, (data) => {
      if (active && data.message) {
        setMessages((prev) => mergeMessages(prev, [data.message]));
        stickToBottomRef.current = true;
      }
    });

    return () => {
      active = false;
      disconnect();
    };
  }, [selectedId]);

  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, selectedId]);

  const selectConversation = (conversation) => {
    const nextId = String(conversation.id);
    setMobileListOpen(false);
    setConversationError('');
    setSelectedId(nextId);
    setSearchParams({ conversation: nextId }, { replace: true });
    setError('');
  };

  const handleDraftChange = (value) => {
    setDraft(value);
    const match = value.match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(match ? match[1] : null);
  };

  const insertMention = (person) => {
    const atIndex = draft.lastIndexOf('@');
    const name = displayName(person);
    const nextDraft = `${draft.slice(0, atIndex)}@${name} `;
    setDraft(nextDraft);
    setSelectedMentions((current) => [...new Set([...current, person.id])]);
    setMentionQuery(null);
  };

  const toggleNewMember = (userId) => {
    setNewMemberIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  };

  const createConversation = async (event) => {
    event.preventDefault();
    if (!newMemberIds.length || creating) return;
    setCreating(true);
    setError('');
    try {
      const response = await communicationApi.createConversation({
        member_ids: newMemberIds,
        title: newMemberIds.length > 1 ? newGroupTitle.trim() : '',
        project_id: newCategory === 'PROJECT' ? newProjectId : null,
        team_id: newCategory === 'TEAM' ? newTeamId : null,
      });
      const conversation = response.data;
      setConversations((current) => [
        conversation,
        ...current.filter((item) => String(item.id) !== String(conversation.id)),
      ]);
      setSelectedId(String(conversation.id));
      setSearchParams({ conversation: String(conversation.id) }, { replace: true });
      setNewChatOpen(false);
      setNewMemberIds([]);
      setNewGroupTitle('');
      setMemberQuery('');
      setNewCategory('ALL');
      setNewProjectId('');
      setNewTeamId('');
    } catch (createError) {
      setError(getErrorMessage(createError, 'Could not start this conversation.'));
    } finally {
      setCreating(false);
    }
  };

  const addFiles = (event) => {
    const incoming = Array.from(event.target.files ?? []);
    const tooLarge = incoming.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge) {
      setComposerError(`${tooLarge.name} is larger than 20 MB.`);
      event.target.value = '';
      return;
    }
    setSelectedFiles((current) => [...current, ...incoming].slice(0, 10));
    setComposerError('');
    event.target.value = '';
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!selectedId || sending || (!draft.trim() && !selectedFiles.length)) return;
    const payload = new FormData();
    payload.append('content', draft.trim());
    const validMentions = selectedMentions.filter((memberId) => {
      const person = activeMembers.find((membership) => String(membership.user.id) === String(memberId))?.user;
      return person && draft.includes(`@${displayName(person)}`);
    });
    validMentions.forEach((memberId) => payload.append('mentions', String(memberId)));
    selectedFiles.forEach((file) => payload.append('files', file));
    setSending(true);
    setComposerError('');
    try {
      const response = await communicationApi.sendMessage(selectedId, payload);
      setMessages((current) => mergeMessages(current, [response.data]));
      setConversations((current) => current.map((conversation) => (
        String(conversation.id) === String(selectedId)
          ? {
            ...conversation,
            last_message: {
              ...response.data,
              attachment_count: response.data.attachments?.length ?? 0,
            },
            updated_at: response.data.created_at,
          }
          : conversation
      )).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
      setDraft('');
      setSelectedFiles([]);
      setSelectedMentions([]);
      setMentionQuery(null);
    } catch (sendError) {
      setComposerError(getErrorMessage(sendError, 'Your message could not be sent.'));
    } finally {
      setSending(false);
    }
  };

  const downloadAttachment = async (attachment) => {
    setDownloadError('');
    try {
      const response = await communicationApi.downloadChatAttachment(selectedId, attachment.id);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(`Could not download ${attachment.filename}.`);
    }
  };

  const openNewChat = () => {
    setNewChatOpen(true);
    setNewMemberIds([]);
    setMemberQuery('');
    setNewCategory('ALL');
    setNewProjectId('');
    setNewTeamId('');
    setContextMembersError('');
    setError('');
  };

  const emptyListTitle = conversationQuery
    ? 'No matching chats'
    : {
      ALL: 'No conversations yet',
      PROJECT: 'No project chats',
      TEAM: 'No team chats',
    }[conversationCategory];
  const emptyListDescription = conversationQuery
    ? 'Try another name or message.'
    : conversationCategory === 'ALL'
      ? 'Start a chat with someone in your workspace.'
      : 'Conversations in this category will appear here.';

  if (authLoading) return null;
  if (user && !org) return <Navigate to="/onboarding" replace />;

  return (
    <AppShell org={org} user={user}>
      <section className={styles.page}>
        {error && <div className={styles.pageError} role="alert">{error}</div>}

        <div className={`${styles.workspace} ${selectedConversation ? styles.hasConversation : ''} ${mobileListOpen ? styles.mobileListOpen : ''}`}>
          <aside className={styles.conversationRail} aria-label="Conversations">
            <div className={styles.railHeading}>
              <div>
                <h2>Chats</h2>
                <span>{conversations.length} conversations</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={openNewChat} aria-label="Start a new chat" title="Start a new chat">
                <Plus size={17} />
              </button>
            </div>
            <label className={styles.searchBox}>
              <Search size={16} aria-hidden="true" />
              <input
                value={conversationQuery}
                onChange={(event) => setConversationQuery(event.target.value)}
                placeholder="Search conversations"
                aria-label="Search conversations"
              />
              {conversationQuery && <button type="button" onClick={() => setConversationQuery('')} aria-label="Clear conversation search"><X size={14} /></button>}
            </label>
            <div className={styles.categoryTabs} role="tablist" aria-label="Conversation categories">
              {CONVERSATION_FILTERS.map((filter) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={conversationCategory === filter.id}
                  key={filter.id}
                  className={conversationCategory === filter.id ? styles.categoryActive : ''}
                  onClick={() => setConversationCategory(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className={styles.conversationList}>
              {loadingConversations && <p className={styles.railMessage}>Loading conversations…</p>}
              {!loadingConversations && filteredConversations.map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  className={`${styles.conversationItem} ${String(conversation.id) === String(selectedId) ? styles.conversationActive : ''}`}
                  onClick={() => selectConversation(conversation)}
                >
                  <ChatAvatar conversation={conversation} userId={user?.id} size={42} />
                  <span className={styles.conversationCopy}>
                    <span className={styles.conversationTopline}>
                      <strong>{conversationName(conversation, user?.id)}</strong>
                      <time>{formatListTime(conversation.last_message?.created_at ?? conversation.updated_at)}</time>
                    </span>
                    <span className={styles.conversationPreview}>
                      {(conversation.project_name || conversation.team_name)
                        ? `${conversation.project_name ? 'Project' : 'Team'} · ${conversation.project_name || conversation.team_name} · `
                        : ''}
                      {conversation.last_message?.content || (conversation.last_message?.attachment_count ? 'Attachment' : 'Start the conversation')}
                    </span>
                  </span>
                  {conversation.unread_count > 0 && <span className={styles.unreadBadge}>{conversation.unread_count}</span>}
                </button>
              ))}
              {!loadingConversations && !filteredConversations.length && (
                <div className={styles.emptyRail}>
                  <MessageCircle size={21} />
                  <strong>{emptyListTitle}</strong>
                  <span>{emptyListDescription}</span>
                  {!conversationQuery && <button type="button" onClick={openNewChat}>Start a chat</button>}
                </div>
              )}
            </div>
          </aside>

          <section className={styles.conversationPane} aria-label={selectedConversation ? conversationName(selectedConversation, user?.id) : 'Chat'}>
            {selectedConversation ? (
              <>
                <header className={styles.chatHeader}>
                  <button type="button" className={styles.mobileBack} onClick={() => setMobileListOpen(true)} aria-label="Back to conversations">
                    <ArrowLeft size={18} />
                  </button>
                  <ChatAvatar conversation={selectedConversation} userId={user?.id} size={40} />
                  <div className={styles.chatIdentity}>
                    <h2>{conversationName(selectedConversation, user?.id)}</h2>
                    <span>{conversationSubline(selectedConversation, user?.id)}</span>
                  </div>
                  {selectedConversation.project_name && <span className={styles.contextTag}>Project · {selectedConversation.project_name}</span>}
                  {selectedConversation.team_name && <span className={styles.contextTag}>Team · {selectedConversation.team_name}</span>}
                  {selectedConversation.is_group && <span className={styles.groupTag}><Users size={13} /> Group</span>}
                </header>

                {conversationError && <p className={styles.conversationError} data-inline-alert role="alert">{conversationError}</p>}
                <div
                  className={styles.messageFeed}
                  aria-live="polite"
                  aria-label="Messages"
                  onScroll={(event) => {
                    const feed = event.currentTarget;
                    stickToBottomRef.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
                  }}
                >
                  {loadingMessages && !messages.length && <p className={styles.feedMessage}>Loading messages…</p>}
                  {!loadingMessages && !messages.length && (
                    <div className={styles.emptyChat}>
                      <span className={styles.emptyChatIcon}><MessageCircle size={24} /></span>
                      <strong>Start the conversation</strong>
                      <span>Send a message, share a file, or mention a teammate.</span>
                    </div>
                  )}
                  {messages.map((message) => {
                    const isMine = String(message.sender?.id) === String(user?.id);
                    return (
                      <article key={message.id} className={`${styles.messageRow} ${isMine ? styles.messageMine : ''}`}>
                        {!isMine && <Avatar user={message.sender} size={28} />}
                        <div className={styles.messageBody}>
                          {!isMine && <span className={styles.senderName}>{displayName(message.sender)}</span>}
                          <div className={styles.messageBubble}>
                            {message.content && <p>{message.content}</p>}
                            {!!message.attachments?.length && (
                              <div className={styles.attachmentList}>
                                {message.attachments.map((attachment) => (
                                  <button
                                    type="button"
                                    key={attachment.id}
                                    className={styles.attachmentItem}
                                    onClick={() => downloadAttachment(attachment)}
                                    title={`Download ${attachment.filename}`}
                                  >
                                    <FileText size={17} />
                                    <span><strong>{attachment.filename}</strong><small>{formatFileSize(attachment.file_size)}</small></span>
                                    <Download size={15} />
                                  </button>
                                ))}
                              </div>
                            )}
                            <time>{formatMessageTime(message.created_at)}</time>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {downloadError && <p className={styles.downloadError} data-inline-alert role="alert">{downloadError}</p>}
                <form className={styles.composer} onSubmit={sendMessage}>
                  {mentionQuery !== null && mentionMatches.length > 0 && (
                    <div className={styles.mentionMenu} role="listbox" aria-label="Mention a teammate">
                      {mentionMatches.map((membership) => (
                        <button type="button" key={membership.user.id} onClick={() => insertMention(membership.user)}>
                          <Avatar user={membership.user} size={27} />
                          <span><strong>{displayName(membership.user)}</strong><small>{membership.user.email}</small></span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedFiles.length > 0 && (
                    <div className={styles.fileQueue} aria-label="Attachments to send">
                      {selectedFiles.map((file, index) => (
                        <span className={styles.fileChip} key={`${file.name}-${file.lastModified}-${index}`}>
                          <FileText size={14} /> {file.name}
                          <button type="button" onClick={() => setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`}><X size={13} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className={styles.composerRow}>
                    <button type="button" className={styles.attachButton} onClick={() => fileInputRef.current?.click()} aria-label="Attach files" title="Attach files">
                      <Paperclip size={19} />
                    </button>
                    <input ref={fileInputRef} className={styles.fileInput} type="file" accept={ACCEPTED_FILES} multiple onChange={addFiles} />
                    <textarea
                      value={draft}
                      onChange={(event) => handleDraftChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          sendMessage(event);
                        }
                      }}
                      placeholder="Write a message… Use @ to mention someone"
                      aria-label="Write a message"
                      rows={1}
                    />
                    <button type="submit" className={styles.sendButton} disabled={sending || (!draft.trim() && !selectedFiles.length)} aria-label="Send message" title="Send message">
                      <Send size={17} />
                    </button>
                  </div>
                  <div className={styles.composerFooter}>
                    <span>Enter to send · Shift + Enter for a new line</span>
                    {composerError && <span className={styles.composerError} role="alert">{composerError}</span>}
                  </div>
                </form>
              </>
            ) : (
              <div className={styles.noConversation}>
                <span><MessageCircle size={28} /></span>
                <h2>Your conversations</h2>
                <p>Choose a chat or start a new one with your workspace.</p>
                <button type="button" className={styles.newChatButton} onClick={openNewChat}><Plus size={16} /> New chat</button>
              </div>
            )}
          </section>
        </div>
      </section>

      {newChatOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setNewChatOpen(false);
        }}>
          <form className={styles.newChatDialog} role="dialog" aria-modal="true" aria-labelledby="new-chat-title" onSubmit={createConversation}>
            <header>
              <div><span className={styles.eyebrow}>Workspace members</span><h2 id="new-chat-title">New conversation</h2></div>
              <button type="button" className={styles.iconButton} onClick={() => setNewChatOpen(false)} aria-label="Close new conversation"><X size={17} /></button>
            </header>
            <label className={styles.groupTitleField}>
              Category
              <select
                value={newCategory}
                onChange={(event) => {
                  setNewCategory(event.target.value);
                  setNewMemberIds([]);
                  setNewProjectId('');
                  setNewTeamId('');
                }}
              >
                <option value="ALL">All conversations</option>
                <option value="PROJECT">Project</option>
                <option value="TEAM">Team</option>
              </select>
            </label>
            {newCategory === 'PROJECT' && (
              <label className={styles.groupTitleField}>
                Project
                <select value={newProjectId} onChange={(event) => { setNewProjectId(event.target.value); setNewMemberIds([]); }} required>
                  <option value="">Choose a project</option>
                  {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
                </select>
              </label>
            )}
            {newCategory === 'TEAM' && (
              <label className={styles.groupTitleField}>
                Team
                <select value={newTeamId} onChange={(event) => { setNewTeamId(event.target.value); setNewMemberIds([]); }} required>
                  <option value="">Choose a team</option>
                  {teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}
                </select>
              </label>
            )}
            <label className={styles.searchBox}>
              <Search size={16} aria-hidden="true" />
              <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Find people" aria-label="Find workspace members" autoFocus />
            </label>
            {newMemberIds.length > 1 && (
              <label className={styles.groupTitleField}>
                Group name <span>Optional</span>
                <input value={newGroupTitle} onChange={(event) => setNewGroupTitle(event.target.value)} maxLength={120} placeholder="e.g. Product team" />
              </label>
            )}
            <div className={styles.memberPicker}>
              {contextMembersLoading && <p className={styles.railMessage}>Loading eligible members…</p>}
              {contextMembersError && <p className={styles.memberContextError}>{contextMembersError}</p>}
              {filteredMembers.map((membership) => {
                const checked = newMemberIds.includes(membership.user.id);
                return (
                  <button type="button" key={membership.user.id} className={styles.memberOption} aria-pressed={checked} onClick={() => toggleNewMember(membership.user.id)}>
                    <Avatar user={membership.user} size={34} />
                    <span><strong>{displayName(membership.user)}</strong><small>{membership.user.email}</small></span>
                    <span className={styles.memberCheck}>{checked ? 'Selected' : 'Add'}</span>
                  </button>
                );
              })}
              {!contextMembersLoading && !contextMembersError && !filteredMembers.length && (
                <p className={styles.railMessage}>
                  {newCategory === 'ALL' ? 'No workspace members match that search.' : 'Choose a context or search its members.'}
                </p>
              )}
            </div>
            <footer>
              <span>{newMemberIds.length ? `${newMemberIds.length} selected` : 'Select one or more people'}</span>
              <button
                type="submit"
                className={styles.newChatButton}
                disabled={
                  !newMemberIds.length || creating || contextMembersLoading || Boolean(contextMembersError)
                  || (newCategory === 'PROJECT' && !newProjectId)
                  || (newCategory === 'TEAM' && !newTeamId)
                }
              >
                {creating ? 'Starting…' : 'Start chat'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </AppShell>
  );
}
