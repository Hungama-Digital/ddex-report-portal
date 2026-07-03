import React, { useEffect, useState } from 'react';
import { Table, Input, Select, Button, Space, Tag, Popconfirm, Modal, Form, message, Card } from 'antd';
import { Search, Plus, Eye, Edit2, Trash2, Key, AlertCircle } from 'lucide-react';
import usersService from '../../services/users.service';
import UserDrawer from './UserDrawer';
import UserDetails from './UserDetails';
import PermissionWrapper from '../../components/PermissionWrapper';

const { Option } = Select;

export const UserList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Drawer/Modal States
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const [resetForm] = Form.useForm();
  const [resetLoading, setResetLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await usersService.getUsers();
      setUsers(data);
    } catch (err) {
      message.error('Failed to load user list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateOrUpdate = async (values) => {
    try {
      if (selectedUser) {
        await usersService.updateUser(selectedUser.id, values);
        message.success('User updated successfully');
      } else {
        await usersService.createUser(values);
        message.success('User created successfully');
      }
      fetchUsers();
    } catch (err) {
      throw err; // UserDrawer handles display
    }
  };

  const handleDelete = async (userId) => {
    try {
      await usersService.deleteUser(userId);
      message.success('User deleted successfully');
      fetchUsers();
    } catch (err) {
      message.error(err.message || 'Failed to delete user');
    }
  };

  const handleToggleStatus = async (user) => {
    try {
      const nextStatus = user.status === 'active' ? 'inactive' : 'active';
      await usersService.updateUser(user.id, { ...user, status: nextStatus });
      message.success(`User is now ${nextStatus}`);
      fetchUsers();
    } catch (err) {
      message.error('Failed to toggle status');
    }
  };

  const handleResetPassword = async () => {
    try {
      const values = await resetForm.validateFields();
      setResetLoading(true);
      await usersService.resetPassword(selectedUser.id, values.password);
      message.success('Password reset successfully');
      setResetModalVisible(false);
      resetForm.resetFields();
    } catch (err) {
      if (err.message) {
        message.error(err.message);
      }
    } finally {
      setResetLoading(false);
    }
  };

  // Filter logic
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchText.toLowerCase()) ||
      u.email.toLowerCase().includes(searchText.toLowerCase()) ||
      (u.mobile && u.mobile.includes(searchText));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (text, record) => (
        <span style={{ fontWeight: 500 }}>{text}</span>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Mobile',
      dataIndex: 'mobile',
      key: 'mobile',
      render: (text) => text || '-',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role) => {
        let color = 'geekblue';
        if (role === 'super-admin') color = 'purple';
        if (role === 'business-team') color = 'cyan';
        return <Tag color={color}>{role?.toUpperCase().replace('-', ' ')}</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => {
        const isAct = status === 'active';
        return (
          <PermissionWrapper permission="users.edit" fallback={<Tag color={isAct ? 'green' : 'red'}>{status?.toUpperCase()}</Tag>}>
            <Popconfirm
              title={`Are you sure you want to ${isAct ? 'deactivate' : 'activate'} this user?`}
              onConfirm={() => handleToggleStatus(record)}
              okText="Yes"
              cancelText="No"
            >
              <Tag
                color={isAct ? 'green' : 'red'}
                style={{ cursor: 'pointer' }}
                title="Click to toggle status"
              >
                {status?.toUpperCase()}
              </Tag>
            </Popconfirm>
          </PermissionWrapper>
        );
      },
    },
    {
      title: 'Last Login',
      dataIndex: 'lastLogin',
      key: 'lastLogin',
      render: (text) => {
        if (!text || text === '-') return '-';
        try {
          const d = new Date(text);
          if (isNaN(d.getTime())) return text;
          return d.toLocaleString();
        } catch {
          return text;
        }
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="text"
            icon={<Eye size={15} />}
            onClick={() => {
              setSelectedUser(record);
              setDetailsVisible(true);
            }}
            title="View Details"
          />

          <PermissionWrapper permission="users.edit">
            <Button
              type="text"
              icon={<Edit2 size={15} />}
              onClick={() => {
                setSelectedUser(record);
                setDrawerVisible(true);
              }}
              title="Edit User"
            />
          </PermissionWrapper>

          <PermissionWrapper permission="users.edit">
            <Button
              type="text"
              icon={<Key size={15} style={{ color: '#d97706' }} />}
              onClick={() => {
                setSelectedUser(record);
                setResetModalVisible(true);
              }}
              title="Reset Password"
            />
          </PermissionWrapper>

          <PermissionWrapper permission="users.delete">
            <Popconfirm
              title="Are you sure you want to delete this user?"
              onConfirm={() => handleDelete(record.id)}
              okText="Yes"
              cancelText="No"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="text"
                danger
                icon={<Trash2 size={15} />}
                title="Delete User"
              />
            </Popconfirm>
          </PermissionWrapper>
        </Space>
      ),
    },
  ];

  const validatePassword = (_, value) => {
    if (!value || value.length >= 6) return Promise.resolve();
    return Promise.reject(new Error('Password must be at least 6 characters'));
  };

  return (
    <div className="users-mgmt">
      <Card bordered={false} className="table-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <Space wrap size="middle">
            <Input
              placeholder="Search by name, email, mobile..."
              prefix={<Search size={16} style={{ color: 'var(--text-secondary)' }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 260 }}
              allowClear
            />
            
            <Select
              placeholder="Filter by Role"
              value={roleFilter}
              onChange={setRoleFilter}
              style={{ width: 180 }}
            >
              <Option value="all">All Roles</Option>
              <Option value="super-admin">Super Admin</Option>
              <Option value="content-ingestion">Content Ingestion Team</Option>
              <Option value="business-team">Business Team</Option>
            </Select>

            <Select
              placeholder="Filter by Status"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 140 }}
            >
              <Option value="all">All Statuses</Option>
              <Option value="active">Active</Option>
              <Option value="inactive">Inactive</Option>
            </Select>
          </Space>

          <PermissionWrapper permission="users.create">
            <Button
              type="primary"
              icon={<Plus size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />}
              onClick={() => {
                setSelectedUser(null);
                setDrawerVisible(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              Add User
            </Button>
          </PermissionWrapper>
        </div>

        <Table
          columns={columns}
          dataSource={filteredUsers}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 8, showSizeChanger: true }}
          className="antd-custom-table"
        />
      </Card>

      <UserDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onSave={handleCreateOrUpdate}
        user={selectedUser}
      />

      <UserDetails
        visible={detailsVisible}
        onClose={() => setDetailsVisible(false)}
        user={selectedUser}
      />

      {/* Password Reset Modal */}
      <Modal
        title="Reset Account Password"
        open={resetModalVisible}
        onOk={handleResetPassword}
        onCancel={() => setResetModalVisible(false)}
        confirmLoading={resetLoading}
        okText="Reset Password"
        destroyOnClose
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.2rem', padding: '0.6rem 0.8rem', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '6px', color: '#b45309' }}>
          <AlertCircle size={18} />
          <span style={{ fontSize: '0.85rem' }}>
            Reseting password for <strong>{selectedUser?.name}</strong>. User will have to use the new credentials on next log in.
          </span>
        </div>
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="password"
            label="New Password"
            rules={[
              { required: true, message: 'Please enter new password' },
              { validator: validatePassword }
            ]}
          >
            <Input.Password placeholder="Enter new password (min 6 characters)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserList;
