import React, { useEffect, useState } from 'react';
import { Table, Input, Tag, Card, Button, Drawer, Form, Select, Space, message } from 'antd';
import { Search, ShieldAlert, Plus } from 'lucide-react';
import { useSelector } from 'react-redux';
import permissionsService from '../../services/permissions.service';

const { TextArea } = Input;
const { Option } = Select;

export const PermissionList = () => {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  
  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [form] = Form.useForm();
  const [saveLoading, setSaveLoading] = useState(false);

  // Form states for real-time ID preview
  const [formModule, setFormModule] = useState('');
  const [formAction, setFormAction] = useState('view');
  const [customAction, setCustomAction] = useState('');

  // Access check: only super-admin/admin can create permissions
  const currentUser = useSelector((state) => state.auth.user);
  const isSuperAdmin = currentUser && (
    String(currentUser.role).toLowerCase() === 'super-admin' || 
    String(currentUser.role).toLowerCase() === 'admin'
  );

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const data = await permissionsService.getPermissions();
      setPermissions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  const getGeneratedId = () => {
    const cleanModule = formModule.toLowerCase().trim().replace(/[^a-z0-9\-]/g, '');
    const cleanAction = formAction === 'custom' 
      ? customAction.toLowerCase().trim().replace(/[^a-z0-9\-]/g, '') 
      : formAction;
    
    if (!cleanModule) return '';
    return `${cleanModule}.${cleanAction}`;
  };

  const modulesList = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'audio-reports', label: 'Audio Reports' },
    { key: 'video-reports', label: 'Video Reports' },
    { key: 'reports', label: 'Reports' },
    { key: 'search', label: 'Search Contents' },
    { key: 'users', label: 'Users' },
    { key: 'roles', label: 'Roles' },
    { key: 'settings', label: 'Settings' }
  ];

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const generatedId = getGeneratedId();
      
      if (!generatedId) {
        message.error('Invalid module or action name');
        return;
      }

      const selectedModObj = modulesList.find(m => m.key === values.module);
      const moduleName = selectedModObj ? selectedModObj.label : values.module;

      setSaveLoading(true);
      await permissionsService.createPermission({
        id: generatedId,
        module: moduleName,
        name: values.name.trim(),
        description: values.description.trim()
      });

      message.success('Permission created successfully');
      setDrawerVisible(false);
      form.resetFields();
      setFormModule('');
      setFormAction('view');
      setCustomAction('');
      fetchPermissions();
    } catch (err) {
      if (err.message) {
        message.error(err.message);
      }
    } finally {
      setSaveLoading(false);
    }
  };

  const filteredPermissions = permissions.filter(
    (p) =>
      p.name.toLowerCase().includes(searchText.toLowerCase()) ||
      p.id.toLowerCase().includes(searchText.toLowerCase()) ||
      p.module.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: 'Module',
      dataIndex: 'module',
      key: 'module',
      filters: Array.from(new Set(permissions.map(p => p.module))).map(m => ({ text: m, value: m })),
      onFilter: (value, record) => record.module === value,
      render: (text) => <span style={{ fontWeight: 600 }}>{text}</span>,
    },
    {
      title: 'Permission Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Permission Code / ID',
      dataIndex: 'id',
      key: 'id',
      render: (code) => <code style={{ fontSize: '0.85rem', color: '#ec4899', fontWeight: 600 }}>{code}</code>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Scope',
      key: 'scope',
      align: 'center',
      render: (_, record) => {
        const parts = record.id.split('.');
        const action = parts[parts.length - 1];
        let color = 'blue';
        if (action === 'view') color = 'cyan';
        if (action === 'create') color = 'green';
        if (action === 'edit') color = 'orange';
        if (action === 'delete') color = 'red';
        return <Tag color={color}>{action.toUpperCase()}</Tag>;
      },
    },
  ];

  return (
    <div className="permissions-mgmt">
      <Card bordered={false} className="table-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <Input
            placeholder="Search permissions catalog..."
            prefix={<Search size={16} style={{ color: 'var(--text-secondary)' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
          <Space>
            {isSuperAdmin && (
              <Button
                type="primary"
                icon={<Plus size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />}
                onClick={() => setDrawerVisible(true)}
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                Create Permission
              </Button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <ShieldAlert size={14} style={{ color: '#3b82f6' }} />
              <span>Standard permissions are system-defined. Super Admins can add custom modules.</span>
            </div>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={filteredPermissions}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          className="antd-custom-table"
        />
      </Card>

      {/* Drawer for creating permission */}
      <Drawer
        title="Create Custom Permission"
        width={450}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        extra={
          <Space>
            <Button onClick={() => setDrawerVisible(false)}>Cancel</Button>
            <Button onClick={handleCreate} type="primary" loading={saveLoading}>
              Save
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" hideRequiredMark>
          <Form.Item
            name="module"
            label="Module Name"
            rules={[{ required: true, message: 'Please select a module' }]}
          >
            <Select 
              placeholder="Select existing portal module" 
              onChange={(value) => setFormModule(value)}
            >
              {modulesList.map(mod => (
                <Option key={mod.key} value={mod.key}>{mod.label}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label="Permission Name"
            rules={[{ required: true, message: 'Please enter permission name' }]}
          >
            <Input placeholder="e.g. Approve Large Exports" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Form.Item
              name="action"
              label="Action Scope"
              initialValue="view"
              rules={[{ required: true }]}
            >
              <Select onChange={(value) => setFormAction(value)}>
                <Option value="view">VIEW</Option>
                <Option value="create">CREATE</Option>
                <Option value="edit">EDIT</Option>
                <Option value="delete">DELETE</Option>
                <Option value="custom">CUSTOM</Option>
              </Select>
            </Form.Item>

            {formAction === 'custom' && (
              <Form.Item
                name="customAction"
                label="Custom Action Code"
                rules={[
                  { required: true, message: 'Please enter action code' },
                  { pattern: /^[a-zA-Z0-9]+$/, message: 'Alphanumeric only' }
                ]}
              >
                <Input 
                  placeholder="e.g. approve, export" 
                  onChange={(e) => setCustomAction(e.target.value)}
                />
              </Form.Item>
            )}
          </div>

          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Please enter description' }]}
          >
            <TextArea rows={3} placeholder="Describe what access this permission controls" />
          </Form.Item>

          {/* Code ID preview card */}
          {getGeneratedId() && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.4rem' }}>
                Generated Permission Key Preview
              </div>
              <code style={{ fontSize: '0.95rem', color: '#db2777', fontWeight: 700 }}>
                {getGeneratedId()}
              </code>
            </div>
          )}
        </Form>
      </Drawer>
    </div>
  );
};

export default PermissionList;
