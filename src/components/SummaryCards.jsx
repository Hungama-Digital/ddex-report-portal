import React from 'react';
import { Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const SummaryCards = ({ activeTab, setActiveTab, stats, dashboardStats, isDashboard, dashboardMode }) => {
  const getAggregated = (key) => {
    if (!isDashboard || !dashboardStats) return 0;
    if (dashboardMode === 'audio') return dashboardStats.audio[key];
    if (dashboardMode === 'video') return dashboardStats.video[key];
    return dashboardStats.audio[key] + dashboardStats.video[key];
  };

  const getBreakdown = (key) => {
    if (!isDashboard || !dashboardStats || dashboardMode !== 'combined') return null;
    return (
      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
        🎵 {dashboardStats.audio[key]} &nbsp;|&nbsp; 🎬 {dashboardStats.video[key]}
      </span>
    );
  };

  const cards = [
    {
      id: 'totalLive',
      title: 'Total Content Live',
      value: isDashboard ? getAggregated('totalLive') : stats?.totalLive || 0,
      icon: <Activity size={24} />,
      subtitle: isDashboard ? getBreakdown('totalLive') : 'Overall cumulative count'
    },
    {
      id: 'deliveredThisMonth',
      title: 'Delivered in Period',
      value: isDashboard ? getAggregated('deliveredThisMonth') : stats?.deliveredThisMonth || 0,
      icon: <ArrowUpRight size={24} />,
      subtitle: isDashboard ? getBreakdown('deliveredThisMonth') : 'Processed within selected dates'
    },
    {
      id: 'takenDownThisMonth',
      title: 'Taken Down in Period',
      value: isDashboard ? getAggregated('takenDownThisMonth') : stats?.takenDownThisMonth || 0,
      icon: <ArrowDownRight size={24} />,
      subtitle: isDashboard ? getBreakdown('takenDownThisMonth') : 'Removed within selected dates'
    }
  ];

  return (
    <div className="summary-cards-container">
      {cards.map(card => (
        <div 
          key={card.id}
          className={`summary-card ${!isDashboard && activeTab === card.id ? 'active' : ''}`}
          onClick={() => !isDashboard && setActiveTab(card.id)}
          style={isDashboard ? { cursor: 'default', transform: 'none', borderColor: 'var(--border-color)' } : {}}
        >
          <div className="card-header">
            <h3 className="card-title">{card.title}</h3>
            <div className="card-icon">{card.icon}</div>
          </div>
          <div className="card-value">{card.value}</div>
          <div className="card-subtitle">{card.subtitle}</div>
        </div>
      ))}
    </div>
  );
};

export default SummaryCards;
