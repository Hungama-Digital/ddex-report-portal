import React, { useState, useEffect } from 'react';
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
  X,
  User
} from 'lucide-react';

const Sidebar = ({ activePage, setActivePage, authUser, reportsNotificationCount = 0, onLogout, isOpen, onClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Close mobile menu on page change
  const handlePageChange = (page) => {
    setActivePage(page);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}
      
      <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo-container">
          {!isCollapsed ? (
            <img src="/hungama_logo.png" alt="Hungama" className="logo-img" />
          ) : (
            <img src="/triangle_logo.png" alt="Hungama" className="logo-img-collapsed" />
          )}
          {isOpen && (
            <button className="mobile-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
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
            onClick={() => handlePageChange('dashboard')}
          >
            <LayoutDashboard size={20} />
            <span className="nav-text">Dashboard</span>
          </button>

          <button
            className={`nav-item ${activePage === 'audio-reports' ? 'active' : ''}`}
            onClick={() => handlePageChange('audio-reports')}
          >
            <Music size={20} />
            <span className="nav-text">Audio Reports</span>
          </button>

          <button
            className={`nav-item ${activePage === 'video-reports' ? 'active' : ''}`}
            onClick={() => handlePageChange('video-reports')}
          >
            <Video size={20} />
            <span className="nav-text">Video Reports</span>
          </button>

          <button
            className={`nav-item ${activePage === 'reports' ? 'active' : ''}`}
            onClick={() => handlePageChange('reports')}
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
            onClick={() => handlePageChange('search')}
          >
            <Search size={20} />
            <span className="nav-text">Search Contents</span>
          </button>


          {authUser?.role === 'admin' ? (
            <button
              className={`nav-item ${activePage === 'admin' ? 'active' : ''}`}
              onClick={() => handlePageChange('admin')}
            >
              <Shield size={20} />
              <span className="nav-text">Admin</span>
            </button>
          ) : null}

          <button
            className={`nav-item ${activePage === 'settings' ? 'active' : ''}`}
            onClick={() => handlePageChange('settings')}
          >
            <Settings size={20} />
            <span className="nav-text">Settings</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          {authUser && (
            <div className={`user-profile-card ${isCollapsed ? 'collapsed' : ''} mobile-only-profile`}>
              <div className="user-avatar">
                <User size={18} />
              </div>
              {!isCollapsed && (
                <div className="user-info">
                  <span className="user-name">{authUser.username}</span>
                  <span className="user-role">{authUser.role || 'Member'}</span>
                </div>
              )}
            </div>
          )}
          <button className="logout-btn" onClick={onLogout} title="Logout">
            <LogOut size={16} /> {!isCollapsed ? 'Logout' : ''}
          </button>

          <p className="sidebar-version">{isCollapsed ? 'v1.3' : 'v1.3.0 DDEX'}</p>
          {!isCollapsed && (
            <div className="sidebar-copyright">
              Copyright©{new Date().getFullYear()} Hungama Digital Media Entertainment Pvt. Ltd. All Right Reserved.
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
