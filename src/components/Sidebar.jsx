import React, { useState } from 'react';
import {
  LayoutDashboard,
  Settings,
  Music,
  Video,
  ChevronLeft,
  ChevronRight,
  Files,
  Shield,
  LogOut,
  Bell,
  Search,
} from 'lucide-react';

const Sidebar = ({ activePage, setActivePage, authUser, reportsNotificationCount = 0, onLogout }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo-container">
        {!isCollapsed ? (
          <img src="/hungama_logo.png" alt="Hungama" className="logo-img" style={{ height: '32px', width: 'auto' }} />
        ) : (
          <img src="/triangle_logo.png" alt="Hungama" className="logo-img-collapsed" style={{ height: '32px', width: 'auto' }} />
        )}
      </div>

      <button
        className="collapse-btn"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
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
          className={`nav-item ${activePage === 'reports' ? 'active' : ''}`}
          onClick={() => setActivePage('reports')}
        >
          <Files size={20} />
          <span className="nav-text">Reports</span>
          {reportsNotificationCount > 0 ? (
            <span className="admin-badge" title="New report/admin notifications">
              <Bell size={12} /> {reportsNotificationCount}
            </span>
          ) : null}
        </button>

        <button
          className={`nav-item ${activePage === 'search' ? 'active' : ''}`}
          onClick={() => setActivePage('search')}
        >
          <Search size={20} />
          <span className="nav-text">Search Contents</span>
        </button>


        {authUser?.role === 'admin' ? (
          <button
            className={`nav-item ${activePage === 'admin' ? 'active' : ''}`}
            onClick={() => setActivePage('admin')}
          >
            <Shield size={20} />
            <span className="nav-text">Admin</span>
          </button>
        ) : null}

        <button
          className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
          onClick={() => setActivePage('settings')}
        >
          <Settings size={20} />
          <span className="nav-text">Settings</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        {authUser ? <p className="sidebar-user">{authUser.username}</p> : null}
        <button className="logout-btn" onClick={onLogout}>
          <LogOut size={14} /> {!isCollapsed ? 'Logout' : ''}
        </button>
        <p className="sidebar-version">{isCollapsed ? 'v1.3' : 'v1.3.0 DDEX'}</p>
      </div>
    </aside>
  );
};

export default Sidebar;
