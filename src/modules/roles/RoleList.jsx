import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Popconfirm, message, Card } from 'antd';
import { Plus, Edit2, Copy, Trash2, ShieldCheck } from 'lucide-react';
import rolesService from '../../services/roles.service';
import RoleDrawer from './RoleDrawer';
import PermissionWrapper from '../../components/PermissionWrapper';

export const RoleList = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const data = await rolesService.getRoles();
      setRoles(data);
    } catch (err) {
      message.error('Failed to load roles list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleSaveRole = async (values) => {
    try {
      if (selectedRole && !selectedRole.isClone) {
        await rolesService.updateRole(selectedRole.id, values);
        message.success('Role updated successfully');
      } else {
        await rolesService.createRole(values);
        message.success('Role created successfully');
      }
      fetchRoles();
    } catch (err) {
      message.error(err.message || 'Failed to save role');
      throw err;
    }
  };

  const handleDeleteRole = async (roleId) => {
    try {
      await rolesService.deleteRole(roleId);
      message.success('Role deleted successfully');
      fetchRoles();
    } catch (err) {
      message.error(err.message || 'Failed to delete role');
    }
  };

  const handleCloneRole = (role) => {
    const cloned = {
      ...role,
      name: `${role.name} (Copy)`,
      isClone: true
    };
    setSelectedRole(cloned);
    setDrawerVisible(true);
  };

  const columns = [
    {
      title: 'Role Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (text, record) => (
        <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {record.isSystem && <ShieldCheck size={15} style={{ color: '#6366f1' }} />}
          {text}
        </span>
      ),
    },
    {
      title: 'Role Slug',
      dataIndex: 'slug',
      key: 'slug',
      render: (slug) => <code style={{ fontSize: '0.8rem' }}>{slug}</code>
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Permissions',
      dataIndex: 'permissions',
      key: 'permissions',
      align: 'center',
      render: (permissions) => (
        <Tag color="purple" style={{ fontWeight: 600 }}>
          {permissions ? permissions.length : 0} Assigned
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const isAct = status === 'active';
        return <Tag color={isAct ? 'green' : 'red'}>{status?.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="middle">
          <PermissionWrapper permission="roles.edit">
            <Button
              type="text"
              icon={<Edit2 size={15} />}
              onClick={() => {
                setSelectedRole(record);
                setDrawerVisible(true);
              }}
              title="Edit Role"
            />
          </PermissionWrapper>

          <PermissionWrapper permission="roles.create">
            <Button
              type="text"
              icon={<Copy size={15} style={{ color: '#0d9488' }} />}
              onClick={() => handleCloneRole(record)}
              title="Clone Role"
            />
          </PermissionWrapper>

          <PermissionWrapper permission="roles.delete">
            {!record.isSystem ? (
              <Popconfirm
                title="Are you sure you want to delete this role?"
                onConfirm={() => handleDeleteRole(record.id)}
                okText="Yes"
                cancelText="No"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  danger
                  icon={<Trash2 size={15} />}
                  title="Delete Role"
                />
              </Popconfirm>
            ) : (
              <Button
                type="text"
                disabled
                icon={<Trash2 size={15} />}
                title="System role cannot be deleted"
                style={{ opacity: 0.3 }}
              />
            )}
          </PermissionWrapper>
        </Space>
      ),
    },
  ];

  return (
    <div className="roles-mgmt">
      <Card bordered={false} className="table-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
          <PermissionWrapper permission="roles.create">
            <Button
              type="primary"
              icon={<Plus size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />}
              onClick={() => {
                setSelectedRole(null);
                setDrawerVisible(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              Create Role
            </Button>
          </PermissionWrapper>
        </div>

        <Table
          columns={columns}
          dataSource={roles}
          rowKey="id"
          loading={loading}
          pagination={false}
          className="antd-custom-table"
        />
      </Card>

      <RoleDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onSave={handleSaveRole}
        role={selectedRole}
      />
    </div>
  );
};

export default RoleList;
