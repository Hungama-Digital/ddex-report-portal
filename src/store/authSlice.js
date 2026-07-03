import { createSlice } from '@reduxjs/toolkit';

const getInitialState = () => {
  try {
    const storedUser = localStorage.getItem('auth_user');
    const storedToken = localStorage.getItem('auth_token');
    const storedPermissions = localStorage.getItem('auth_permissions');

    return {
      user: storedUser ? JSON.parse(storedUser) : null,
      token: storedToken || null,
      permissions: storedPermissions ? JSON.parse(storedPermissions) : [],
      loading: false,
      error: null,
      initialized: false,
    };
  } catch {
    return {
      user: null,
      token: null,
      permissions: [],
      loading: false,
      error: null,
      initialized: false,
    };
  }
};

const authSlice = createSlice({
  name: 'auth',
  initialState: getInitialState(),
  reducers: {
    authStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    authSuccess: (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.permissions = action.payload.permissions || [];
      state.initialized = true;

      try {
        localStorage.setItem('auth_user', JSON.stringify(action.payload.user));
        localStorage.setItem('auth_token', action.payload.token);
        localStorage.setItem('auth_permissions', JSON.stringify(action.payload.permissions || []));
      } catch (err) {
        console.error('Failed to store auth state in localStorage:', err);
      }
    },
    authFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },
    authInitialized: (state) => {
      state.initialized = true;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.permissions = [];
      state.loading = false;
      state.error = null;
      state.initialized = true;

      try {
        localStorage.removeItem('auth_user');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_permissions');
      } catch (err) {
        console.error('Failed to clear auth state from localStorage:', err);
      }
    },
  },
});

export const { authStart, authSuccess, authFailure, authInitialized, logout } = authSlice.actions;
export default authSlice.reducer;
