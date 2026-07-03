import api from './api';
import rolesService from './roles.service';

const INITIAL_USERS = [
  {
    id: 1,
    name: 'Primary Super Admin',
    email: 'admin@hungama.local',
    mobile: '9876543210',
    role: 'super-admin',
    status: 'active',
    lastLogin: '2026-05-21 12:40:02',
    createdDate: '2026-05-01'
  },
  {
    id: 2,
    name: 'Ingestion Lead',
    email: 'ingest@hungama.local',
    mobile: '9999888877',
    role: 'content-ingestion',
    status: 'active',
    lastLogin: '2026-05-20 18:30:15',
    createdDate: '2026-05-10'
  },
  {
    id: 3,
    name: 'Business Head',
    email: 'finance@hungama.local',
    mobile: '9888777666',
    role: 'business-team',
    status: 'active',
    lastLogin: '2026-05-18 10:15:30',
    createdDate: '2026-05-12'
  },
  {
    id: 4,
    name: 'Inactive Ingestion Staff',
    email: 'staff@hungama.local',
    mobile: '9777666555',
    role: 'content-ingestion',
    status: 'inactive',
    lastLogin: '2026-05-15 09:22:11',
    createdDate: '2026-05-13'
  }
];

const initializeUsersInStorage = () => {
  if (!localStorage.getItem('portal_users')) {
    localStorage.setItem('portal_users', JSON.stringify(INITIAL_USERS));
  }
};

export const usersService = {
  getUsers: async () => {
    initializeUsersInStorage();
    try {
      const response = await api.get('/api/admin/users');
      if (response.data && response.data.rows) {
        return response.data.rows.map(user => ({
          id: user.id,
          name: user.name || user.username || 'User',
          email: user.email,
          mobile: user.mobile || '',
          role: user.role === 'admin' ? 'super-admin' : user.role,
          status: user.status === 'approved' ? 'active' : 'inactive',
          lastLogin: user.lastLogin || '-',
          createdDate: user.createdAt ? user.createdAt.slice(0, 10) : '-'
        }));
      }
      return [];
    } catch (err) {
      console.error('Failed to get users from API, using fallback:', err);
      return JSON.parse(localStorage.getItem('portal_users') || '[]');
    }
  },

  createUser: async (userData) => {
    initializeUsersInStorage();
    try {
      const response = await api.post('/api/admin/users', userData);
      return response.data.user;
    } catch (err) {
      console.error('API createUser failure:', err);
      throw err;
    }
  },

  updateUser: async (userId, userData) => {
    initializeUsersInStorage();
    try {
      const response = await api.put(`/api/admin/users/${userId}`, userData);
      return response.data.user;
    } catch (err) {
      console.error('API updateUser failure:', err);
      throw err;
    }
  },

  deleteUser: async (userId) => {
    initializeUsersInStorage();
    try {
      await api.delete(`/api/admin/users/${userId}`);
      return { success: true, id: userId };
    } catch (err) {
      console.error('API deleteUser failure:', err);
      throw err;
    }
  },

  resetPassword: async (userId, newPassword) => {
    try {
      const response = await api.post(`/api/admin/users/${userId}/reset-password`, { password: newPassword });
      return response.data;
    } catch (err) {
      console.error('API resetPassword failure:', err);
      throw err;
    }
  },

  getUserActivities: async (userId) => {
    try {
      const response = await api.get(`/api/admin/users/${userId}/activities`);
      return response.data.activities;
    } catch (err) {
      console.error('API getUserActivities failure:', err);
      return [];
    }
  }
};

export default usersService;
