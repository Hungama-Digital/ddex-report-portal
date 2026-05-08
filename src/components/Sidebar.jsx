import React, { useState } from 'react';
import { LayoutDashboard, Settings, Music, Video, ChevronLeft, ChevronRight } from 'lucide-react';

const Sidebar = ({ activePage, setActivePage }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo-container">
        <svg width="120" height="35" viewBox="0 0 160 45" xmlns="http://www.w3.org/2000/svg" className="logo-svg">
          <defs>
            <linearGradient id="sidebar-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00aae7" />
              <stop offset="40%" stopColor="#8cc63f" />
              <stop offset="70%" stopColor="#f7931e" />
              <stop offset="100%" stopColor="#f15a24" />
            </linearGradient>
          </defs>
          <path d="M 6 10 L 34 22 L 6 34 Z" fill="none" stroke="url(#sidebar-logo-grad)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
          <text x="46" y="30" fontFamily="'Inter', sans-serif" fontSize="26" fontWeight="800" fill="#007bb5" letterSpacing="-0.5px" className="logo-text">hungama</text>
        </svg>
      </div>

      <button 
        className="collapse-btn" 
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <nav className="sidebar-nav">
        <button 
          className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActivePage('dashboard')}
        >
          <LayoutDashboard size={20} />
          <span className="nav-text">Dashboard</span>
        </button>
        
        <button 
          className={`nav-item ${activePage === 'audio-reports' ? 'active' : ''}`}
          onClick={() => setActivePage('audio-reports')}
        >
          <Music size={20} />
          <span className="nav-text">Audio Reports</span>
        </button>

        <button 
          className={`nav-item ${activePage === 'video-reports' ? 'active' : ''}`}
          onClick={() => setActivePage('video-reports')}
        >
          <Video size={20} />
          <span className="nav-text">Video Reports</span>
        </button>
        
        <button 
          className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
          onClick={() => setActivePage('settings')}
        >
          <Settings size={20} />
          <span className="nav-text">Settings</span>
        </button>
      </nav>
      
      <div className="sidebar-footer">
        <p className="sidebar-version">
          {isCollapsed ? "v1.2" : "v1.2.0 DDEX"}
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
