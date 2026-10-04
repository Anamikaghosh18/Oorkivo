/**
 * useProjects — fetches projects for the user's first organization.
 *
 * Endpoint: GET /api/organizations/{org_id}/projects/
 * Filtering is done client-side until a backend filter endpoint is available.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { authApi, organizationsApi, projectsApi } from '../services/api';
import { selectCurrentOrganization } from '../utils/organizationContext';

function getRows(data) {
  const rows = data?.results ?? data;
  return Array.isArray(rows) ? rows : [];
}

export function useProjects() {
  const [projects, setProjects]   = useState([]);
  const [teams, setTeams]         = useState([]);
  const [teamsError, setTeamsError] = useState('');
  const [org,      setOrg]        = useState(null);
  const [user,     setUser]       = useState(null);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState(null);
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestLoad.current;
    const isCurrent = () => latestLoad.current === requestId;
    setLoading(true);
    setError(null);
    setTeamsError('');
    try {
      const meRes = await authApi.me();
      if (!isCurrent()) return;
      setUser(meRes.data);
      const firstOrg = selectCurrentOrganization(meRes.data);
      setOrg(firstOrg);

      if (firstOrg) {
        const [projectResult, teamResult] = await Promise.allSettled([
          organizationsApi.projects(firstOrg.id),
          organizationsApi.teams(firstOrg.id),
        ]);
        if (!isCurrent()) return;
        if (projectResult.status === 'rejected') throw projectResult.reason;
        const rawProjects = getRows(projectResult.value.data);
        if (teamResult.status === 'fulfilled') {
          setTeams(getRows(teamResult.value.data));
        } else {
          setTeams([]);
          setTeamsError('Team filters and team names are unavailable.');
        }

        const enriched = await Promise.all(rawProjects.map(async (project) => {
          const [membersResult, tasksResult] = await Promise.allSettled([
            projectsApi.members(project.id),
            projectsApi.tasks(project.id),
          ]);
          return {
            ...project,
            members: membersResult.status === 'fulfilled'
              ? getRows(membersResult.value.data)
              : null,
            tasks: tasksResult.status === 'fulfilled'
              ? getRows(tasksResult.value.data)
              : null,
            membersError: membersResult.status === 'rejected',
            tasksError: tasksResult.status === 'rejected',
          };
        }));
        if (!isCurrent()) return;
        setProjects(enriched);
      } else {
        setProjects([]);
        setTeams([]);
      }
    } catch (err) {
      if (!isCurrent()) return;
      const status = err.response?.status;
      if (status === 401) setError('Session expired. Please log in.');
      else if (status === 403) setError('Access denied.');
      else setError('Failed to load projects. Please try again.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => { latestLoad.current += 1; };
  }, [load]);

  const createProject = useCallback(async (data) => {
    const res = await projectsApi.create({ ...data, organization: org?.id });
    await load();
    return res.data;
  }, [org, load]);

  const updateProject = useCallback(async (id, data) => {
    const res = await projectsApi.update(id, data);
    setProjects((prev) => prev.map((p) => String(p.id) === String(id) ? { ...p, ...res.data } : p));
    return res.data;
  }, []);

  const deleteProject = useCallback(async (id) => {
    await projectsApi.delete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { projects, teams, teamsError, org, user, loading, error, reload: load, createProject, updateProject, deleteProject };
}
