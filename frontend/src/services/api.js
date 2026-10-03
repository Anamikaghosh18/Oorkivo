import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every outgoing request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      // Redirect to login when auth module is ready
    }
    return Promise.reject(err);
  }
);

export default apiClient;

// ─── API Service functions ──────────────────────────────────────

export const organizationsApi = {
  list: () => apiClient.get('/organizations/'),
  get: (id) => apiClient.get(`/organizations/${id}/`),
  members: (id) => apiClient.get(`/organizations/${id}/members/`),
  teams: (id) => apiClient.get(`/organizations/${id}/teams/`),
  projects: (id) => apiClient.get(`/organizations/${id}/projects/`),
};

export const tasksApi = {
  get: (id) => apiClient.get(`/tasks/${id}/`),
  update: (id, data) => apiClient.patch(`/tasks/${id}/`, data),
  comments: (id) => apiClient.get(`/tasks/${id}/comments/`),
  addComment: (id, data) => apiClient.post(`/tasks/${id}/comments/`, data),
};

export const communicationApi = {
  deleteComment: (id) => apiClient.delete(`/comments/${id}/`),
  updateComment: (id, data) => apiClient.patch(`/comments/${id}/`, data),
  notifications: () => apiClient.get(`/notifications/`),
  readNotification: (id) => apiClient.patch(`/notifications/${id}/read/`),
};
