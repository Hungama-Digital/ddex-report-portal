import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Select, message, Card, Popconfirm } from 'antd';
import { UserCheck, UserX, Clock, ShieldCheck } from 'lucide-react';
import { fetchPendingApprovals, approvePendingUser, rejectPendingUser } from '../../services/metricsApi';
import rolesService from '../../services/roles.service';

const { Option } = Select;

export const AccessRequests = ({ onRefreshStats }) => {
  const [requests, setRequests] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedRole, setSelectedRole] = useState('business-team');
  const [approveVisible, setApproveVisible] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const response = await fetchPendingApprovals();
      if (response && response.ok) {
        setRequests(response.rows || []);
      }
    } catch (err) {
      console.error(err);
      message.error('Failed to load pending access requests');
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const allRoles = await rolesService.getRoles();
      setRoles(allRoles || []);
      if (allRoles && allRoles.length > 0) {
        // Set default selected role to business-team if it exists, otherwise first role
        const hasBusiness = allRoles.some(r => r.id === 'business-team');
        setSelectedRole(hasBusiness ? 'business-team' : allRoles[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadRequests();
    loadRoles();
  }, []);

  const handleApproveClick = (record) => {
    setSelectedRequest(record);
    setApproveVisible(true);
  };

  const handleApproveConfirm = async () => {
    if (!selectedRequest) return;
    setActionLoading(true);
    try {
      const response = await approvePendingUser(selectedRequest.id, selectedRole);
      if (response && response.ok) {
        message.success(`Approved user ${selectedRequest.username} as ${selectedRole}`);
        setApproveVisible(false);
        setSelectedRequest(null);
        loadRequests();
        if (onRefreshStats) {
          onRefreshStats();
        }
      }
    } catch (err) {
      message.error(err.message || 'Failed to approve user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (requestId) => {
    try {
      const response = await rejectPendingUser(requestId);
      if (response && response.ok) {
        message.success('Access request rejected');
        loadRequests();
        if (onRefreshStats) {
          onRefreshStats();
        }
      }
    } catch (err) {
      message.error(err.message || 'Failed to reject access request');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'username',
      key: 'username',
      render: (text) => <span style={{ fontWeight: 600 }}>{text}</span>,
    },
    {
      title: 'Email Address',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Requested Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
          <Clock size={14} />
          {date ? new Date(date).toLocaleString() : '-'}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="primary"
            icon={<UserCheck size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />}
            onClick={() => handleApproveClick(record)}
            style={{ display: 'inline-flex', alignItems: 'center', background: '#10b981', borderColor: '#10b981' }}
          >
            Approve & Assign Role
          </Button>

          <Popconfirm
            title="Are you sure you want to reject this request?"
            onConfirm={() => handleReject(record.id)}
            okText="Yes, Reject"
            cancelText="No"
            okButtonProps={{ danger: true }}
          >
            <Button
              danger
              icon={<UserX size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />}
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              Reject
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="access-requests-mgmt">
      <Card bordered={false} className="table-card">
        <div style={{ marginBottom: '1.2rem' }}>
          <h3 style={{ margin: '0 0 0.25rem 0', fontWeight: 600 }}>Access Requests</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            List of users waiting for admin approval to access the portal.
          </p>
        </div>

        <Table
          columns={columns}
          dataSource={requests}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 8 }}
          className="antd-custom-table"
        />
      </Card>

      <Modal
        title="Approve User & Assign Role"
        open={approveVisible}
        onOk={handleApproveConfirm}
        onCancel={() => setApproveVisible(false)}
        confirmLoading={actionLoading}
        okText="Approve Access"
        destroyOnClose
      >
        <div style={{ padding: '0.5rem 0' }}>
          <p>
            Please choose a role to assign to <strong>{selectedRequest?.username}</strong> (<code>{selectedRequest?.email}</code>).
          </p>
          
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 500 }}>Select Role</label>
            <Select
              style={{ width: '100%' }}
              value={selectedRole}
              onChange={setSelectedRole}
              placeholder="Assign a role"
            >
              {roles.map((r) => (
                <Option key={r.id} value={r.id}>
                  {r.name}
                </Option>
              ))}
            </Select>
          </div>

          <div style={{ marginTop: '1.2rem', padding: '0.6rem 0.8rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.8rem', color: '#1e40af', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <ShieldCheck size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <strong>Role Access Note:</strong> The user will inherit all permissions mapped to the chosen role. They can setup their password and log in immediately.
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AccessRequests;
