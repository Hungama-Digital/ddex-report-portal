import React from 'react';
import { Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const SummaryCards = ({ activeTab, setActiveTab, stats }) => {
  const cards = [
    {
      id: 'totalLive',
      title: 'Total Content Live',
      value: stats.totalLive,
      icon: <Activity size={24} />,
      subtitle: 'Overall cumulative count'
    },
    {
      id: 'deliveredThisMonth',
      title: 'Delivered in Period',
      value: stats.deliveredThisMonth,
      icon: <ArrowUpRight size={24} />,
      subtitle: 'Processed within selected dates'
    },
    {
      id: 'takenDownThisMonth',
      title: 'Taken Down in Period',
      value: stats.takenDownThisMonth,
      icon: <ArrowDownRight size={24} />,
      subtitle: 'Removed within selected dates'
    }
  ];

  return (
    <div className="summary-cards-container">
      {cards.map(card => (
        <div 
          key={card.id}
          className={`summary-card ${activeTab === card.id ? 'active' : ''}`}
          onClick={() => setActiveTab(card.id)}
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
