import React, { useEffect, useState } from 'react';
import { Drawer, Form, Input, Select, Button, Space, Checkbox, message, Table } from 'antd';
import permissionsService from '../../services/permissions.service';

const { Option } = Select;
const { TextArea } = Input;

export const RoleDrawer = ({ visible, onClose, onSave, role }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [modulesList, setModulesList] = useState([]);
  const [matrixActions, setMatrixActions] = useState(['view', 'create', 'edit', 'delete']);
  const isEdit = !!role;

  const fetchPermissions = async () => {
    try {
      const allPerms = await permissionsService.getPermissions();
      
      const modulesMap = {};
      const actionsSet = new Set(['view', 'create', 'edit', 'delete']);

      allPerms.forEach(perm => {
        const parts = perm.id.split('.');
        const moduleKey = parts[0];
        const actionKey = parts[1] || 'view';
        actionsSet.add(actionKey);

        if (!modulesMap[moduleKey]) {
          modulesMap[moduleKey] = {
            key: moduleKey,
            name: perm.module || moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1),
            actions: []
          };
        }
        if (!modulesMap[moduleKey].actions.includes(actionKey)) {
          modulesMap[moduleKey].actions.push(actionKey);
        }
      });

      setModulesList(Object.values(modulesMap));
      
      const sortedActions = Array.from(actionsSet).sort((a, b) => {
        const order = { view: 1, create: 2, edit: 3, delete: 4 };
        const orderA = order[a] || 99;
        const orderB = order[b] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
      });
      setMatrixActions(sortedActions);
    } catch (err) {
      console.error('Failed to load permissions in drawer:', err);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchPermissions();
      if (role) {
        form.setFieldsValue({
          name: role.name,
          description: role.description,
          status: role.status,
        });
        setSelectedPermissions(role.permissions || []);
      } else {
        form.resetFields();
        setSelectedPermissions([]);
      }
    }
  }, [visible, role, form]);

  const handlePermissionChange = (permId, checked) => {
    if (checked) {
      setSelectedPermissions(prev => [...prev, permId]);
    } else {
      setSelectedPermissions(prev => prev.filter(id => id !== permId));
    }
  };

  const handleModuleRowSelectAll = (moduleKey, checked, supportedActions) => {
    const actionPerms = supportedActions.map(act => `${moduleKey}.${act}`);
    if (checked) {
      setSelectedPermissions(prev => {
        const union = new Set([...prev, ...actionPerms]);
        return Array.from(union);
      });
    } else {
      setSelectedPermissions(prev => prev.filter(id => !actionPerms.includes(id)));
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (role && role.id === 'super-admin') {
        message.warning('Super Admin permissions are fixed and cannot be changed.');
      }
      setLoading(true);
      await onSave({
        ...values,
        permissions: selectedPermissions,
      });
      form.resetFields();
      onClose();
    } catch (err) {
      if (err.message) {
        message.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Matrix Grid Columns
  const matrixColumns = [
    {
      title: 'Module',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Checkbox
            indeterminate={
              record.actions.some(act => selectedPermissions.includes(`${record.key}.${act}`)) &&
              !record.actions.every(act => selectedPermissions.includes(`${record.key}.${act}`))
            }
            checked={record.actions.every(act => selectedPermissions.includes(`${record.key}.${act}`))}
            onChange={(e) => handleModuleRowSelectAll(record.key, e.target.checked, record.actions)}
            disabled={role?.id === 'super-admin'}
          />
          <span style={{ fontWeight: 500 }}>{text}</span>
        </div>
      ),
    },
    ...matrixActions.map(action => ({
      title: action.toUpperCase(),
      key: action,
      align: 'center',
      render: (_, record) => {
        const permId = `${record.key}.${action}`;
        const isSupported = record.actions.includes(action);
        
        if (!isSupported) {
          return <span style={{ color: '#ef4444', fontWeight: 600 }}>✗</span>;
        }

        const isChecked = selectedPermissions.includes(permId);

        return (
          <Checkbox
            checked={isChecked}
            onChange={(e) => handlePermissionChange(permId, e.target.checked)}
            disabled={role?.id === 'super-admin'}
          />
        );
      }
    }))
  ];

  return (
    <Drawer
      title={isEdit ? 'Edit System Role' : 'Create Custom Role'}
      width={650}
      onClose={onClose}
      open={visible}
      bodyStyle={{ paddingBottom: 80 }}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} type="primary" loading={loading} disabled={role?.id === 'super-admin' && isEdit}>
            Save
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" hideRequiredMark>
        <Form.Item
          name="name"
          label="Role Name"
          rules={[{ required: true, message: 'Please enter role name' }]}
        >
          <Input placeholder="e.g. Compliance Officer" disabled={role?.isSystem} />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
          rules={[{ required: true, message: 'Please enter description' }]}
        >
          <TextArea rows={3} placeholder="Describe the access levels for this role" />
        </Form.Item>

        {isEdit && (
          <Form.Item
            name="status"
            label="Role Status"
            rules={[{ required: true, message: 'Please select status' }]}
          >
            <Select placeholder="Select status" disabled={role?.isSystem}>
              <Option value="active">Active</Option>
              <Option value="inactive">Inactive</Option>
            </Select>
          </Form.Item>
        )}
      </Form>

      <Divider style={{ margin: '1.2rem 0' }} />
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
        <h3 style={{ margin: 0, fontWeight: 600 }}>Role Permissions Matrix</h3>
        {role?.id === 'super-admin' && (
          <span style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 500 }}>
            Super Admin permissions are locked to full access.
          </span>
        )}
      </div>

      <Table
        columns={matrixColumns}
        dataSource={modulesList}
        pagination={false}
        size="small"
        bordered
        className="permissions-matrix-table"
      />
    </Drawer>
  );
};

const Divider = ({ style }) => <div style={{ borderTop: '1px solid var(--border-color)', width: '100%', ...style }} />;

export default RoleDrawer;
