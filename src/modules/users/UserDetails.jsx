import React, { useEffect, useState } from 'react';
import { Drawer, Descriptions, Tag, Timeline, Divider, Empty, Spin } from 'antd';
import { User, ShieldAlert, LogIn, Download, FileText, CheckCircle, XCircle } from 'lucide-react';
import usersService from '../../services/users.service';

export const UserDetails = ({ visible, onClose, user }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchActivities = async () => {
      if (!user || !user.id) return;
      setLoading(true);
      try {
        const data = await usersService.getUserActivities(user.id);
        setActivities(data || []);
      } catch (err) {
        console.error('Failed to load user activities', err);
      } finally {
        setLoading(false);
      }
    };

    if (visible) {
      fetchActivities();
    }
  }, [visible, user]);

  if (!user) return null;

  const getStatusTag = (status) => {
    const isAct = status === 'active';
    return <Tag color={isAct ? 'green' : 'red'}>{status?.toUpperCase()}</Tag>;
  };

  const getActionIcon = (action) => {
    const act = action.toLowerCase();
    if (act.includes('logged') || act.includes('login')) {
      return <LogIn size={14} style={{ color: '#3b82f6' }} />;
    }
    if (act.includes('password') || act.includes('credential') || act.includes('reset')) {
      return <ShieldAlert size={14} style={{ color: '#f59e0b' }} />;
    }
    if (act.includes('download')) {
      return <Download size={14} style={{ color: '#10b981' }} />;
    }
    if (act.includes('export') || act.includes('difference') || act.includes('job')) {
      return <FileText size={14} style={{ color: '#06b6d4' }} />;
    }
    if (act.includes('approved') || act.includes('activated') || act.includes('created')) {
      return <CheckCircle size={14} style={{ color: '#10b981' }} />;
    }
    if (act.includes('rejected') || act.includes('revoked') || act.includes('deactivated')) {
      return <XCircle size={14} style={{ color: '#ef4444' }} />;
    }
    return <User size={14} style={{ color: '#8b5cf6' }} />;
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    try {
      const d = new Date(timeStr);
      if (isNaN(d.getTime())) return timeStr;
      return d.toLocaleString();
    } catch {
      return timeStr;
    }
  };

  return (
    <Drawer
      title="User Details & Activity"
      width={500}
      onClose={onClose}
      open={visible}
    >
      <Descriptions title="Profile Information" column={1} bordered size="small">
        <Descriptions.Item label="Full Name">{user.name || user.username}</Descriptions.Item>
        <Descriptions.Item label="Email">{user.email}</Descriptions.Item>
        <Descriptions.Item label="Mobile">{user.mobile || '-'}</Descriptions.Item>
        <Descriptions.Item label="Role">
          <Tag color="blue">{user.role?.toUpperCase()}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Status">{getStatusTag(user.status)}</Descriptions.Item>
        <Descriptions.Item label="Created Date">{formatTime(user.createdAt || user.createdDate)}</Descriptions.Item>
        <Descriptions.Item label="Last Login">{formatTime(user.lastLogin)}</Descriptions.Item>
      </Descriptions>

      <Divider />

      <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Activity Timeline</h3>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <Spin size="medium" />
        </div>
      ) : activities.length > 0 ? (
        <Timeline
          items={activities.map(log => ({
            dot: getActionIcon(log.action),
            children: (
              <div>
                <strong style={{ display: 'block', fontSize: '0.85rem' }}>{log.action}</strong>
                {log.details && <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>{log.details}</span>}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatTime(log.created_at)}</span>
              </div>
            )
          }))}
        />
      ) : (
        <Empty description="No recent activity logged" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Drawer>
  );
};

export default UserDetails;
