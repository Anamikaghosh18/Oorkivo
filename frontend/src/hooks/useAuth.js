/**
 * useAuth — reads current user + first org from the backend.
 * Stores JWT tokens in localStorage.
 *
 * Usage:
 *   const { user, org, loading, error, login, logout } = useAuth();
 */
import { useState, useEffect, useCallback } from 'react';
import { authApi, organizationsApi } from '../services/api';

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
      const [meRes, orgsRes] = await Promise.all([
        authApi.me(),
        organizationsApi.list(),
      ]);
      setUser(meRes.data);
      // Use first organization the user belongs to
      const orgs = orgsRes.data?.results ?? orgsRes.data;
      setOrg(Array.isArray(orgs) && orgs.length > 0 ? orgs[0] : null);
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
    setUser(null);
    setOrg(null);
  }, []);

  return { user, org, loading, error, login, register, logout };
}
