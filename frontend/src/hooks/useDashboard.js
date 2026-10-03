/**
 * Loads the current user's organization overview from the existing API.
 * Task-derived figures are available only when every visible project's task
 * list loads successfully; partial results are not presented as totals.
 */
import { useState, useEffect } from 'react';
import { authApi, communicationApi, organizationsApi, tasksApi } from '../services/api';

function getRows(data) {
  const rows = data?.results ?? data;
  return Array.isArray(rows) ? rows : [];
}

export function useDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [taskDataError, setTaskDataError] = useState(null);
  const [activityError, setActivityError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchOverview() {
      setLoading(true);
      setError(null);
      setTaskDataError(null);
      setActivityError(null);

      try {
        const [meResponse, organizationsResponse] = await Promise.all([
          authApi.me(),
          organizationsApi.list(),
        ]);
        if (cancelled) return;
        setUser(meResponse.data);

        const organizations = getRows(organizationsResponse.data);
        const firstOrg = organizations[0] ?? null;
        setOrg(firstOrg);

        if (!firstOrg) {
          setProjects([]);
          setTasks([]);
          setActivity([]);
          setMetrics({ teams: 0, projects: 0, members: 0 });
          return;
        }

        const [projectsResult, membersResult, teamsResult, activityResult] = await Promise.allSettled([
          organizationsApi.projects(firstOrg.id),
          organizationsApi.members(firstOrg.id),
          organizationsApi.teams(firstOrg.id),
          communicationApi.notifications(),
        ]);
        if (cancelled) return;

        if (projectsResult.status === 'rejected') throw projectsResult.reason;
        const rawProjects = getRows(projectsResult.value.data);
        const rawMembers = membersResult.status === 'fulfilled'
          ? getRows(membersResult.value.data)
          : null;
        const rawTeams = teamsResult.status === 'fulfilled'
          ? getRows(teamsResult.value.data)
          : null;
        const teamNames = new Map((rawTeams ?? []).map((team) => [String(team.id), team.name]));
        setProjects(rawProjects.map((project) => ({
          ...project,
          team_name: project.team?.name ?? teamNames.get(String(project.team)) ?? '',
        })));
        setMetrics({
          teams: rawTeams?.length ?? null,
          projects: rawProjects.length,
          members: rawMembers?.length ?? null,
        });

        if (membersResult.status === 'rejected' || teamsResult.status === 'rejected') {
          setError('Some organization summary data could not be loaded.');
        }

        if (activityResult.status === 'fulfilled') {
          setActivity(getRows(activityResult.value.data));
        } else {
          setActivity([]);
          setActivityError('Recent notifications are unavailable.');
        }

        const taskResults = await Promise.allSettled(
          rawProjects.map((project) => tasksApi.list(project.id))
        );
        if (cancelled) return;

        const allTasks = [];
        let failedProjectTaskList = false;
        taskResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            failedProjectTaskList = true;
            return;
          }
          allTasks.push(...getRows(result.value.data).map((task) => ({
            ...task,
            project: task.project ?? {
              id: rawProjects[index].id,
              name: rawProjects[index].name,
            },
          })));
        });
        setTasks(allTasks);
        if (failedProjectTaskList) {
          setTaskDataError('Some project tasks could not be loaded. Task totals may be incomplete.');
        }
      } catch (fetchError) {
        if (!cancelled) {
          const status = fetchError.response?.status;
          if (status === 401) setError('Session expired. Please log in again.');
          else if (status === 403) setError('You do not have permission to view this data.');
          else setError('Failed to load workspace data. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOverview();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    metrics,
    projects,
    tasks,
    activity,
    user,
    org,
    loading,
    error,
    taskDataError,
    activityError,
  };
}
