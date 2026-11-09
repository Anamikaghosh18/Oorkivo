import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

// ─── Axios client ────────────────────────────────────────────────
const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT access token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const organizationId = localStorage.getItem('current_organization_id');
  const isAuthenticationRequest = config.url?.startsWith('/auth/');
  if (organizationId && !isAuthenticationRequest) {
    config.headers['X-Organization-ID'] = organizationId;
  }
  return config;
});

// Handle 401 → clear tokens (redirect handled by auth context when implemented)
let refreshRequest;

apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && original && !original._retry
      && !['/auth/login/', '/auth/register/'].includes(original.url)) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          refreshRequest ??= axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh })
            .finally(() => { refreshRequest = null; });
          const { data } = await refreshRequest;
          localStorage.setItem('access_token', data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return apiClient(original);
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.dispatchEvent(new Event('oorkivo:session-expired'));
        }
      }
    }
    return Promise.reject(err);
  }
);

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url;
    const isCredentialSubmission = ['/auth/login/', '/auth/register/'].includes(url);
    if (err.response?.status === 401 && err.config && !isCredentialSubmission) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.dispatchEvent(new Event('oorkivo:session-expired'));
    }
    return Promise.reject(err);
  },
);

export default apiClient;

// ─── Auth ────────────────────────────────────────────────────────
export const authApi = {
  login:   (data)  => apiClient.post('/auth/login/', data),
  register:(data)  => apiClient.post('/auth/register/', data),
  refresh: (token) => apiClient.post('/auth/token/refresh/', { refresh: token }),
  me:      ()      => apiClient.get('/auth/me/'),
  updateProfile: (data) => apiClient.patch('/auth/me/', data),
  uploadAvatar: (formData) => apiClient.post('/auth/me/avatar/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  removeAvatar: () => apiClient.delete('/auth/me/avatar/'),
  preferences: () => apiClient.get('/auth/me/preferences/'),
  updatePreferences: (data) => apiClient.patch('/auth/me/preferences/', data),
  acceptInvitation: (token) => apiClient.post('/auth/invitations/accept/', { token }),
  acceptInvitationCode: (code) => apiClient.post('/auth/invitations/accept/', { code }),
};

// ─── Organizations ────────────────────────────────────────────────
export const organizationsApi = {
  list:     ()   => apiClient.get('/organizations/'),
  get:      (id) => apiClient.get(`/organizations/${id}/`),
  members:  (id) => apiClient.get(`/organizations/${id}/members/`),
  updateMember: (organizationId, membershipId, data) => apiClient.patch(`/organizations/${organizationId}/members/${membershipId}/`, data),
  removeMember: (organizationId, membershipId) => apiClient.delete(`/organizations/${organizationId}/members/${membershipId}/`),
  update:   (id, data) => apiClient.patch(`/organizations/${id}/`, data, data instanceof FormData
    ? { headers: { 'Content-Type': 'multipart/form-data' } }
    : undefined),
  create:   (data) => apiClient.post('/organizations/', data),
  permissions: (id) => apiClient.get(`/organizations/${id}/settings-permissions/`),
  invitations: (id) => apiClient.get(`/organizations/${id}/invitations/`),
  invite: (id, data) => apiClient.post(`/organizations/${id}/invitations/`, data),
  teams:    (id) => apiClient.get(`/organizations/${id}/teams/`),
  createTeam: (id, data) => apiClient.post(`/organizations/${id}/teams/`, data),
  projects: (id) => apiClient.get(`/organizations/${id}/projects/`),
  activity: (id) => apiClient.get(`/organizations/${id}/activity/`),
};

// ─── Teams ──────────────────────────────────────────────────────
export const teamsApi = {
  get: (id) => apiClient.get(`/teams/${id}/`),
  update: (id, data) => apiClient.patch(`/teams/${id}/`, data),
  archive: (id) => apiClient.delete(`/teams/${id}/`),
  restore: (id) => apiClient.post(`/teams/${id}/restore/`),
  members: (id) => apiClient.get(`/teams/${id}/members/`),
  addMember: (id, data) => apiClient.post(`/teams/${id}/members/`, data),
  updateMember: (id, memberId, data) => apiClient.patch(`/teams/${id}/members/${memberId}/`, data),
  removeMember: (id, memberId) => apiClient.delete(`/teams/${id}/members/${memberId}/`),
};

// ─── Projects ─────────────────────────────────────────────────────
export const projectsApi = {
  list:    ()           => apiClient.get('/projects/'),
  get:     (id)         => apiClient.get(`/projects/${id}/`),
  create:  (data)       => apiClient.post('/projects/', data),
  update:  (id, data)   => apiClient.patch(`/projects/${id}/`, data),
  delete:  (id)         => apiClient.delete(`/projects/${id}/`),
  restore: (id)         => apiClient.post(`/projects/${id}/restore/`),
  members: (id)         => apiClient.get(`/projects/${id}/members/`),
  addMember: (id, data) => apiClient.post(`/projects/${id}/members/`, data),
  removeMember: (id, memberId) => apiClient.delete(`/projects/${id}/members/${memberId}/`),
  tasks:   (id, params) => apiClient.get(`/projects/${id}/tasks/`, { params }),
  milestones: (id)      => apiClient.get(`/projects/${id}/milestones/`),
  createMilestone: (id, data) => apiClient.post(`/projects/${id}/milestones/`, data),
  updateMilestone: (id, milestoneId, data) => apiClient.patch(`/projects/${id}/milestones/${milestoneId}/`, data),
  deleteMilestone: (id, milestoneId) => apiClient.delete(`/projects/${id}/milestones/${milestoneId}/`),
  activity: (id)        => apiClient.get(`/projects/${id}/activity/`),
  sprints: (id)          => apiClient.get(`/projects/${id}/sprints/`),
  createSprint: (id, data) => apiClient.post(`/projects/${id}/sprints/`, data),
  getSprint: (id, sprintId) => apiClient.get(`/projects/${id}/sprints/${sprintId}/`),
  updateSprint: (id, sprintId, data) => apiClient.patch(`/projects/${id}/sprints/${sprintId}/`, data),
  deleteSprint: (id, sprintId) => apiClient.delete(`/projects/${id}/sprints/${sprintId}/`),
  startSprint: (id, sprintId) => apiClient.post(`/projects/${id}/sprints/${sprintId}/start/`),
  completeSprint: (id, sprintId) => apiClient.post(`/projects/${id}/sprints/${sprintId}/complete/`),
};

// ─── Tasks ────────────────────────────────────────────────────────
export const tasksApi = {
  list:       (projectId, params) => apiClient.get(`/projects/${projectId}/tasks/`, { params }),
  get:        (id)                => apiClient.get(`/tasks/${id}/`),
  create:     (projectId, data)   => apiClient.post(`/projects/${projectId}/tasks/`, data),
  update:     (id, data)          => apiClient.patch(`/tasks/${id}/`, data),
  delete:     (id)                => apiClient.delete(`/tasks/${id}/`),
  restore:    (id)                => apiClient.post(`/tasks/${id}/restore/`),
  comments:   (id)                => apiClient.get(`/tasks/${id}/comments/`),
  addComment: (id, data)          => apiClient.post(`/tasks/${id}/comments/`, data, data instanceof FormData
    ? { headers: { 'Content-Type': 'multipart/form-data' } }
    : undefined),
  activity:   (id)                => apiClient.get(`/tasks/${id}/activity/`),
  subtasks:   (id)                => apiClient.get(`/tasks/${id}/subtasks/`),
  addSubtask: (id, data)          => apiClient.post(`/tasks/${id}/subtasks/`, data),
  attachments: (id)               => apiClient.get(`/tasks/${id}/attachments/`),
  uploadAttachment: (id, formData, onUploadProgress) => apiClient.post(`/tasks/${id}/attachments/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  }),
  downloadAttachment: (taskId, attachmentId) => apiClient.get(`/tasks/${taskId}/attachments/${attachmentId}/`, { responseType: 'blob' }),
  deleteAttachment: (taskId, attachmentId) => apiClient.delete(`/tasks/${taskId}/attachments/${attachmentId}/`),
  savedViews: () => apiClient.get('/saved-views/'),
  createSavedView: (data) => apiClient.post('/saved-views/', data),
  updateSavedView: (id, data) => apiClient.patch(`/saved-views/${id}/`, data),
  deleteSavedView: (id) => apiClient.delete(`/saved-views/${id}/`),
};

// ─── Communication ────────────────────────────────────────────────
export const communicationApi = {
  downloadCommentAttachment: (id) => apiClient.get(`/comment-attachments/${id}/`, { responseType: 'blob' }),
  conversations:     ()         => apiClient.get('/conversations/'),
  createConversation:(data)     => apiClient.post('/conversations/', data),
  messages:          (id)       => apiClient.get(`/conversations/${id}/messages/`),
  sendMessage:       (id, data) => apiClient.post(`/conversations/${id}/messages/`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  downloadChatAttachment: (conversationId, attachmentId) => apiClient.get(
    `/conversations/${conversationId}/attachments/${attachmentId}/`,
    { responseType: 'blob' },
  ),
  deleteComment:     (id)       => apiClient.delete(`/comments/${id}/`),
  updateComment:     (id, data) => apiClient.patch(`/comments/${id}/`, data),
  notifications:     ()         => apiClient.get('/notifications/'),
  readNotification:  (id)       => apiClient.patch(`/notifications/${id}/read/`),
  readAllNotifications: ()      => apiClient.patch('/notifications/read-all/'),
};

export const progressApi = {
  mine: () => apiClient.get('/progress/me/'),
  members: () => apiClient.get('/progress/members/'),
  overview: (params) => apiClient.get('/progress/overview/', { params }),
  celebrations: () => apiClient.get('/progress/celebrations/'),
  recognitions: () => apiClient.get('/progress/recognitions/'),
  recognize: (data) => apiClient.post('/progress/recognitions/', data),
};
