import React, { useEffect, useState } from 'react';
import { Tabs, Card, Col, Row, Statistic, Badge } from 'antd';
import { Users, ShieldCheck, Key, UserPlus } from 'lucide-react';
import UserList from '../users/UserList';
import RoleList from '../roles/RoleList';
import PermissionList from '../permissions/PermissionList';
import AccessRequests from './AccessRequests';
import usePermission from '../../hooks/usePermission';
import ProtectedRoute from '../../components/ProtectedRoute';
import usersService from '../../services/users.service';
import rolesService from '../../services/roles.service';
import permissionsService from '../../services/permissions.service';
import { fetchPendingApprovals } from '../../services/metricsApi';

export const AdminDashboard = () => {
  const { hasPermission } = usePermission();
  const [stats, setStats] = useState({ users: 0, roles: 0, permissions: 0 });
  const [pendingCount, setPendingCount] = useState(0);

  const fetchStats = async () => {
    try {
      const [u, r, p, approvals] = await Promise.all([
        usersService.getUsers(),
        rolesService.getRoles(),
        permissionsService.getPermissions(),
        fetchPendingApprovals()
      ]);
      setStats({
        users: u.filter(user => user.status === 'active').length,
        roles: r.length,
        permissions: p.length
      });
      if (approvals && approvals.ok) {
        setPendingCount((approvals.rows || []).length);
      }
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const items = [];

  if (hasPermission('users.view')) {
    items.push({
      key: 'users',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Users size={16} /> User Management
        </span>
      ),
      children: (
        <ProtectedRoute permission="users.view">
          <UserList />
        </ProtectedRoute>
      ),
    });

    items.push({
      key: 'requests',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <UserPlus size={16} /> Access Requests
          {pendingCount > 0 && <Badge count={pendingCount} style={{ backgroundColor: '#ef4444' }} />}
        </span>
      ),
      children: (
        <ProtectedRoute permission="users.view">
          <AccessRequests onRefreshStats={fetchStats} />
        </ProtectedRoute>
      ),
    });
  }

  if (hasPermission('roles.view')) {
    items.push({
      key: 'roles',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <ShieldCheck size={16} /> Role Management
        </span>
      ),
      children: (
        <ProtectedRoute permission="roles.view">
          <RoleList />
        </ProtectedRoute>
      ),
    });
    
    items.push({
      key: 'permissions',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Key size={16} /> Permission Catalog
        </span>
      ),
      children: (
        <ProtectedRoute permission="roles.view">
          <PermissionList />
        </ProtectedRoute>
      ),
    });
  }

  return (
    <div className="admin-dashboard-container" style={{ padding: '0.5rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>Administration Console</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Configure platform user access, permissions, and roles.</p>
      </div>

      {/* Role-based dashboard cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: '1.5rem' }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
            <Statistic
              title="Active System Users"
              value={stats.users}
              prefix={<Users size={20} style={{ marginRight: '6px', color: '#3b82f6', verticalAlign: 'middle' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
            <Statistic
              title="Configured Roles"
              value={stats.roles}
              prefix={<ShieldCheck size={20} style={{ marginRight: '6px', color: '#10b981', verticalAlign: 'middle' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
            <Statistic
              title="Cataloged Permissions"
              value={stats.permissions}
              prefix={<Key size={20} style={{ marginRight: '6px', color: '#ec4899', verticalAlign: 'middle' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} className="admin-dashboard-card">
        <Tabs
          defaultActiveKey="users"
          items={items}
          size="large"
          style={{ marginBottom: 32 }}
          onChange={() => fetchStats()} // Refresh metrics when changing tabs
        />
      </Card>
    </div>
  );
};

export default AdminDashboard;
