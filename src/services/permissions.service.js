import api from './api';

export const SYSTEM_PERMISSIONS = [
  { id: 'dashboard.view', module: 'Dashboard', name: 'View Dashboard', description: 'View main metrics and charts' },
  
  { id: 'audio-reports.view', module: 'Audio Reports', name: 'View Audio Reports', description: 'View and query audio metrics' },
  
  { id: 'video-reports.view', module: 'Video Reports', name: 'View Video Reports', description: 'View and query video metrics' },
  
  { id: 'reports.view', module: 'Reports', name: 'View Reports', description: 'Access report generation page' },
  
  { id: 'search.view', module: 'Search Contents', name: 'Search Contents', description: 'Access DDEX album and track search' },
  
  { id: 'users.view', module: 'Users', name: 'View Users', description: 'List and view user profiles' },
  { id: 'users.create', module: 'Users', name: 'Create Users', description: 'Add new user accounts' },
  { id: 'users.edit', module: 'Users', name: 'Edit Users', description: 'Modify existing user details' },
  { id: 'users.delete', module: 'Users', name: 'Delete Users', description: 'Delete user accounts' },
  
  { id: 'roles.view', module: 'Roles', name: 'View Roles', description: 'View system access roles' },
  { id: 'roles.create', module: 'Roles', name: 'Create Roles', description: 'Create new access roles' },
  { id: 'roles.edit', module: 'Roles', name: 'Edit Roles', description: 'Modify role permission matrix' },
  { id: 'roles.delete', module: 'Roles', name: 'Delete Roles', description: 'Remove custom roles' },
  
  { id: 'settings.view', module: 'Settings', name: 'View Settings', description: 'Access system preferences page' },
  { id: 'settings.edit', module: 'Settings', name: 'Edit Settings', description: 'Modify system theme and options' },
];

const initializeStorage = () => {
  const stored = window.localStorage.getItem('portal_permissions');
  // Migration check: Reset storage if legacy key is present or is not fully seeded
  const needsReset = !stored || 
    JSON.parse(stored).length < SYSTEM_PERMISSIONS.length ||
    JSON.parse(stored).some(p => p.id.startsWith('audioreports'));
  
  if (needsReset) {
    window.localStorage.setItem('portal_permissions', JSON.stringify(SYSTEM_PERMISSIONS));
  }
};

export const permissionsService = {
  getPermissions: async () => {
    try {
      const response = await api.get('/api/admin/permissions');
      return response.data;
    } catch (err) {
      console.error('Failed to fetch permissions from API, using fallback:', err);
      initializeStorage();
      return JSON.parse(window.localStorage.getItem('portal_permissions'));
    }
  },

  createPermission: async (permData) => {
    try {
      const response = await api.post('/api/admin/permissions', permData);
      return response.data;
    } catch (err) {
      console.error('Failed to create permission:', err);
      throw err;
    }
  }
};

export default permissionsService;
