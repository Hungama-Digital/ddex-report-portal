import React, { useState, useMemo, useEffect } from 'react';
import './App.css';
import { audioContents, videoContents } from './data/mockData';
import FilterBar from './components/FilterBar';
import SummaryCards from './components/SummaryCards';
import ContentTable from './components/ContentTable';
import DashboardCharts from './components/DashboardCharts';
import Sidebar from './components/Sidebar';
import { Sun, Moon } from 'lucide-react';

function App() {
  const [selectedPartner, setSelectedPartner] = useState('all');
  const [startDate, setStartDate] = useState('2026-05-01');
  const [endDate, setEndDate] = useState('2026-05-31');
  const [activeTab, setActiveTab] = useState('totalLive');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');

  // Apply theme class to body
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
  }, [isDarkMode]);

  const { totalLiveArr, deliveredArr, takenDownArr } = useMemo(() => {
    let data = activePage === 'video-reports' ? videoContents : audioContents;
    if (selectedPartner !== 'all') {
      data = data.filter(item => item.partner === selectedPartner);
    }
    
    const end = new Date(endDate);
    const start = new Date(startDate);

    // Total Live: Ignore date filters, show ALL live content for the selected partner
    const live = data.filter(item => item.isLive);

    // Delivered in range: releaseDate >= startDate AND releaseDate <= endDate AND deliveredThisMonth AND not taken down
    const delivered = data.filter(item => {
      const itemDate = new Date(item.releaseDate);
      return itemDate >= start && itemDate <= end && item.deliveredThisMonth && item.status !== 'Taken Down';
    });

    // Taken Down in range
    const takenDown = data.filter(item => {
      const itemDate = new Date(item.releaseDate);
      return itemDate >= start && itemDate <= end && item.takenDownThisMonth;
    });

    return { totalLiveArr: live, deliveredArr: delivered, takenDownArr: takenDown };
  }, [selectedPartner, startDate, endDate, activePage]);

  const stats = {
    totalLive: totalLiveArr.length,
    deliveredThisMonth: deliveredArr.length,
    takenDownThisMonth: takenDownArr.length
  };

  const dashboardStats = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const calculateStats = (dataList) => {
      let list = dataList;
      if (selectedPartner !== 'all') {
        list = list.filter(item => item.partner === selectedPartner);
      }
      return {
        totalLive: list.filter(item => item.isLive).length,
        deliveredThisMonth: list.filter(item => {
          const d = new Date(item.releaseDate);
          return d >= start && d <= end && item.deliveredThisMonth && item.status !== 'Taken Down';
        }).length,
        takenDownThisMonth: list.filter(item => {
          const d = new Date(item.releaseDate);
          return d >= start && d <= end && item.takenDownThisMonth;
        }).length
      };
    };

    return {
      audio: calculateStats(audioContents),
      video: calculateStats(videoContents)
    };
  }, [selectedPartner, startDate, endDate]);

  const tableContents = useMemo(() => {
    switch (activeTab) {
      case 'totalLive': return totalLiveArr;
      case 'deliveredThisMonth': return deliveredArr;
      case 'takenDownThisMonth': return takenDownArr;
      default: return totalLiveArr;
    }
  }, [activeTab, totalLiveArr, deliveredArr, takenDownArr]);

  return (
    <div className="layout-container">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      
      <main className="main-content">
        <header className="app-header">
          <div className="header-text-container">
            <h1 className="app-title-main">
              {activePage === 'dashboard' ? 'Content Delivery Reports Dashboard' : 
               activePage === 'audio-reports' ? 'Audio Reports' : 
               activePage === 'video-reports' ? 'Video Reports' : 'Settings'}
            </h1>
            <span className="app-subtitle">
              {activePage === 'dashboard' ? 'DDEX REPOSITORY' : 
               (activePage === 'audio-reports' || activePage === 'video-reports') ? 'DATA EXPORT & ANALYSIS' : 'PREFERENCES & CONFIGURATION'}
            </span>
          </div>
          <button 
            className="theme-toggle-btn"
            onClick={() => setIsDarkMode(!isDarkMode)}
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </header>

        {activePage === 'dashboard' ? (
          <div className="dashboard-content">
            <DashboardCharts 
              dashboardStats={dashboardStats} 
            />
          </div>
        ) : (activePage === 'audio-reports' || activePage === 'video-reports') ? (
          <div className="dashboard-content">
            <FilterBar 
              selectedPartner={selectedPartner}
              setSelectedPartner={setSelectedPartner}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              activePage={activePage}
            />

            <SummaryCards 
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              stats={stats}
            />

            <ContentTable 
              activeTab={activeTab}
              filteredContents={tableContents}
              activePage={activePage}
            />
          </div>
        ) : (
          <div className="settings-container">
            <div className="settings-card">
              <h2>Theme Preferences</h2>
              <div className="setting-row">
                <div>
                  <span className="setting-label">Dark Mode</span>
                  <p className="setting-desc">Enable or disable the sleek dark theme.</p>
                </div>
                <button 
                  className={`toggle-switch ${isDarkMode ? 'active' : ''}`}
                  onClick={() => setIsDarkMode(!isDarkMode)}
                >
                  <div className="toggle-thumb"></div>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
