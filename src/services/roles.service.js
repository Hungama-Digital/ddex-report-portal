import api from './api';
import { SYSTEM_PERMISSIONS } from './permissions.service';

const DEFAULT_ROLES = [
  {
    id: 'super-admin',
    name: 'Super Admin',
    slug: 'super-admin',
    description: 'Full access to all modules and configurations.',
    status: 'active',
    permissions: SYSTEM_PERMISSIONS.map(p => p.id),
    isSystem: true
  },
  {
    id: 'content-ingestion',
    name: 'Content Ingestion Team',
    slug: 'content-ingestion',
    description: 'Responsible for monitoring metrics, viewing files, and reports.',
    status: 'active',
    permissions: ['dashboard.view', 'users.view', 'reports.view'],
    isSystem: true
  },
  {
    id: 'business-team',
    name: 'Business Team',
    slug: 'business-team',
    description: 'Access to reports page and dashboard stats.',
    status: 'active',
    permissions: ['dashboard.view', 'reports.view'],
    isSystem: true
  }
];

const initializeRolesInStorage = () => {
  if (!localStorage.getItem('portal_roles')) {
    localStorage.setItem('portal_roles', JSON.stringify(DEFAULT_ROLES));
  }
};

export const rolesService = {
  getRoles: async () => {
    try {
      const response = await api.get('/api/admin/roles');
      return response.data;
    } catch (err) {
      console.error('Failed to get roles from API, using fallback:', err);
      initializeRolesInStorage();
      return JSON.parse(localStorage.getItem('portal_roles'));
    }
  },

  createRole: async (roleData) => {
    try {
      const response = await api.post('/api/admin/roles', roleData);
      return response.data;
    } catch (err) {
      console.error('API createRole failure:', err);
      throw err;
    }
  },

  updateRole: async (roleId, roleData) => {
    try {
      const response = await api.put(`/api/admin/roles/${roleId}`, roleData);
      return response.data;
    } catch (err) {
      console.error('API updateRole failure:', err);
      throw err;
    }
  },

  deleteRole: async (roleId) => {
    try {
      const response = await api.delete(`/api/admin/roles/${roleId}`);
      return response.data;
    } catch (err) {
      console.error('API deleteRole failure:', err);
      throw err;
    }
  }
};

export default rolesService;
