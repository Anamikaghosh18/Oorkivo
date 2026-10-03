// Isolated mock data layer.
// These feed the dashboard while backend endpoints are being built.
// To wire up real APIs: replace each export with an API call in useDashboard.js

export const mockOrganization = {
  id: 1,
  name: 'Oorkivo Pvt. Ltd.',
};

export const mockUser = {
  first_name: 'Anamika',
  last_name: 'Ghosh',
  email: 'anamika@oorkivo.com',
  access_level: 'OWNER',
};

export const mockMetrics = {
  teams: 6,
  projects: 12,
  members: 48,
};

export const mockProjects = [
  {
    id: 1,
    name: 'Website Redesign',
    team: 'Design',
    status: 'ACTIVE',
    target_end_date: '2026-10-12',
  },
  {
    id: 2,
    name: 'CRM Platform',
    team: 'Engineering',
    status: 'PLANNING',
    target_end_date: '2026-10-20',
  },
  {
    id: 3,
    name: 'Mobile Application',
    team: 'Product',
    status: 'ACTIVE',
    target_end_date: '2026-11-02',
  },
  {
    id: 4,
    name: 'Q4 Marketing Campaign',
    team: 'Marketing',
    status: 'ON_HOLD',
    target_end_date: '2026-11-15',
  },
  {
    id: 5,
    name: 'HR Onboarding Portal',
    team: 'HR',
    status: 'PLANNING',
    target_end_date: '2026-12-01',
  },
];

export const mockActivity = [
  {
    id: 1,
    actor: 'Priya Sharma',
    action: 'joined',
    target: 'Design Team',
    timestamp: '2 hours ago',
  },
  {
    id: 2,
    actor: 'Rahul Mehta',
    action: 'updated',
    target: 'CRM Platform',
    timestamp: '4 hours ago',
  },
  {
    id: 3,
    actor: 'Anamika Ghosh',
    action: 'created',
    target: 'Website Redesign',
    timestamp: 'Yesterday',
  },
  {
    id: 4,
    actor: 'Deepak Nair',
    action: 'completed task in',
    target: 'Mobile Application',
    timestamp: 'Yesterday',
  },
];
