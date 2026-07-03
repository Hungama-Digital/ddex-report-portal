import React, { useEffect, useState } from 'react';
import { Drawer, Form, Input, Select, Button, Space, message } from 'antd';
import rolesService from '../../services/roles.service';

const { Option } = Select;

export const UserDrawer = ({ visible, onClose, onSave, user }) => {
  const [form] = Form.useForm();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const isEdit = !!user;

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const data = await rolesService.getRoles();
        setRoles(data.filter(r => r.status === 'active'));
      } catch (err) {
        message.error('Failed to load roles for selection');
      }
    };
    if (visible) {
      fetchRoles();
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      if (user) {
        form.setFieldsValue({
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          role: user.role,
          status: user.status,
        });
      } else {
        form.resetFields();
      }
    }
  }, [visible, user, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await onSave(values);
      form.resetFields();
      onClose();
    } catch (err) {
      // Validation error or save error
      if (err.message) {
        message.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const validatePasswordStrength = (_, value) => {
    if (!value) {
      return Promise.resolve();
    }
    if (value.length < 6) {
      return Promise.reject(new Error('Password must be at least 6 characters long'));
    }
    const hasLetter = /[a-zA-Z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    if (!hasLetter || !hasNumber) {
      return Promise.reject(new Error('Password must contain both letters and numbers'));
    }
    return Promise.resolve();
  };

  return (
    <Drawer
      title={isEdit ? 'Edit User' : 'Add New User'}
      width={480}
      onClose={onClose}
      open={visible}
      bodyStyle={{ paddingBottom: 80 }}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} type="primary" loading={loading}>
            Save
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" hideRequiredMark>
        <Form.Item
          name="name"
          label="Full Name"
          rules={[{ required: true, message: 'Please enter the user\'s full name' }]}
        >
          <Input placeholder="Enter full name" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email Address"
          rules={[
            { required: true, message: 'Please enter email address' },
            { type: 'email', message: 'Please enter a valid email' }
          ]}
        >
          <Input placeholder="Enter email address" disabled={isEdit} />
        </Form.Item>

        <Form.Item
          name="mobile"
          label="Mobile Number"
          rules={[
            { required: true, message: 'Please enter mobile number' },
            { pattern: /^[0-9]{10}$/, message: 'Please enter a valid 10-digit mobile number' }
          ]}
        >
          <Input placeholder="Enter 10-digit mobile number" maxLength={10} />
        </Form.Item>

        <Form.Item
          name="role"
          label="System Access Role"
          rules={[{ required: true, message: 'Please select a role' }]}
        >
          <Select placeholder="Select a role">
            {roles.map(r => (
              <Option key={r.id} value={r.id}>
                {r.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {!isEdit && (
          <Form.Item
            name="password"
            label="Initial Password"
            rules={[
              { required: true, message: 'Please enter initial password' },
              { validator: validatePasswordStrength }
            ]}
          >
            <Input.Password placeholder="Enter password (letters + numbers, min 6 chars)" />
          </Form.Item>
        )}

        {isEdit && (
          <Form.Item
            name="status"
            label="Account Status"
            rules={[{ required: true, message: 'Please select status' }]}
          >
            <Select placeholder="Select status">
              <Option value="active">Active</Option>
              <Option value="inactive">Inactive</Option>
            </Select>
          </Form.Item>
        )}
      </Form>
    </Drawer>
  );
};

export default UserDrawer;
