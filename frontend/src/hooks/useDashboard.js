import { useState, useEffect } from 'react';
import {
  mockMetrics,
  mockProjects,
  mockActivity,
  mockUser,
  mockOrganization,
} from '../services/mockData';

// When backend endpoints are ready:
// import { organizationsApi } from '../services/api';
// and replace mock calls with real ones.

export function useDashboard() {
  const [metrics, setMetrics]     = useState(null);
  const [projects, setProjects]   = useState([]);
  const [activity, setActivity]   = useState([]);
  const [user, setUser]           = useState(null);
  const [org, setOrg]             = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        // --- Swap these for real API calls when ready ---
        await new Promise((r) => setTimeout(r, 600)); // simulate latency
        if (cancelled) return;
        setMetrics(mockMetrics);
        setProjects(mockProjects);
        setActivity(mockActivity);
        setUser(mockUser);
        setOrg(mockOrganization);
        // ------------------------------------------------
      } catch (err) {
        if (!cancelled) setError('Failed to load dashboard data. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, []);

  return { metrics, projects, activity, user, org, loading, error };
}
