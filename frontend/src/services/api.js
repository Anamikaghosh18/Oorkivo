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
  return config;
});

// Handle 401 → clear tokens (redirect handled by auth context when implemented)
apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, { refresh });
          localStorage.setItem('access_token', data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return apiClient(original);
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }
    }
    return Promise.reject(err);
  }
);

export default apiClient;

// ─── Auth ────────────────────────────────────────────────────────
export const authApi = {
  login:   (data)  => apiClient.post('/auth/login/', data),
  register:(data)  => apiClient.post('/auth/register/', data),
  refresh: (token) => apiClient.post('/auth/token/refresh/', { refresh: token }),
  me:      ()      => apiClient.get('/auth/me/'),
};

// ─── Organizations ────────────────────────────────────────────────
export const organizationsApi = {
  list:     ()   => apiClient.get('/organizations/'),
  get:      (id) => apiClient.get(`/organizations/${id}/`),
  members:  (id) => apiClient.get(`/organizations/${id}/members/`),
  teams:    (id) => apiClient.get(`/organizations/${id}/teams/`),
  createTeam: (id, data) => apiClient.post(`/organizations/${id}/teams/`, data),
  projects: (id) => apiClient.get(`/organizations/${id}/projects/`),
};

// ─── Teams ──────────────────────────────────────────────────────
export const teamsApi = {
  members: (id) => apiClient.get(`/teams/${id}/members/`),
};

// ─── Projects ─────────────────────────────────────────────────────
export const projectsApi = {
  list:    ()           => apiClient.get('/projects/'),
  get:     (id)         => apiClient.get(`/projects/${id}/`),
  create:  (data)       => apiClient.post('/projects/', data),
  update:  (id, data)   => apiClient.patch(`/projects/${id}/`, data),
  delete:  (id)         => apiClient.delete(`/projects/${id}/`),
  members: (id)         => apiClient.get(`/projects/${id}/members/`),
  tasks:   (id, params) => apiClient.get(`/projects/${id}/tasks/`, { params }),
};

// ─── Tasks ────────────────────────────────────────────────────────
export const tasksApi = {
  list:       (projectId, params) => apiClient.get(`/projects/${projectId}/tasks/`, { params }),
  get:        (id)                => apiClient.get(`/tasks/${id}/`),
  create:     (projectId, data)   => apiClient.post(`/projects/${projectId}/tasks/`, data),
  update:     (id, data)          => apiClient.patch(`/tasks/${id}/`, data),
  delete:     (id)                => apiClient.delete(`/tasks/${id}/`),
  comments:   (id)                => apiClient.get(`/tasks/${id}/comments/`),
  addComment: (id, data)          => apiClient.post(`/tasks/${id}/comments/`, data),
};

// ─── Communication ────────────────────────────────────────────────
export const communicationApi = {
  deleteComment:     (id)       => apiClient.delete(`/comments/${id}/`),
  updateComment:     (id, data) => apiClient.patch(`/comments/${id}/`, data),
  notifications:     ()         => apiClient.get('/notifications/'),
  readNotification:  (id)       => apiClient.patch(`/notifications/${id}/read/`),
  readAllNotifications: ()      => apiClient.patch('/notifications/read-all/'),
};
