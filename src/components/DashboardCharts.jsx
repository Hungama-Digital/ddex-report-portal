import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { Music, Video } from 'lucide-react';

const DashboardCharts = ({ dashboardStats, dashboardMode }) => {
  const audioData = [
    { name: 'Live', value: dashboardStats?.audio?.totalLive || 0, color: 'var(--success-color)' },
    { name: 'Delivered', value: dashboardStats?.audio?.deliveredThisMonth || 0, color: 'var(--accent-color)' },
    { name: 'Taken Down', value: dashboardStats?.audio?.takenDownThisMonth || 0, color: 'var(--danger-color)' }
  ];

  const videoData = [
    { name: 'Live', value: dashboardStats?.video?.totalLive || 0, color: 'var(--success-color)' },
    { name: 'Delivered', value: dashboardStats?.video?.deliveredThisMonth || 0, color: 'var(--accent-color)' },
    { name: 'Taken Down', value: dashboardStats?.video?.takenDownThisMonth || 0, color: 'var(--danger-color)' }
  ];

  return (
    <div className="dashboard-charts-grid" style={{ gridTemplateColumns: dashboardMode === 'combined' ? '' : '1fr' }}>
      {(dashboardMode === 'combined' || dashboardMode === 'audio') && (
        <div className="charts-container">
        <h3 className="chart-title" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <Music size={18} color="var(--accent-color)" /> Audio Status Overview
        </h3>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={audioData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" opacity={0.5} />
              <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{fill: 'var(--text-secondary)', fontSize: 13}} axisLine={false} tickLine={false} />
              <YAxis stroke="var(--text-secondary)" tick={{fill: 'var(--text-secondary)', fontSize: 13}} axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{fill: 'var(--glass-bg)', opacity: 0.4}}
                contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={50} animationDuration={1500}>
                {audioData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {(dashboardMode === 'combined' || dashboardMode === 'video') && (
      <div className="charts-container">
        <h3 className="chart-title" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <Video size={18} color="var(--accent-color)" /> Video Status Overview
        </h3>
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={videoData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" opacity={0.5} />
              <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{fill: 'var(--text-secondary)', fontSize: 13}} axisLine={false} tickLine={false} />
              <YAxis stroke="var(--text-secondary)" tick={{fill: 'var(--text-secondary)', fontSize: 13}} axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{fill: 'var(--glass-bg)', opacity: 0.4}}
                contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={50} animationDuration={1500}>
                {videoData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}
    </div>
  );
};

export default DashboardCharts;
