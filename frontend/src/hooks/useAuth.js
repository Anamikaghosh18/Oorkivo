/**
 * useAuth — reads current user + first org from the backend.
 * Stores JWT tokens in localStorage.
 *
 * Usage:
 *   const { user, org, loading, error, login, logout } = useAuth();
 */
import { useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/api';
import { selectCurrentOrganization } from '../utils/organizationContext';

export function useAuth() {
  const [user, setUser]       = useState(null);
  const [org,  setOrg]        = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const loadUserAndOrg = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) { setLoading(false); return; }

    setLoading(true);
    setError(null);
    try {
      const meRes = await authApi.me();
      setUser(meRes.data);
      setOrg(selectCurrentOrganization(meRes.data));
    } catch (err) {
      if (err.response?.status !== 401) {
        setError('Failed to load user data.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUserAndOrg(); }, [loadUserAndOrg]);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    localStorage.setItem('access_token',  res.data.access);
    localStorage.setItem('refresh_token', res.data.refresh);
    await loadUserAndOrg();
    return res.data;
  }, [loadUserAndOrg]);

  const register = useCallback(async (data) => {
    await authApi.register(data);
    return login(data.email, data.password);
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('current_organization_id');
    setUser(null);
    setOrg(null);
  }, []);

  return { user, org, loading, error, login, register, logout, reload: loadUserAndOrg };
}
