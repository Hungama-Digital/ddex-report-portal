import { useState, useMemo, useEffect } from 'react';
import './App.css';
import { audioContents, videoContents, audioPartners } from './data/mockData';
import FilterBar from './components/FilterBar';
import SummaryCards from './components/SummaryCards';
import ContentTable from './components/ContentTable';
import DashboardCharts from './components/DashboardCharts';
import Sidebar from './components/Sidebar';
import { Sun, Moon, Search } from 'lucide-react';
import {
  fetchAudioDetailsRows,
  fetchAudioPartnerSummary,
  fetchAudioPartnerTotalContentLive,
  fetchAudioRecentDeliveries,
  isValidDateInput,
} from './services/metricsApi';
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

const EMPTY_AUDIO_DETAILS_ROWS = {
  queryKey: null,
  status: 'idle',
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
  const [audioDetailsRowsState, setAudioDetailsRowsState] = useState(
    EMPTY_AUDIO_DETAILS_ROWS,
  );
  const [dashboardRecentSearchTerm, setDashboardRecentSearchTerm] = useState('');

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
  const hasValidDateRange =
    isValidDateInput(startDate) &&
    isValidDateInput(endDate) &&
    new Date(`${startDate}T00:00:00Z`) <= new Date(`${endDate}T00:00:00Z`);

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

    return `${recentDeliveriesPartner}|${startDate}|${endDate}|20`;
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

    const allPartnersPromise = isAllAudioPartnersSelected
      ? Promise.all(
          audioPartners.map((partner) =>
            hasValidDateRange
              ? fetchAudioPartnerSummary({
                  partner: partner.id,
                  startDate,
                  endDate,
                  signal: abortController.signal,
                })
              : fetchAudioPartnerTotalContentLive({
                  partner: partner.id,
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
      : hasValidDateRange
        ? fetchAudioPartnerSummary({
            partner: selectedPartner,
            startDate,
            endDate,
            signal: abortController.signal,
          })
        : fetchAudioPartnerTotalContentLive({
            partner: selectedPartner,
            signal: abortController.signal,
          }).then((item) => ({
            ...item,
            deliveredInPeriod: 0,
            takenDownInPeriod: 0,
          }));

    allPartnersPromise
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
    hasValidDateRange,
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
    if (!hasValidDateRange) {
      setRecentDeliveriesState({
        queryKey: currentRecentDeliveriesKey,
        status: 'success',
        error: null,
        rows: [],
      });
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
      limit: 20,
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
  }, [currentRecentDeliveriesKey, recentDeliveriesPartner, startDate, endDate, hasValidDateRange]);

  const currentAudioDetailsKey = useMemo(() => {
    if (activePage !== 'audio-reports' || !isAudioSelectionSupported) {
      return null;
    }
    return `${selectedPartner}|${activeTab}|${startDate}|${endDate}|audio-details`;
  }, [activePage, isAudioSelectionSupported, selectedPartner, activeTab, startDate, endDate]);

  const detailsLimit = useMemo(() => {
    const byTab = {
      totalLive: Number(audioSummary.partnerDb) || 0,
      deliveredThisMonth: Number(audioSummary.deliveredInPeriod) || 0,
      takenDownThisMonth: Number(audioSummary.takenDownInPeriod) || 0,
    };
    const raw = byTab[activeTab] || 0;
    const withBuffer = raw > 0 ? raw + 500 : 10000;
    return Math.max(10000, Math.min(withBuffer, 300000));
  }, [
    activeTab,
    audioSummary.partnerDb,
    audioSummary.deliveredInPeriod,
    audioSummary.takenDownInPeriod,
  ]);

  useEffect(() => {
    if (!currentAudioDetailsKey) {
      return;
    }

    const detailTypeByTab = {
      totalLive: 'live',
      deliveredThisMonth: 'delivered',
      takenDownThisMonth: 'takedown',
    };
    const detailType = detailTypeByTab[activeTab] || 'live';
    if (detailType !== 'live' && !hasValidDateRange) {
      setAudioDetailsRowsState({
        queryKey: currentAudioDetailsKey,
        status: 'success',
        error: null,
        rows: [],
      });
      return;
    }

    const abortController = new AbortController();
    setAudioDetailsRowsState({
      queryKey: currentAudioDetailsKey,
      status: 'loading',
      error: null,
      rows: [],
    });

    fetchAudioDetailsRows({
      partner: selectedPartner,
      type: detailType,
      startDate,
      endDate,
      limit: detailsLimit,
      signal: abortController.signal,
    })
      .then((response) => {
        if (abortController.signal.aborted) {
          return;
        }

        setAudioDetailsRowsState({
          queryKey: currentAudioDetailsKey,
          status: 'success',
          error: null,
          rows: response.rows,
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted || error?.name === 'AbortError') {
          return;
        }

        setAudioDetailsRowsState({
          queryKey: currentAudioDetailsKey,
          status: 'error',
          error: error?.message || 'Unable to load detailed rows.',
          rows: [],
        });
      });

    return () => {
      abortController.abort();
    };
  }, [
    activeTab,
    selectedPartner,
    startDate,
    endDate,
    currentAudioDetailsKey,
    hasValidDateRange,
    detailsLimit,
  ]);

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
    : [];

  const dashboardRecentRows = useMemo(() => {
    const search = dashboardRecentSearchTerm.trim().toLowerCase();
    if (!search) {
      return recentDeliveries;
    }
    return recentDeliveries.filter((item) =>
      [
        item.albumId,
        item.albumName,
        item.upc,
        item.addedOn,
        item.updatedOn,
        item.batchId,
        item.trackIdsCsv,
        String(item.trackCount || 0),
      ]
        .join(' ')
        .toLowerCase()
        .includes(search),
    );
  }, [recentDeliveries, dashboardRecentSearchTerm]);

  const tableContents = useMemo(() => {
    if (activePage === 'audio-reports') {
      if (
        audioDetailsRowsState.queryKey === currentAudioDetailsKey &&
        audioDetailsRowsState.status === 'success'
      ) {
        return audioDetailsRowsState.rows;
      }
      return [];
    }

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
  }, [
    activePage,
    activeTab,
    totalLiveArr,
    deliveredArr,
    takenDownArr,
    audioDetailsRowsState.queryKey,
    audioDetailsRowsState.status,
    audioDetailsRowsState.rows,
    currentAudioDetailsKey,
  ]);

  const audioDetailsLoading =
    activePage === 'audio-reports' &&
    Boolean(currentAudioDetailsKey) &&
    audioDetailsRowsState.queryKey === currentAudioDetailsKey &&
    audioDetailsRowsState.status === 'loading';

  const audioDetailsError =
    activePage === 'audio-reports' &&
    Boolean(currentAudioDetailsKey) &&
    audioDetailsRowsState.queryKey === currentAudioDetailsKey &&
    audioDetailsRowsState.status === 'error'
      ? audioDetailsRowsState.error
      : null;

  const reportPartnerLabel = useMemo(() => {
    if (selectedPartner === 'all') {
      return 'All Partners';
    }
    return getPartnerDisplayName(selectedPartner);
  }, [selectedPartner]);

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
              <div className="table-actions" style={{ justifyContent: 'flex-end', marginTop: '0.6rem' }}>
                <div className="search-bar">
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search album, UPC, batch, tracks..."
                    value={dashboardRecentSearchTerm}
                    onChange={(event) => setDashboardRecentSearchTerm(event.target.value)}
                  />
                </div>
              </div>
              <div className="table-wrapper" style={{ marginTop: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Album ID</th>
                      <th>Album Name</th>
                      <th>UPC</th>
                      <th>Added On</th>
                      <th>Batch ID</th>
                      <th>Track IDs</th>
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
                    ) : dashboardRecentRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '1rem' }}>
                          No deliveries found for selected filters.
                        </td>
                      </tr>
                    ) : (
                      dashboardRecentRows.map((item) => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 500 }}>{item.albumId || '-'}</td>
                          <td>{item.albumName || '-'}</td>
                          <td>{item.upc || '-'}</td>
                          <td>{item.addedOn || '-'}</td>
                          <td>{item.batchId || '-'}</td>
                          <td>
                            <div className="track-ids-cell" title={item.trackIdsCsv || '-'}>
                              {item.trackIdsCsv || '-'}
                            </div>
                          </td>
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
              tableLoading={audioDetailsLoading}
              tableError={audioDetailsError}
              reportPartnerLabel={reportPartnerLabel}
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
