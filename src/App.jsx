import { useState, useMemo, useEffect } from 'react';
import './App.css';
import { audioContents, videoContents, audioPartners } from './data/mockData';
import FilterBar from './components/FilterBar';
import SummaryCards from './components/SummaryCards';
import ContentTable from './components/ContentTable';
import DashboardCharts from './components/DashboardCharts';
import Sidebar from './components/Sidebar';
import { Sun, Moon } from 'lucide-react';
import { fetchAudioPartnerSummary, fetchAudioRecentDeliveries } from './services/metricsApi';
import { getPartnerDisplayName } from './utils/partnerDisplay';

const EMPTY_AUDIO_SUMMARY = {
  queryKey: null,
  status: 'idle', // idle | success | error
  error: null,
  metasea: 0,
  partnerDb: 0,
  total: 0,
  deliveredInPeriod: 0,
  takenDownInPeriod: 0,
};

const EMPTY_RECENT_DELIVERIES = {
  queryKey: null,
  status: 'idle', // idle | success | error
  error: null,
  rows: [],
};

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}

function App() {
  const [selectedPartner, setSelectedPartner] = useLocalStorage('ddex_partner', 'all');
  const [startDate, setStartDate] = useLocalStorage('ddex_startDate', '2026-05-01');
  const [endDate, setEndDate] = useLocalStorage('ddex_endDate', '2026-05-31');
  const [activeTab, setActiveTab] = useLocalStorage('ddex_activeTab', 'totalLive');
  const [isDarkMode, setIsDarkMode] = useLocalStorage('ddex_darkMode', false);
  const [activePage, setActivePage] = useLocalStorage('ddex_activePage', 'dashboard');
  const [dashboardMode, setDashboardMode] = useLocalStorage('ddex_dashboardMode', 'combined');
  const [audioSummary, setAudioSummary] = useState(EMPTY_AUDIO_SUMMARY);
  const [recentDeliveriesState, setRecentDeliveriesState] = useState(
    EMPTY_RECENT_DELIVERIES,
  );

  const audioPartnerIdSet = useMemo(
    () => new Set(audioPartners.map((partner) => partner.id)),
    [],
  );

  const isAudioPartnerSelected =
    selectedPartner !== 'all' && audioPartnerIdSet.has(selectedPartner);
  const isAllAudioPartnersSelected = selectedPartner === 'all';
  const isAudioSelectionSupported = isAllAudioPartnersSelected || isAudioPartnerSelected;
  const shouldLoadAudioMetrics =
    (activePage === 'audio-reports' ||
      (activePage === 'dashboard' && dashboardMode !== 'video')) &&
    isAudioSelectionSupported;

  const recentDeliveriesPartner = useMemo(() => {
    if (dashboardMode === 'video') {
      return null;
    }

    if (selectedPartner === 'all') {
      return 'all';
    }

    if (isAudioPartnerSelected) {
      return selectedPartner;
    }

    return null;
  }, [dashboardMode, selectedPartner, isAudioPartnerSelected]);

  const currentAudioSummaryKey = useMemo(() => {
    if (!shouldLoadAudioMetrics) {
      return null;
    }
    return `${selectedPartner}|${startDate}|${endDate}|audio-summary`;
  }, [shouldLoadAudioMetrics, selectedPartner, startDate, endDate]);

  const currentRecentDeliveriesKey = useMemo(() => {
    if (!recentDeliveriesPartner) {
      return null;
    }

    return `${recentDeliveriesPartner}|${startDate}|${endDate}|10`;
  }, [recentDeliveriesPartner, startDate, endDate]);

  const isAudioSummaryLoading =
    Boolean(currentAudioSummaryKey) &&
    audioSummary.queryKey === currentAudioSummaryKey &&
    audioSummary.status === 'loading';

  const isAudioSummaryReady =
    audioSummary.queryKey === currentAudioSummaryKey &&
    audioSummary.status === 'success';

  const audioSummaryError =
    audioSummary.queryKey === currentAudioSummaryKey &&
    audioSummary.status === 'error'
      ? audioSummary.error
      : null;

  const liveBreakdown = isAudioSummaryReady
    ? {
        isLiveData: true,
        metasea: audioSummary.metasea,
        partnerDb: audioSummary.partnerDb,
      }
    : null;

  // Apply theme class to body
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!currentAudioSummaryKey) {
      return;
    }

    const abortController = new AbortController();
    setAudioSummary((previous) => ({
      ...previous,
      queryKey: currentAudioSummaryKey,
      status: 'loading',
      error: null,
    }));

    const summaryPromise = isAllAudioPartnersSelected
      ? Promise.all(
          audioPartners.map((partner) =>
            fetchAudioPartnerSummary({
              partner: partner.id,
              startDate,
              endDate,
              signal: abortController.signal,
            }),
          ),
        ).then((responses) => {
          const summaries = responses.filter(Boolean);
          return summaries.reduce(
            (acc, item) => ({
              metasea: acc.metasea + (Number(item.metasea) || 0),
              partnerDb: acc.partnerDb + (Number(item.partnerDb) || 0),
              total: acc.total + (Number(item.total) || 0),
              deliveredInPeriod:
                acc.deliveredInPeriod + (Number(item.deliveredInPeriod) || 0),
              takenDownInPeriod:
                acc.takenDownInPeriod + (Number(item.takenDownInPeriod) || 0),
            }),
            {
              metasea: 0,
              partnerDb: 0,
              total: 0,
              deliveredInPeriod: 0,
              takenDownInPeriod: 0,
            },
          );
        })
      : fetchAudioPartnerSummary({
          partner: selectedPartner,
          startDate,
          endDate,
          signal: abortController.signal,
        });

    summaryPromise
      .then((response) => {
        if (abortController.signal.aborted) {
          return;
        }

        const summary = response || EMPTY_AUDIO_SUMMARY;
        setAudioSummary({
          queryKey: currentAudioSummaryKey,
          status: 'success',
          error: null,
          metasea: Number(summary.metasea) || 0,
          partnerDb: Number(summary.partnerDb) || 0,
          total: Number(summary.total) || 0,
          deliveredInPeriod: Number(summary.deliveredInPeriod) || 0,
          takenDownInPeriod: Number(summary.takenDownInPeriod) || 0,
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted || error?.name === 'AbortError') {
          return;
        }

        setAudioSummary({
          ...EMPTY_AUDIO_SUMMARY,
          queryKey: currentAudioSummaryKey,
          status: 'error',
          error: error?.message || 'Unable to load audio partner metrics.',
        });
      });

    return () => {
      abortController.abort();
    };
  }, [
    currentAudioSummaryKey,
    selectedPartner,
    startDate,
    endDate,
    isAllAudioPartnersSelected,
  ]);

  const { totalLiveArr, deliveredArr, takenDownArr } = useMemo(() => {
    let data = activePage === 'video-reports' ? videoContents : audioContents;
    if (selectedPartner !== 'all') {
      data = data.filter((item) => item.partner === selectedPartner);
    }

    const end = new Date(endDate);
    const start = new Date(startDate);

    // Kept for table rows and fallback rendering
    const live = data.filter((item) => item.isLive);
    const delivered = data.filter((item) => {
      const itemDate = new Date(item.releaseDate);
      return (
        itemDate >= start &&
        itemDate <= end &&
        item.deliveredThisMonth &&
        item.status !== 'Taken Down'
      );
    });
    const takenDown = data.filter((item) => {
      const itemDate = new Date(item.releaseDate);
      return itemDate >= start && itemDate <= end && item.takenDownThisMonth;
    });

    return { totalLiveArr: live, deliveredArr: delivered, takenDownArr: takenDown };
  }, [selectedPartner, startDate, endDate, activePage]);

  const shouldUseDbMetricsForAudio =
    Boolean(currentAudioSummaryKey) && isAudioSummaryReady;

  useEffect(() => {
    if (!currentRecentDeliveriesKey || !recentDeliveriesPartner) {
      return;
    }

    const abortController = new AbortController();
    setRecentDeliveriesState((previous) => ({
      ...previous,
      queryKey: currentRecentDeliveriesKey,
      status: 'loading',
      error: null,
      rows: [],
    }));

    fetchAudioRecentDeliveries({
      partner: recentDeliveriesPartner,
      startDate,
      endDate,
      limit: 10,
      signal: abortController.signal,
    })
      .then((response) => {
        if (abortController.signal.aborted) {
          return;
        }

        setRecentDeliveriesState({
          queryKey: currentRecentDeliveriesKey,
          status: 'success',
          error: null,
          rows: response.rows,
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted || error?.name === 'AbortError') {
          return;
        }

        setRecentDeliveriesState({
          queryKey: currentRecentDeliveriesKey,
          status: 'error',
          error: error?.message || 'Unable to load recent deliveries.',
          rows: [],
        });
      });

    return () => {
      abortController.abort();
    };
  }, [currentRecentDeliveriesKey, recentDeliveriesPartner, startDate, endDate]);

  const stats = {
    totalLive: shouldUseDbMetricsForAudio ? audioSummary.total : 0,
    deliveredThisMonth: shouldUseDbMetricsForAudio
      ? audioSummary.deliveredInPeriod
      : 0,
    takenDownThisMonth: shouldUseDbMetricsForAudio
      ? audioSummary.takenDownInPeriod
      : 0,
  };

  const dashboardStats = useMemo(() => {
    const computedStats = {
      audio: {
        totalLive: 0,
        deliveredThisMonth: 0,
        takenDownThisMonth: 0,
      },
      video: {
        totalLive: 0,
        deliveredThisMonth: 0,
        takenDownThisMonth: 0,
      },
    };

    if (!shouldUseDbMetricsForAudio) {
      return computedStats;
    }

    return {
      ...computedStats,
      audio: {
        totalLive: audioSummary.total,
        deliveredThisMonth: audioSummary.deliveredInPeriod,
        takenDownThisMonth: audioSummary.takenDownInPeriod,
      },
    };
  }, [
    shouldUseDbMetricsForAudio,
    audioSummary.total,
    audioSummary.deliveredInPeriod,
    audioSummary.takenDownInPeriod,
  ]);

  const mockRecentDeliveries = useMemo(() => {
    const combined =
      dashboardMode === 'combined'
        ? [...audioContents, ...videoContents]
        : dashboardMode === 'audio'
          ? [...audioContents]
          : [...videoContents];

    const filteredByPartner =
      selectedPartner === 'all'
        ? combined
        : combined.filter((item) => item.partner === selectedPartner);

    const delivered = filteredByPartner.filter(
      (item) => item.deliveredThisMonth && item.status !== 'Taken Down',
    );
    delivered.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
    return delivered.slice(0, 10).map((item) => ({
      id: item.id,
      partner: item.partner,
      albumId: item.albumId || item.id,
      batchId: '-',
      ddexType: item.status === 'Delivered' ? 'AUDIO_ALBUM_INSERT' : item.status,
      addedOn: `${item.releaseDate} 00:00:00`,
      updatedOn: '',
      trackCount: 0,
    }));
  }, [dashboardMode, selectedPartner]);

  const shouldUseLiveRecentDeliveries =
    dashboardMode !== 'video' &&
    Boolean(currentRecentDeliveriesKey) &&
    recentDeliveriesState.queryKey === currentRecentDeliveriesKey &&
    recentDeliveriesState.status === 'success';

  const isRecentDeliveriesLoading =
    dashboardMode !== 'video' &&
    Boolean(currentRecentDeliveriesKey) &&
    recentDeliveriesState.queryKey === currentRecentDeliveriesKey &&
    recentDeliveriesState.status === 'loading';

  const recentDeliveriesError =
    dashboardMode !== 'video' &&
    Boolean(currentRecentDeliveriesKey) &&
    recentDeliveriesState.queryKey === currentRecentDeliveriesKey &&
    recentDeliveriesState.status === 'error'
      ? recentDeliveriesState.error
      : null;

  const recentDeliveries = shouldUseLiveRecentDeliveries
    ? recentDeliveriesState.rows
    : mockRecentDeliveries;

  const tableContents = useMemo(() => {
    switch (activeTab) {
      case 'totalLive':
        return totalLiveArr;
      case 'deliveredThisMonth':
        return deliveredArr;
      case 'takenDownThisMonth':
        return takenDownArr;
      default:
        return totalLiveArr;
    }
  }, [activeTab, totalLiveArr, deliveredArr, takenDownArr]);

  const shouldShowAudioMetricsLoading =
    Boolean(currentAudioSummaryKey) &&
    isAudioSummaryLoading &&
    (activePage === 'audio-reports' ||
      (activePage === 'dashboard' && dashboardMode !== 'video'));

  const shouldShowAudioMetricsError =
    Boolean(currentAudioSummaryKey) &&
    audioSummaryError &&
    (activePage === 'audio-reports' ||
      (activePage === 'dashboard' && dashboardMode !== 'video'))
      ? audioSummaryError
      : null;

  return (
    <div className="layout-container">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />

      <main className="main-content">
        <header className="app-header">
          <div className="header-text-container">
            <h1 className="app-title-main">
              {activePage === 'dashboard'
                ? 'Content Delivery Reports Dashboard'
                : activePage === 'audio-reports'
                  ? 'Audio Reports'
                  : activePage === 'video-reports'
                    ? 'Video Reports'
                    : 'Settings'}
            </h1>
            <span className="app-subtitle">
              {activePage === 'dashboard'
                ? 'DDEX REPOSITORY'
                : activePage === 'audio-reports' || activePage === 'video-reports'
                  ? 'DATA EXPORT & ANALYSIS'
                  : 'PREFERENCES & CONFIGURATION'}
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
            <FilterBar
              selectedPartner={selectedPartner}
              setSelectedPartner={setSelectedPartner}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              activePage={activePage}
              dashboardMode={dashboardMode}
            />

            <div className="dashboard-toggle-wrapper">
              <div className="dashboard-toggle">
                <button
                  className={`toggle-btn ${dashboardMode === 'combined' ? 'active' : ''}`}
                  onClick={() => setDashboardMode('combined')}
                >
                  Combined
                </button>
                <button
                  className={`toggle-btn ${dashboardMode === 'audio' ? 'active' : ''}`}
                  onClick={() => setDashboardMode('audio')}
                >
                  Audio Only
                </button>
                <button
                  className={`toggle-btn ${dashboardMode === 'video' ? 'active' : ''}`}
                  onClick={() => setDashboardMode('video')}
                >
                  Video Only
                </button>
              </div>
            </div>

            <SummaryCards
              dashboardStats={dashboardStats}
              activeTab={activeTab}
              setActiveTab={() => {}}
              isDashboard={true}
              dashboardMode={dashboardMode}
              liveBreakdown={dashboardMode !== 'video' ? liveBreakdown : null}
              metricsLoading={shouldShowAudioMetricsLoading}
              metricsError={shouldShowAudioMetricsError}
              startDate={startDate}
              endDate={endDate}
            />

            <DashboardCharts dashboardStats={dashboardStats} dashboardMode={dashboardMode} />

            <div className="recent-deliveries-container">
              <h3 className="section-title">Recent Deliveries</h3>
              <div className="table-wrapper" style={{ marginTop: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Partner</th>
                      <th>Album ID</th>
                      <th>Delivery Type</th>
                      <th>Added On</th>
                      <th>Batch ID</th>
                      <th>Tracks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isRecentDeliveriesLoading ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '1rem' }}>
                          Loading recent deliveries...
                        </td>
                      </tr>
                    ) : recentDeliveriesError ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '1rem', color: '#b91c1c' }}>
                          {recentDeliveriesError}
                        </td>
                      </tr>
                    ) : recentDeliveries.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '1rem' }}>
                          No deliveries found for selected filters.
                        </td>
                      </tr>
                    ) : (
                      recentDeliveries.map((item) => (
                        <tr key={item.id}>
                          <td>{getPartnerDisplayName(item.partner)}</td>
                          <td style={{ fontWeight: 500 }}>{item.albumId || '-'}</td>
                          <td>{item.ddexType || '-'}</td>
                          <td>{item.addedOn || '-'}</td>
                          <td>{item.batchId || '-'}</td>
                          <td>{item.trackCount || 0}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activePage === 'audio-reports' || activePage === 'video-reports' ? (
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
              liveBreakdown={activePage === 'audio-reports' ? liveBreakdown : null}
              metricsLoading={activePage === 'audio-reports' ? shouldShowAudioMetricsLoading : false}
              metricsError={activePage === 'audio-reports' ? shouldShowAudioMetricsError : null}
              startDate={startDate}
              endDate={endDate}
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
